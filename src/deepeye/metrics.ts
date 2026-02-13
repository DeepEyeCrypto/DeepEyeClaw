/**
 * DeepEyeClaw — Prometheus Metrics
 *
 * Exposes production-grade metrics for Grafana / Prometheus.
 * All metrics use the `deepeye_` prefix to avoid collisions.
 *
 * Counters:
 *   - queries total (by provider, model, strategy, complexity, intent, cache_hit)
 *   - cascade escalations
 *   - cache hits / misses
 *   - budget alerts
 *   - errors (by provider, error_code)
 *
 * Histograms:
 *   - response latency (by provider, model, strategy)
 *   - quality scores (by provider, model)
 *   - cost per query (by provider, model)
 *
 * Gauges:
 *   - budget remaining (by period)
 *   - budget percent used (by period)
 *   - emergency mode active
 *   - cache size
 *   - cache hit rate
 *   - provider health (by provider)
 *   - active queries in flight
 */

import client from "prom-client";
import { childLogger } from "./utils/logger.js";

const log = childLogger("metrics");

// ── Registry ────────────────────────────────────────────────────────────────

export const registry = new client.Registry();

// Collect default Node.js metrics (event loop, memory, GC, etc.)
client.collectDefaultMetrics({ register: registry, prefix: "deepeye_node_" });

// ── Counters ────────────────────────────────────────────────────────────────

export const queryTotal = new client.Counter({
  name: "deepeye_queries_total",
  help: "Total queries processed",
  labelNames: ["provider", "model", "strategy", "complexity", "intent", "cache_hit"] as const,
  registers: [registry],
});

export const cascadeEscalations = new client.Counter({
  name: "deepeye_cascade_escalations_total",
  help: "Total cascade escalations (model was insufficient, escalated to next)",
  labelNames: ["from_provider", "from_model", "to_provider", "to_model"] as const,
  registers: [registry],
});

export const cacheHitsTotal = new client.Counter({
  name: "deepeye_cache_hits_total",
  help: "Total semantic cache hits",
  registers: [registry],
});

export const cacheMissesTotal = new client.Counter({
  name: "deepeye_cache_misses_total",
  help: "Total semantic cache misses",
  registers: [registry],
});

export const budgetAlertsTotal = new client.Counter({
  name: "deepeye_budget_alerts_total",
  help: "Total budget alerts fired",
  labelNames: ["period", "severity"] as const,
  registers: [registry],
});

export const errorsTotal = new client.Counter({
  name: "deepeye_errors_total",
  help: "Total errors by provider and code",
  labelNames: ["provider", "error_code"] as const,
  registers: [registry],
});

// ── Histograms ──────────────────────────────────────────────────────────────

export const responseLatency = new client.Histogram({
  name: "deepeye_response_latency_seconds",
  help: "Response latency in seconds",
  labelNames: ["provider", "model", "strategy"] as const,
  // 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s, 30s
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
});

export const qualityScoreHistogram = new client.Histogram({
  name: "deepeye_quality_score",
  help: "Quality scores assigned to responses (0-10)",
  labelNames: ["provider", "model"] as const,
  // 0-10 in 0.5 increments
  buckets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  registers: [registry],
});

