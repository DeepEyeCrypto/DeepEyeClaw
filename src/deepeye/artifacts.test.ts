/**
 * DeepEyeClaw — Artifacts Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ArtifactManager, resetArtifactManager, getArtifactManager } from "./artifacts.js";
import type { ClassifiedQuery, RoutingDecision } from "./types.js";
import type { ChatResponse } from "./providers/base.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQuery(overrides: Partial<ClassifiedQuery> = {}): ClassifiedQuery {
  return {
    text: "test query",
    complexity: "medium",
    complexityScore: 0.5,
    intent: "chat",
    isRealtime: false,
    matchedIndicators: [],
    estimatedTokens: 50,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    strategy: "cascade",
    reason: "Test routing decision",
    estimatedCost: {
      provider: "openai",
      model: "gpt-4o-mini",
      estimatedInputTokens: 50,
      estimatedOutputTokens: 200,
      estimatedCost: 0.003,
      breakdown: { inputCost: 0.001, outputCost: 0.002, perRequestCost: 0 },
    },
    emergencyMode: false,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ArtifactManager", () => {
  let manager: ArtifactManager;

  beforeEach(() => {
    resetArtifactManager();
    manager = new ArtifactManager(100); // small cap for testing
  });

  describe("recordRouteDecision", () => {
    it("creates a route_decision artifact", () => {
      const artifact = manager.recordRouteDecision({
        queryId: "q1",
        query: makeQuery(),
        decision: makeDecision(),
      });

      expect(artifact.type).toBe("route_decision");
      expect(artifact.queryId).toBe("q1");
      expect(artifact.selectedModel.provider).toBe("openai");
      expect(artifact.selectedModel.model).toBe("gpt-4o-mini");
      expect(artifact.tags).toContain("cascade");
      expect(artifact.tags).toContain("medium");
    });

    it("includes cascade trail when available", () => {
      const decision = makeDecision({
        cascadeChain: [
          { provider: "perplexity", model: "sonar", qualityThreshold: 7, maxCost: 0.01 },
          { provider: "openai", model: "gpt-4o-mini", qualityThreshold: 8, maxCost: 0.05 },
        ],
      });
      const artifact = manager.recordRouteDecision({
        queryId: "q2",
        query: makeQuery(),
        decision,
      });

      expect(artifact.cascadeTrail).toHaveLength(2);
      expect(artifact.cascadeTrail![0].tier).toBe(1);
      expect(artifact.cascadeTrail![0].model).toBe("sonar");
    });
  });

  describe("recordCacheHit", () => {
    it("creates a cache_hit artifact", () => {
      const artifact = manager.recordCacheHit({
        queryId: "q3",
        query: makeQuery(),
        similarity: 0.92,
        savedCost: 0.005,
        savedLatencyMs: 1200,
        provider: "perplexity",
        model: "sonar",
      });

      expect(artifact.type).toBe("cache_hit");
      expect(artifact.cache?.hit).toBe(true);
      expect(artifact.cache?.similarity).toBe(0.92);
      expect(artifact.cache?.savedCost).toBe(0.005);
      expect(artifact.reasoning).toContain("92.0%");
    });
  });

  describe("recordBudgetReject", () => {
    it("creates a budget_reject artifact", () => {
      const artifact = manager.recordBudgetReject({
        queryId: "q4",
        query: makeQuery(),
        dailySpent: 4.95,
        dailyLimit: 5.0,
        estimatedCost: 0.01,
      });

      expect(artifact.type).toBe("budget_reject");
      expect(artifact.budgetSnapshot?.percentUsed).toBeCloseTo(99, 0);
      expect(artifact.tags).toContain("budget");
      expect(artifact.tags).toContain("rejected");
    });
  });

  describe("recordCascadeStep", () => {
    it("creates escalation artifact", () => {
      const artifact = manager.recordCascadeStep({
        queryId: "q5",
        query: makeQuery(),
        fromProvider: "perplexity",
        fromModel: "sonar",
        toProvider: "openai",
        toModel: "gpt-4o-mini",
        qualityScore: 5.5,
        qualityThreshold: 7,
        cost: 0.005,
        isLast: false,
      });

      expect(artifact.type).toBe("cascade_escalation");
      expect(artifact.reasoning).toContain("escalating");
    });

    it("creates success artifact when quality meets threshold", () => {
      const artifact = manager.recordCascadeStep({
        queryId: "q6",
        query: makeQuery(),
        fromProvider: "openai",
        fromModel: "gpt-4o-mini",
        qualityScore: 8.5,
        qualityThreshold: 8,
        cost: 0.01,
        isLast: true,
      });

      expect(artifact.type).toBe("cascade_success");
    });
  });

  describe("enrichWithResponse", () => {
    it("adds response data to an existing artifact", () => {
      const artifact = manager.recordRouteDecision({
        queryId: "q7",
        query: makeQuery(),
        decision: makeDecision(),
      });

      manager.enrichWithResponse(artifact.id, {
        id: "r1",
        content: "response text",
        provider: "openai",
        model: "gpt-4o-mini",
        tokens: { input: 50, output: 200, total: 250 },
        cost: 0.003,
        responseTimeMs: 1500,
        cacheHit: false,
        finishReason: "stop",
      });

      // Fetch the artifact back
      const enriched = manager.getRecent(1)[0];
      expect(enriched.actualCost).toBe(0.003);
      expect(enriched.response?.tokensUsed).toBe(250);
      expect(enriched.response?.responseTimeMs).toBe(1500);
    });
  });

  describe("query", () => {
    it("returns recent artifacts newest-first", () => {
      manager.recordRouteDecision({ queryId: "a", query: makeQuery(), decision: makeDecision() });
      manager.recordRouteDecision({ queryId: "b", query: makeQuery(), decision: makeDecision() });
      manager.recordRouteDecision({ queryId: "c", query: makeQuery(), decision: makeDecision() });

      const recent = manager.getRecent(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].queryId).toBe("c");
      expect(recent[1].queryId).toBe("b");
    });

    it("filters by query ID", () => {
      manager.recordRouteDecision({ queryId: "x", query: makeQuery(), decision: makeDecision() });
      manager.recordCacheHit({ queryId: "x", query: makeQuery(), similarity: 0.9, savedCost: 0, savedLatencyMs: 0, provider: "p", model: "m" });
      manager.recordRouteDecision({ queryId: "y", query: makeQuery(), decision: makeDecision() });

      const forX = manager.getByQueryId("x");
      expect(forX).toHaveLength(2);
    });

    it("filters by type", () => {
      manager.recordRouteDecision({ queryId: "a", query: makeQuery(), decision: makeDecision() });
      manager.recordCacheHit({ queryId: "b", query: makeQuery(), similarity: 0.9, savedCost: 0, savedLatencyMs: 0, provider: "p", model: "m" });

      const cacheHits = manager.getByType("cache_hit");
      expect(cacheHits).toHaveLength(1);
    });

    it("filters by tag", () => {
      manager.recordRouteDecision({ queryId: "a", query: makeQuery({ complexity: "simple" }), decision: makeDecision() });
      manager.recordRouteDecision({ queryId: "b", query: makeQuery({ complexity: "complex" }), decision: makeDecision() });

      const complex = manager.getByTag("complex");
      expect(complex).toHaveLength(1);
    });
  });

  describe("summary", () => {
    it("returns summary statistics", () => {
      manager.recordRouteDecision({ queryId: "a", query: makeQuery(), decision: makeDecision() });
      manager.recordCacheHit({ queryId: "b", query: makeQuery(), similarity: 0.9, savedCost: 0.005, savedLatencyMs: 0, provider: "p", model: "m" });

      const summary = manager.getSummary();
      expect(summary.totalArtifacts).toBe(2);
      expect(summary.todayCount).toBe(2);
      expect(summary.cacheHits).toBe(1);
    });
  });

  describe("capacity", () => {
    it("caps artifacts at maxArtifacts", () => {
      for (let i = 0; i < 120; i++) {
        manager.recordRouteDecision({ queryId: `q${i}`, query: makeQuery(), decision: makeDecision() });
      }
      expect(manager.size).toBeLessThanOrEqual(100);
    });
  });

  describe("singleton", () => {
    it("returns the same instance", () => {
      const m1 = getArtifactManager();
      const m2 = getArtifactManager();
      expect(m1).toBe(m2);
    });
  });
});
