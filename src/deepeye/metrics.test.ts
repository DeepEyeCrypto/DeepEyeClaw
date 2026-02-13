/**
 * DeepEyeClaw — Prometheus Metrics Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registry,
  queryTotal,
  cascadeEscalations,
  cacheHitsTotal,
  cacheMissesTotal,
  responseLatency,
  qualityScoreHistogram,
  costPerQuery,
  tokensPerQuery,
  budgetRemaining,
  budgetPercentUsed,
  emergencyModeGauge,
  cacheSize,
  cacheHitRate,
  providerHealth,
  queriesInFlight,
  errorsTotal,
  budgetAlertsTotal,
  gatewayUptime,
  recordQueryMetrics,
  recordEscalation,
  updateBudgetMetrics,
  updateCacheMetrics,
  updateProviderHealth,
  recordError,
  updateUptime,
  getMetricsOutput,
} from "./metrics.js";

describe("Prometheus Metrics", () => {
  beforeEach(async () => {
    // Reset all custom metrics between tests
    queryTotal.reset();
    cascadeEscalations.reset();
    cacheHitsTotal.reset();
    cacheMissesTotal.reset();
    responseLatency.reset();
    qualityScoreHistogram.reset();
    costPerQuery.reset();
    tokensPerQuery.reset();
    budgetRemaining.reset();
    budgetPercentUsed.reset();
    emergencyModeGauge.reset();
    cacheSize.reset();
    cacheHitRate.reset();
    providerHealth.reset();
    queriesInFlight.reset();
    errorsTotal.reset();
    budgetAlertsTotal.reset();
    gatewayUptime.reset();
  });

  it("should have a registry with metrics registered", async () => {
    const metrics = await registry.getMetricsAsJSON();
    expect(metrics.length).toBeGreaterThan(0);

    const names = metrics.map((m) => m.name);
    expect(names).toContain("deepeye_queries_total");
    expect(names).toContain("deepeye_response_latency_seconds");
    expect(names).toContain("deepeye_budget_remaining_usd");
    expect(names).toContain("deepeye_emergency_mode_active");
    expect(names).toContain("deepeye_cache_entries");
  });

  it("recordQueryMetrics increments counter and observes histogram", async () => {
    recordQueryMetrics({
      provider: "openai",
      model: "gpt-4o-mini",
      strategy: "cascade",
      complexity: "simple",
      intent: "chat",
      cacheHit: false,
      responseTimeMs: 1500,
      costUsd: 0.003,
      inputTokens: 200,
      outputTokens: 400,
      qualityScore: 8.5,
    });

    // Counter should be 1
    const counterVal = await queryTotal.get();
    const found = counterVal.values.find(
      (v) => v.labels.provider === "openai" && v.labels.model === "gpt-4o-mini",
    );
    expect(found?.value).toBe(1);

    // Cache miss counter
    const missVal = await cacheMissesTotal.get();
    expect(missVal.values[0]?.value).toBe(1);

    // Latency histogram should have observations
    const latencyVal = await responseLatency.get();
    const latencySum = latencyVal.values.find(
      (v) => v.labels.provider === "openai" && v.metricName?.endsWith("_sum"),
    );
    expect(latencySum?.value).toBeCloseTo(1.5, 1); // 1500ms → 1.5s
  });

  it("recordQueryMetrics with cacheHit increments cache hits", async () => {
    recordQueryMetrics({
      provider: "perplexity",
      model: "sonar",
      strategy: "cache",
      complexity: "simple",
      intent: "search",
      cacheHit: true,
      responseTimeMs: 5,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    });

    const hitVal = await cacheHitsTotal.get();
    expect(hitVal.values[0]?.value).toBe(1);
  });

  it("recordEscalation tracks cascade escalations", async () => {
    recordEscalation("perplexity", "sonar", "openai", "gpt-4o");

    const val = await cascadeEscalations.get();
    const found = val.values.find(
      (v) => v.labels.from_provider === "perplexity" && v.labels.to_provider === "openai",
    );
    expect(found?.value).toBe(1);
  });

  it("updateBudgetMetrics sets gauges correctly", async () => {
    updateBudgetMetrics(
      [
        { period: "daily", remaining: 3.5, percentUsed: 30 },
        { period: "weekly", remaining: 20, percentUsed: 20 },
        { period: "monthly", remaining: 85, percentUsed: 15 },
      ],
      false,
    );

    const remainingVal = await budgetRemaining.get();
    const dailyRemaining = remainingVal.values.find((v) => v.labels.period === "daily");
    expect(dailyRemaining?.value).toBe(3.5);

    const emergencyVal = await emergencyModeGauge.get();
    expect(emergencyVal.values[0]?.value).toBe(0);
  });

  it("updateBudgetMetrics in emergency mode sets gauge to 1", async () => {
    updateBudgetMetrics([{ period: "daily", remaining: 0.1, percentUsed: 98 }], true);

    const emergencyVal = await emergencyModeGauge.get();
    expect(emergencyVal.values[0]?.value).toBe(1);
  });

  it("updateCacheMetrics sets cache gauges", async () => {
    updateCacheMetrics(42, 0.73);

    const sizeVal = await cacheSize.get();
    expect(sizeVal.values[0]?.value).toBe(42);

    const hitRateVal = await cacheHitRate.get();
    expect(hitRateVal.values[0]?.value).toBeCloseTo(0.73);
  });

  it("updateProviderHealth sets health gauge", async () => {
    updateProviderHealth("perplexity", true);
    updateProviderHealth("openai", false);

    const val = await providerHealth.get();
    const pplx = val.values.find((v) => v.labels.provider === "perplexity");
    const oai = val.values.find((v) => v.labels.provider === "openai");
    expect(pplx?.value).toBe(1);
    expect(oai?.value).toBe(0);
  });

  it("recordError increments error counter", async () => {
    recordError("openai", "RATE_LIMIT");
    recordError("openai", "RATE_LIMIT");
    recordError("anthropic", "TIMEOUT");

    const val = await errorsTotal.get();
    const rateLimits = val.values.find(
      (v) => v.labels.provider === "openai" && v.labels.error_code === "RATE_LIMIT",
    );
    expect(rateLimits?.value).toBe(2);
  });

  it("queriesInFlight can be incremented and decremented", async () => {
    queriesInFlight.inc();
    queriesInFlight.inc();
    queriesInFlight.dec();

    const val = await queriesInFlight.get();
    expect(val.values[0]?.value).toBe(1);
  });

  it("getMetricsOutput returns prometheus text format", async () => {
    recordQueryMetrics({
      provider: "openai",
      model: "gpt-4o",
      strategy: "priority",
      complexity: "complex",
      intent: "code",
      cacheHit: false,
      responseTimeMs: 3000,
      costUsd: 0.05,
      inputTokens: 500,
      outputTokens: 1000,
    });

    const { body, contentType } = await getMetricsOutput();

    expect(contentType).toContain("text/plain");
    expect(body).toContain("deepeye_queries_total");
    expect(body).toContain("deepeye_response_latency_seconds");
    expect(body).toContain("deepeye_gateway_uptime_seconds");
    expect(body).toContain("deepeye_cost_per_query_usd");
  });

  it("updateUptime sets a positive uptime value", async () => {
    updateUptime();

    const val = await gatewayUptime.get();
    expect(val.values[0]?.value).toBeGreaterThan(0);
  });
});