export const costPerQuery = new client.Histogram({
  name: "deepeye_cost_per_query_usd",
  help: "Cost per query in USD",
  labelNames: ["provider", "model"] as const,
  buckets: [0, 0.0001, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [registry],
});

export const tokensPerQuery = new client.Histogram({
  name: "deepeye_tokens_per_query",
  help: "Tokens used per query",
  labelNames: ["provider", "model", "direction"] as const,
  buckets: [10, 50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000],
  registers: [registry],
});

// ── Gauges ──────────────────────────────────────────────────────────────────

export const budgetRemaining = new client.Gauge({
  name: "deepeye_budget_remaining_usd",
  help: "Remaining budget in USD",
  labelNames: ["period"] as const,
  registers: [registry],
});

export const budgetPercentUsed = new client.Gauge({
  name: "deepeye_budget_percent_used",
  help: "Budget utilization percentage (0-100)",
  labelNames: ["period"] as const,
  registers: [registry],
});

export const emergencyModeGauge = new client.Gauge({
  name: "deepeye_emergency_mode_active",
  help: "Whether emergency mode is active (1=yes, 0=no)",
  registers: [registry],
});

export const cacheSize = new client.Gauge({
  name: "deepeye_cache_entries",
  help: "Current number of cached entries",
  registers: [registry],
});

export const cacheHitRate = new client.Gauge({
  name: "deepeye_cache_hit_rate",
  help: "Rolling cache hit rate (0.0-1.0)",
  registers: [registry],
});

export const providerHealth = new client.Gauge({
  name: "deepeye_provider_healthy",
  help: "Provider health status (1=healthy, 0=unhealthy)",
  labelNames: ["provider"] as const,
  registers: [registry],
});

export const queriesInFlight = new client.Gauge({
  name: "deepeye_queries_in_flight",
  help: "Queries currently being processed",
  registers: [registry],
});

export const gatewayUptime = new client.Gauge({
  name: "deepeye_gateway_uptime_seconds",
  help: "Gateway uptime in seconds",
  registers: [registry],
});

// ── Recording Helpers ───────────────────────────────────────────────────────

export interface QueryMetricLabels {
  provider: string;
  model: string;
  strategy: string;
  complexity: string;
  intent: string;
  cacheHit: boolean;
  responseTimeMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  qualityScore?: number;
}

/**
 * Record all metrics for a completed query in one call.
 */
export function recordQueryMetrics(labels: QueryMetricLabels): void {
  // Counter
  queryTotal.inc({
    provider: labels.provider,
    model: labels.model,
    strategy: labels.strategy,
    complexity: labels.complexity,
    intent: labels.intent,
    cache_hit: labels.cacheHit ? "true" : "false",
  });

  // Cache
  if (labels.cacheHit) {
    cacheHitsTotal.inc();
  } else {
    cacheMissesTotal.inc();
  }

  // Latency (convert ms → seconds for Prometheus convention)
  responseLatency.observe(
    { provider: labels.provider, model: labels.model, strategy: labels.strategy },
    labels.responseTimeMs / 1000,
  );

  // Cost
  costPerQuery.observe({ provider: labels.provider, model: labels.model }, labels.costUsd);

  // Tokens
  tokensPerQuery.observe(
    { provider: labels.provider, model: labels.model, direction: "input" },
    labels.inputTokens,
  );
  tokensPerQuery.observe(
    { provider: labels.provider, model: labels.model, direction: "output" },
    labels.outputTokens,
  );

  // Quality
  if (labels.qualityScore !== undefined) {
    qualityScoreHistogram.observe(
      { provider: labels.provider, model: labels.model },
      labels.qualityScore,
    );
  }
}

/**
 * Record a cascade escalation step.
 */
export function recordEscalation(
  fromProvider: string,
  fromModel: string,
  toProvider: string,
  toModel: string,
): void {
  cascadeEscalations.inc({
    from_provider: fromProvider,
    from_model: fromModel,
    to_provider: toProvider,
    to_model: toModel,
  });
}

/**
 * Update budget gauges from the budget tracker.
 */
export function updateBudgetMetrics(
  statuses: Array<{
    period: string;
    remaining: number;
    percentUsed: number;
  }>,
  isEmergency: boolean,
): void {
  for (const s of statuses) {
    budgetRemaining.set({ period: s.period }, s.remaining);
    budgetPercentUsed.set({ period: s.period }, s.percentUsed);
  }
  emergencyModeGauge.set(isEmergency ? 1 : 0);
}

/**
 * Update cache gauge from cache stats.
 */
export function updateCacheMetrics(entries: number, hitRate: number): void {
  cacheSize.set(entries);
  cacheHitRate.set(hitRate);
}

/**
 * Update provider health gauge.
 */
export function updateProviderHealth(provider: string, healthy: boolean): void {
  providerHealth.set({ provider }, healthy ? 1 : 0);
}

/**
 * Record an error.
 */
export function recordError(provider: string, errorCode: string): void {
  errorsTotal.inc({ provider, error_code: errorCode });
}

/**
 * Update the uptime gauge. Called periodically.
 */
export function updateUptime(): void {
  gatewayUptime.set(process.uptime());
}

// ── Metrics Endpoint Handler ────────────────────────────────────────────────

/**
 * Returns the /metrics response body and content type for Prometheus scraping.
 */
export async function getMetricsOutput(): Promise<{ body: string; contentType: string }> {
  updateUptime();
  return {
    body: await registry.metrics(),
    contentType: registry.contentType,
  };
}

log.info("Prometheus metrics initialized");
