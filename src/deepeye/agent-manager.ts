/**
 * DeepEyeClaw — Agent Manager
 *
 * The orchestrator. Ties together all autonomous agents:
 *   - Cache Agent (semantic matching)
 *   - Cost Agent (budget enforcement)
 *   - Routing Agent (cascade logic + quality estimation)
 *   - Analytics Agent (event recording)
 *   - Artifact Agent (transparency)
 *
 * Agents work in parallel where possible. Not sequential.
 *
 * Flow:
 *   1. [Parallel] Cache check + Budget pre-check + Complexity analysis
 *   2. Cache hit? → return immediately
 *   3. Budget exceeded? → reject
 *   4. Cascade route → quality-evaluated escalation
 *   5. [Parallel] Cache store + Analytics log + Cost tracking
 *   6. Return response + artifacts
 */

import type { SemanticCache } from "./cache/semantic.js";
import type { ChatRequest, ChatResponse } from "./providers/base.js";
import type { BaseProvider } from "./providers/base.js";
import type { ClassifiedQuery, ProviderName, RoutingDecision } from "./types.js";
import { getAnalytics } from "./analytics/collector.js";
import { getArtifactManager, type RoutingArtifact } from "./artifacts.js";
import { getBudgetTracker } from "./budget-tracker.js";
import { computeActualCost } from "./cost-calculator.js";
import { getQualityEstimator } from "./quality-estimator.js";
import { classifyQuery } from "./query-classifier.js";
import { routeQuery, executeCascade } from "./smart-router.js";
import { BudgetExceededError } from "./utils/errors.js";
import { uid, startTimer } from "./utils/helpers.js";
import { childLogger } from "./utils/logger.js";

const log = childLogger("agent-manager");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentResponse {
  /** The AI response */
  response: ChatResponse;
  /** Query classification */
  classification: ClassifiedQuery;
  /** Routing decision */
  routing: RoutingDecision;
  /** Artifacts generated during processing */
  artifacts: RoutingArtifact[];
  /** Whether this came from cache */
  cacheHit: boolean;
  /** Total processing time (ms) */
  totalTimeMs: number;
}

export interface ManagerView {
  /** Recent artifacts (last 10) */
  recentArtifacts: RoutingArtifact[];
  /** Artifact summary */
  artifactSummary: {
    totalArtifacts: number;
    todayCount: number;
    byType: Record<string, number>;
    totalCostToday: number;
    cascadeEscalations: number;
    cacheHits: number;
    avgConfidence: number;
  };
  /** Agent health metrics */
  metrics: {
    cacheHitRate: number;
    avgResponseTime: number;
    currentSpend: number;
    budgetRemaining: number;
    emergencyMode: boolean;
    totalQueries: number;
    avgQualityScore: number;
  };
  /** Active providers */
  providers: Record<string, { healthy: boolean; latencyMs: number; successRate: number }>;
}

// ── Agent Manager ─────────────────────────────────────────────────────────────

export class AgentManager {
  private providers: Map<ProviderName, BaseProvider> = new Map();
  private cache: SemanticCache | null = null;
  private queryCount = 0;
  private totalQualityScore = 0;
  private qualityCount = 0;

  constructor() {
    log.info("Agent Manager initialized");
  }

  /** Register a provider */
  registerProvider(name: ProviderName, provider: BaseProvider): void {
    this.providers.set(name, provider);
    log.info(`Provider registered: ${name}`, { models: provider.getAvailableModels() });
  }

  /** Set the semantic cache */
  setCache(cache: SemanticCache): void {
    this.cache = cache;
    log.info("Semantic cache attached");
  }

