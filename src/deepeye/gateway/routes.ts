/**
 * DeepEyeClaw — API Routes
 *
 * Express router providing:
 *   POST /api/query     — main query endpoint (classify → route → respond)
 *   GET  /api/health    — provider health check
 *   GET  /api/analytics — dashboard analytics data
 *   GET  /api/budget    — budget status
 *   GET  /api/cache     — cache stats + entries
 *   POST /api/cache/clear — clear the cache
 *   GET  /api/config    — current config (sanitised)
 *   PUT  /api/config    — update config at runtime
 */

import { Router, type Request, type Response } from "express";
import { classifyQuery, shouldSkipCache, suggestCacheTtl } from "../query-classifier.js";
import { routeQuery, executeCascade } from "../smart-router.js";
import { getBudgetTracker } from "../budget-tracker.js";
import { estimateCost, computeActualCost } from "../cost-calculator.js";
import { getQualityEstimator } from "../quality-estimator.js";
import { getArtifactManager } from "../artifacts.js";
import type { BaseProvider, ChatResponse } from "../providers/base.js";
import type { SemanticCache } from "../cache/semantic.js";
import type { AnalyticsCollector } from "../analytics/collector.js";
import type { WebSocketHub } from "./websocket.js";
import type { ProviderName, ActualCost } from "../types.js";
import { DeepEyeClawError, BudgetExceededError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";
import { startTimer, uid, truncate } from "../utils/helpers.js";
import {
  recordQueryMetrics,
  recordEscalation,
  recordError as recordMetricError,
  queriesInFlight,
  updateBudgetMetrics,
  updateCacheMetrics,
  updateProviderHealth,
  getMetricsOutput,
} from "../metrics.js";

const log = childLogger("routes");

export interface RouteDeps {
  providers: Map<ProviderName, BaseProvider>;
  cache: SemanticCache;
  analytics: AnalyticsCollector;
  ws: WebSocketHub;
}

export function createRouter(deps: RouteDeps): Router {
  const router = Router();
  const { providers, cache, analytics, ws } = deps;
  const budget = getBudgetTracker();
  const qualityEstimator = getQualityEstimator();
  const artifactMgr = getArtifactManager();

  // ── POST /api/query ───────────────────────────────────────────────────

  router.post("/api/query", async (req: Request, res: Response) => {
    const elapsed = startTimer();
    const requestId = uid();
    const { content, systemPrompt, maxTokens, temperature, conversationHistory } = req.body ?? {};

    if (!content || typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }

    queriesInFlight.inc();

    try {
      // 1. Classify
      const classification = classifyQuery(content);
      log.info("classified", {
        requestId,
        complexity: classification.complexity,
        intent: classification.intent,
        realtime: classification.isRealtime,
      });

      // 2. Cache lookup
      if (!shouldSkipCache(classification)) {
        const hit = await cache.lookup(content);
        if (hit) {
          const ms = elapsed();
          const event = analytics.recordCacheHit(content, hit.entry.cost);
          ws.broadcastEvent(event);

          recordQueryMetrics({
            provider: hit.entry.provider,
            model: hit.entry.model,
            strategy: "cache",
            complexity: classification.complexity,
            intent: classification.intent,
            cacheHit: true,
            responseTimeMs: ms,
            costUsd: 0,
            inputTokens: 0,
            outputTokens: 0,
          });
          queriesInFlight.dec();

          res.json({
            id: requestId,
            content: hit.entry.response,
            provider: hit.entry.provider,
            model: hit.entry.model,
            cacheHit: true,
            similarity: hit.similarity,
            responseTimeMs: ms,
            cost: 0,
            tokens: { input: 0, output: 0, total: 0 },
          });
          return;
        }
      }

      // 3. Budget check
      if (budget.isEmergencyMode) {
        log.warn("emergency mode active", { requestId });
      }

      // 4. Route
      const decision = routeQuery(classification, {
        strategy: budget.isEmergencyMode ? "emergency" : undefined,
      });

      // 5. Get provider
      const provider = providers.get(decision.provider);
      if (!provider) {
        throw new DeepEyeClawError(
          `Provider ${decision.provider} not available`,
          "PROVIDER_UNAVAILABLE",
          503,
        );
      }

      // 6. Execute
      let response: ChatResponse;

      if (decision.strategy === "cascade" && decision.cascadeChain?.length) {
        // Cascade execution
        const result = await executeCascade<ChatResponse>({
          chain: decision.cascadeChain,
          run: async (prov, model) => {
            const p = providers.get(prov);
            if (!p) throw new DeepEyeClawError(`Provider ${prov} not available`, "PROVIDER_UNAVAILABLE", 503);
            return p.chat({ id: requestId, content, systemPrompt, maxTokens, temperature, conversationHistory }, model);
          },
          evaluate: (resp) => {
            return qualityEstimator.quickScore(resp, classification);
          },
          onStep: (step) => {
            log.debug("cascade step", { requestId, ...step });
            const nextStep = decision.cascadeChain![step.index + 1];
            artifactMgr.recordCascadeStep({
              queryId: requestId,
              query: classification,
              fromProvider: step.provider,
              fromModel: step.model,
              toProvider: nextStep?.provider,
              toModel: nextStep?.model,
              qualityScore: step.quality,
              qualityThreshold: decision.cascadeChain![step.index].qualityThreshold,
              cost: 0,
              isLast: !nextStep,
            });
            // Prometheus: record escalation if not the last step
            if (nextStep) {
              recordEscalation(step.provider, step.model, nextStep.provider, nextStep.model);
            }
          },
        });
        response = result.response;
      } else {
        // Direct execution
        response = await provider.chat(
          { id: requestId, content, systemPrompt, maxTokens, temperature, conversationHistory },
          decision.model,
        );
      }

      // 7. Record cost
      const actualCost: ActualCost = {
        provider: response.provider,
        model: response.model,
        inputTokens: response.tokens.input,
        outputTokens: response.tokens.output,
        totalCost: response.cost,
        timestamp: Date.now(),
      };
      budget.recordCost(actualCost);

      // 8. Cache store
      if (!shouldSkipCache(classification)) {
        const ttl = suggestCacheTtl(classification);
        await cache.store(content, response, ttl);
      }

      // 9. Analytics
      const ms = elapsed();
      const event = analytics.recordQuery({
        query: truncate(content),
        classification,
        routing: decision,
        cost: actualCost,
        responseTimeMs: ms,
        cacheHit: false,
      });
      ws.broadcastEvent(event);

      // Prometheus metrics
      recordQueryMetrics({
        provider: response.provider,
        model: response.model,
        strategy: decision.strategy,
        complexity: classification.complexity,
        intent: classification.intent,
        cacheHit: false,
        responseTimeMs: ms,
        costUsd: response.cost,
        inputTokens: response.tokens.input,
        outputTokens: response.tokens.output,
      });
      queriesInFlight.dec();

      // 10. Budget alerts
      const budgetStatus = budget.getStatus("daily");
      if (budgetStatus.percentUsed > 75) {
        ws.broadcastBudget(budgetStatus);
      }

      // 11. Response
      res.json({
        id: requestId,
        content: response.content,
        provider: response.provider,
        model: response.model,
        cacheHit: false,
        cost: response.cost,
        tokens: response.tokens,
        responseTimeMs: ms,
        citations: response.citations,
        classification: {
          complexity: classification.complexity,
          intent: classification.intent,
          isRealtime: classification.isRealtime,
        },
        routing: {
          strategy: decision.strategy,
          reason: decision.reason,
        },
      });
    } catch (err) {
      const ms = elapsed();
      const error = err instanceof DeepEyeClawError ? err : new DeepEyeClawError(
        (err as Error).message,
        "INTERNAL_ERROR",
        500,
      );

      analytics.recordError(truncate(content ?? ""), error.message, undefined);
      recordMetricError("unknown", error.code ?? "INTERNAL_ERROR");
      queriesInFlight.dec();
      log.error("query failed", { requestId, error: error.message, ms });

      res.status(error.statusCode).json(error.toJSON());
    }
  });

  // ── GET /api/health ───────────────────────────────────────────────────

  router.get("/api/health", async (_req: Request, res: Response) => {
    const health: Record<string, unknown> = {};

    for (const [name, provider] of providers) {
      const h = provider.getHealth();
      const live = await provider.healthCheck().catch(() => false);
      health[name] = { ...h, live };
    }

    res.json({
      status: "ok",
      providers: health,
      wsClients: ws.getConnectedClients(),
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  // ── GET /api/analytics ────────────────────────────────────────────────

  router.get("/api/analytics", (_req: Request, res: Response) => {
    const summary = analytics.getSummary();
    res.json(summary);
  });

  router.get("/api/analytics/events", (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const events = analytics.getEvents(limit, offset);
    res.json({ events, total: events.length });
  });

  // ── GET /api/budget ───────────────────────────────────────────────────

  router.get("/api/budget", (_req: Request, res: Response) => {
    const statuses = budget.getAllStatuses();
    res.json({
      statuses,
      emergencyMode: budget.isEmergencyMode,
      byProvider: budget.getCostByProvider("daily"),
      byModel: budget.getCostByModel("daily"),
    });
  });

  // ── GET /api/cache ────────────────────────────────────────────────────

  router.get("/api/cache", async (_req: Request, res: Response) => {
    const stats = cache.getStats();
    const entries = await cache.getAllEntries();
    res.json({
      stats,
      entries: entries.slice(0, 100).map((e) => ({
        queryHash: e.queryHash,
        queryText: truncate(e.queryText, 80),
        provider: e.provider,
        model: e.model,
        hitCount: e.hitCount,
        cost: e.cost,
        createdAt: e.createdAt,
        expiresAt: e.expiresAt,
      })),
    });
  });

  router.post("/api/cache/clear", async (_req: Request, res: Response) => {
    await cache.clear();
    res.json({ message: "cache cleared" });
  });

  // ── GET /api/config ───────────────────────────────────────────────────

  router.get("/api/config", (_req: Request, res: Response) => {
    const budgetConfig = budget.getAllStatuses();
    const cacheStats = cache.getStats();

    res.json({
      budget: budgetConfig,
      cache: cacheStats,
      providers: Array.from(providers.keys()),
      wsClients: ws.getConnectedClients(),
    });
  });

  // ── GET /api/artifacts ──────────────────────────────────────────────

  router.get("/api/artifacts", (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const type = req.query.type as string | undefined;
    const tag = req.query.tag as string | undefined;

    let artifacts;
    if (type) {
      artifacts = artifactMgr.getByType(type as any, limit);
    } else if (tag) {
      artifacts = artifactMgr.getByTag(tag, limit);
    } else {
      artifacts = artifactMgr.getRecent(limit);
    }

    res.json({
      artifacts,
      summary: artifactMgr.getSummary(),
    });
  });

  router.get("/api/artifacts/:queryId", (req: Request, res: Response) => {
    const queryId = req.params.queryId as string;
    const artifacts = artifactMgr.getByQueryId(queryId);
    res.json({ artifacts });
  });

  // ── GET /api/manager-view ───────────────────────────────────────────

  router.get("/api/manager-view", (_req: Request, res: Response) => {
    const providerStatuses: Record<string, { healthy: boolean; latencyMs: number; successRate: number }> = {};
    for (const [name, provider] of providers) {
      const health = provider.getHealth();
      providerStatuses[name] = {
        healthy: health.status === "healthy",
        latencyMs: health.latencyMs,
        successRate: health.totalRequests > 0
          ? (health.totalRequests - health.totalErrors) / health.totalRequests
          : 1,
      };
    }

    const dailyStatus = budget.getStatus("daily");

    res.json({
      recentArtifacts: artifactMgr.getRecent(10),
      artifactSummary: artifactMgr.getSummary(),
      metrics: {
        cacheHitRate: analytics.cacheHitRate(),
        avgResponseTime: analytics.avgResponseTime(),
        currentSpend: dailyStatus.spent,
        budgetRemaining: dailyStatus.remaining,
        emergencyMode: budget.isEmergencyMode,
        totalQueries: analytics.queryCount(),
      },
      providers: providerStatuses,
    });
  });

  // ── GET /metrics ─────────────────────────────────────────────────────

  router.get("/metrics", async (_req: Request, res: Response) => {
    // Update gauge snapshots before scrape
    const budgetStatuses = budget.getAllStatuses().map((s) => ({
      period: s.period,
      remaining: s.remaining,
      percentUsed: s.percentUsed,
    }));
    updateBudgetMetrics(budgetStatuses, budget.isEmergencyMode);

    const cacheStats = cache.getStats();
    updateCacheMetrics(cacheStats.totalEntries, analytics.cacheHitRate());

    for (const [name, provider] of providers) {
      const health = provider.getHealth();
      updateProviderHealth(name, health.status === "healthy");
    }

    const { body, contentType } = await getMetricsOutput();
    res.set("Content-Type", contentType);
    res.end(body);
  });

  return router;
}