  /**
   * Process a query through the full agent pipeline.
   * This is the main entry point.
   */
  async processQuery(
    content: string,
    opts?: { systemPrompt?: string; maxTokens?: number; temperature?: number },
  ): Promise<AgentResponse> {
    const queryId = uid();
    const elapsed = startTimer();
    const budget = getBudgetTracker();
    const analytics = getAnalytics();
    const artifactMgr = getArtifactManager();
    const quality = getQualityEstimator();
    const generatedArtifacts: RoutingArtifact[] = [];

    this.queryCount++;

    // ── 1. Parallel pre-processing ──────────────────────────────────────

    const [classification, cacheResult] = await Promise.all([
      Promise.resolve(classifyQuery(content)),
      this.cache?.lookup(content) ?? Promise.resolve(null),
    ]);

    // ── 2. Cache hit? Return immediately ────────────────────────────────

    if (cacheResult) {
      const cacheArtifact = artifactMgr.recordCacheHit({
        queryId,
        query: classification,
        similarity: cacheResult.similarity,
        savedCost: cacheResult.entry.cost,
        savedLatencyMs: elapsed(),
        provider: cacheResult.entry.provider,
        model: cacheResult.entry.model,
      });
      generatedArtifacts.push(cacheArtifact);

      analytics.recordCacheHit(content, cacheResult.entry.cost);

      const cachedResponse: ChatResponse = {
        id: queryId,
        content: cacheResult.entry.response,
        provider: cacheResult.entry.provider,
        model: cacheResult.entry.model,
        tokens: {
          input: 0,
          output: cacheResult.entry.tokensUsed,
          total: cacheResult.entry.tokensUsed,
        },
        cost: 0,
        responseTimeMs: elapsed(),
        cacheHit: true,
      };

      const routing = routeQuery(classification);

      return {
        response: cachedResponse,
        classification,
        routing,
        artifacts: generatedArtifacts,
        cacheHit: true,
        totalTimeMs: elapsed(),
      };
    }

    analytics.recordCacheMiss(content);

    // ── 3. Budget check ─────────────────────────────────────────────────

    const dailyStatus = budget.getStatus("daily");
    if (dailyStatus.percentUsed >= 100) {
      const rejectArtifact = artifactMgr.recordBudgetReject({
        queryId,
        query: classification,
        dailySpent: dailyStatus.spent,
        dailyLimit: dailyStatus.limit,
        estimatedCost: 0,
      });
      generatedArtifacts.push(rejectArtifact);

      throw new BudgetExceededError("daily", dailyStatus.spent, dailyStatus.limit);
    }

    // ── 4. Route the query ──────────────────────────────────────────────

    const routing = routeQuery(classification);
    const routeArtifact = artifactMgr.recordRouteDecision({
      queryId,
      query: classification,
      decision: routing,
    });
    generatedArtifacts.push(routeArtifact);

    // ── 5. Execute (cascade or direct) ──────────────────────────────────

    let response: ChatResponse;

    if (routing.strategy === "cascade" && routing.cascadeChain) {
      // Cascade execution with quality evaluation
      const cascadeResult = await executeCascade<ChatResponse>({
        chain: routing.cascadeChain,
        run: async (provider, model) => {
          const p = this.getProvider(provider);
          return p.chat(
            {
              id: queryId,
              content,
              systemPrompt: opts?.systemPrompt,
              maxTokens: opts?.maxTokens,
              temperature: opts?.temperature,
            },
            model,
          );
        },
        evaluate: (resp) => {
          const report = quality.estimate(resp, classification);
          this.totalQualityScore += report.overallScore;
          this.qualityCount++;
          return report.overallScore;
        },
        onStep: (step) => {
          const nextStep = routing.cascadeChain![step.index + 1];
          const stepArtifact = artifactMgr.recordCascadeStep({
            queryId,
            query: classification,
            fromProvider: step.provider,
            fromModel: step.model,
            toProvider: nextStep?.provider,
            toModel: nextStep?.model,
            qualityScore: step.quality,
            qualityThreshold: routing.cascadeChain![step.index].qualityThreshold,
            cost: 0,
            isLast: !nextStep,
          });
          generatedArtifacts.push(stepArtifact);
        },
      });

      response = cascadeResult.response;
    } else {
      // Direct execution
      const provider = this.getProvider(routing.provider);
      response = await provider.chat(
        {
          id: queryId,
          content,
          systemPrompt: opts?.systemPrompt,
          maxTokens: opts?.maxTokens,
          temperature: opts?.temperature,
        },
        routing.model,
      );

      const report = quality.estimate(response, classification);
      this.totalQualityScore += report.overallScore;
      this.qualityCount++;
      artifactMgr.enrichWithResponse(routeArtifact.id, response, report);
    }

    // ── 6. Parallel post-processing ─────────────────────────────────────

    const actualCost = computeActualCost(
      routing.provider,
      routing.model,
      response.tokens.input,
      response.tokens.output,
    );

    await Promise.all([
      // Store in cache
      this.cache
        ?.store(content, response)
        .catch((err) => log.warn("Failed to cache response", { error: String(err) })),
      // Record analytics
      Promise.resolve(
        analytics.recordQuery({
          query: content,
          classification,
          routing,
          cost: actualCost,
          responseTimeMs: response.responseTimeMs,
          cacheHit: false,
        }),
      ),
      // Track budget
      Promise.resolve(budget.recordCost(actualCost)),
    ]);

    return {
      response,
      classification,
      routing,
      artifacts: generatedArtifacts,
      cacheHit: false,
      totalTimeMs: elapsed(),
    };
  }

  // ── Manager View ────────────────────────────────────────────────────────

  /**
   * Get the Antigravity-style manager view.
   * Actionable intel, not metrics porn.
   */
  getManagerView(): ManagerView {
    const budget = getBudgetTracker();
    const analytics = getAnalytics();
    const artifactMgr = getArtifactManager();
    const dailyStatus = budget.getStatus("daily");

    const providerStatuses: Record<
      string,
      { healthy: boolean; latencyMs: number; successRate: number }
    > = {};
    for (const [name, provider] of this.providers) {
      const health = provider.getHealth();
      providerStatuses[name] = {
        healthy: health.status === "healthy",
        latencyMs: health.latencyMs,
        successRate:
          health.totalRequests > 0
            ? (health.totalRequests - health.totalErrors) / health.totalRequests
            : 1,
      };
    }

    return {
      recentArtifacts: artifactMgr.getRecent(10),
      artifactSummary: artifactMgr.getSummary(),
      metrics: {
        cacheHitRate: analytics.cacheHitRate(),
        avgResponseTime: analytics.avgResponseTime(),
        currentSpend: dailyStatus.spent,
        budgetRemaining: dailyStatus.remaining,
        emergencyMode: budget.isEmergencyMode,
        totalQueries: this.queryCount,
        avgQualityScore: this.qualityCount > 0 ? this.totalQualityScore / this.qualityCount : 0,
      },
      providers: providerStatuses,
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private getProvider(name: ProviderName): BaseProvider {
    const p = this.providers.get(name);
    if (!p) {
      throw new Error(`Provider not registered: ${name}`);
    }
    return p;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _agentManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!_agentManager) {
    _agentManager = new AgentManager();
  }
  return _agentManager;
}

export function resetAgentManager(): void {
  _agentManager = null;
}
