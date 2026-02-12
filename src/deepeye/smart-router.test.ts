/**
 * DeepEyeClaw — Smart Router Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { routeQuery, executeCascade } from "./smart-router.js";
import { classifyQuery } from "./query-classifier.js";
import { resetBudgetTracker, BudgetTracker, getBudgetTracker } from "./budget-tracker.js";
import type { ProviderName, CascadeStep } from "./types.js";

describe("routeQuery", () => {
  beforeEach(() => {
    resetBudgetTracker();
  });

  describe("priority strategy", () => {
    it("routes real-time queries to Perplexity", () => {
      const query = classifyQuery("What is the current Bitcoin price?");
      const decision = routeQuery(query, { strategy: "priority" });
      expect(decision.provider).toBe("perplexity");
      expect(decision.strategy).toBe("priority");
    });

    it("routes search queries to Perplexity", () => {
      const query = classifyQuery("Find the latest research paper on quantum computing");
      const decision = routeQuery(query, { strategy: "priority" });
      expect(decision.provider).toBe("perplexity");
    });

    it("routes simple queries to GPT-4o-mini", () => {
      const query = classifyQuery("hello");
      const decision = routeQuery(query, { strategy: "priority" });
      expect(decision.model).toBe("gpt-4o-mini");
    });

    it("routes complex code to Claude", () => {
      const query = classifyQuery(
        "Build a complete architecture design for a microservices system with implement authentication, rate limiting, and deploy strategies",
      );
      const decision = routeQuery(query, { strategy: "priority" });
      expect(decision.provider).toBe("anthropic");
    });
  });

  describe("cost-optimized strategy", () => {
    it("picks cheapest suitable model", () => {
      const query = classifyQuery("What is TypeScript?");
      const decision = routeQuery(query, { strategy: "cost-optimized" });
      expect(decision.estimatedCost.estimatedCost).toBeGreaterThan(0);
      expect(decision.strategy).toBe("cost-optimized");
    });

    it("prefers search-capable models for real-time queries", () => {
      const query = classifyQuery("Latest news about AI");
      const decision = routeQuery(query, { strategy: "cost-optimized" });
      expect(decision.provider).toBe("perplexity");
    });
  });

  describe("cascade strategy", () => {
    it("provides a cascade chain", () => {
      const query = classifyQuery("Explain quantum computing");
      const decision = routeQuery(query, { strategy: "cascade" });
      expect(decision.strategy).toBe("cascade");
      expect(decision.cascadeChain).toBeDefined();
      expect(decision.cascadeChain!.length).toBeGreaterThan(0);
    });

    it("uses Perplexity in cascade for real-time queries", () => {
      const query = classifyQuery("Current stock market trends today");
      const decision = routeQuery(query, { strategy: "cascade" });
      expect(decision.cascadeChain).toBeDefined();
      expect(decision.cascadeChain![0].provider).toBe("perplexity");
    });
  });

  describe("emergency strategy", () => {
    it("forces cheap models in emergency mode", () => {
      const tracker = getBudgetTracker();
      tracker.setEmergencyMode(true);

      const query = classifyQuery("Complex analysis of global economic policy");
      const decision = routeQuery(query);
      expect(decision.strategy).toBe("emergency");
      expect(decision.emergencyMode).toBe(true);
    });

    it("disables providers in emergency mode", () => {
      const tracker = getBudgetTracker({ emergencyMode: {
        enabled: true,
        forceCheapestModels: true,
        disableProviders: ["anthropic"],
        notifyAdmin: false,
      }});
      tracker.setEmergencyMode(true);

      const query = classifyQuery("Complex architecture design");
      const decision = routeQuery(query, { strategy: "priority" });
      // Should NOT be anthropic even though priority would pick it.
      expect(decision.provider).not.toBe("anthropic");
    });
  });

  describe("routing decision structure", () => {
    it("includes estimated cost", () => {
      const query = classifyQuery("hello");
      const decision = routeQuery(query, { strategy: "priority" });
      expect(decision.estimatedCost).toBeDefined();
      expect(decision.estimatedCost.estimatedInputTokens).toBeGreaterThan(0);
    });

    it("includes reason", () => {
      const query = classifyQuery("hello");
      const decision = routeQuery(query, { strategy: "priority" });
      expect(decision.reason.length).toBeGreaterThan(0);
    });
  });
});

describe("executeCascade", () => {
  it("returns first response that meets quality threshold", async () => {
    const chain: CascadeStep[] = [
      { provider: "openai", model: "gpt-4o-mini", qualityThreshold: 8, maxCost: 0.05 },
      { provider: "openai", model: "gpt-4o", qualityThreshold: 9, maxCost: 0.15 },
    ];

    const result = await executeCascade({
      chain,
      run: async (provider, model) => `response from ${provider}/${model}`,
      evaluate: (response) => {
        // Simulate: first model gets quality 9 (meets threshold of 8).
        return response.includes("gpt-4o-mini") ? 9 : 10;
      },
    });

    expect(result.step).toBe(0);
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.response).toContain("gpt-4o-mini");
  });

  it("escalates when first response is below threshold", async () => {
    const chain: CascadeStep[] = [
      { provider: "openai", model: "gpt-4o-mini", qualityThreshold: 8, maxCost: 0.05 },
      { provider: "openai", model: "gpt-4o", qualityThreshold: 9, maxCost: 0.15 },
    ];

    const result = await executeCascade({
      chain,
      run: async (provider, model) => `response from ${provider}/${model}`,
      evaluate: (response) => {
        // First model gets 5 (below threshold), second gets 9 (meets threshold).
        return response.includes("gpt-4o-mini") ? 5 : 9;
      },
    });

    expect(result.step).toBe(1);
    expect(result.model).toBe("gpt-4o");
  });

  it("returns best response when no threshold is met", async () => {
    const chain: CascadeStep[] = [
      { provider: "openai", model: "gpt-4o-mini", qualityThreshold: 10, maxCost: 0.05 },
      { provider: "openai", model: "gpt-4o", qualityThreshold: 10, maxCost: 0.15 },
    ];

    const result = await executeCascade({
      chain,
      run: async (provider, model) => `response from ${provider}/${model}`,
      evaluate: (response) => {
        return response.includes("gpt-4o") && !response.includes("mini") ? 7 : 5;
      },
    });

    // Should return the best quality response, even if no threshold was met.
    expect(result.model).toBe("gpt-4o");
  });

  it("handles failures gracefully and continues cascade", async () => {
    const chain: CascadeStep[] = [
      { provider: "openai", model: "gpt-4o-mini", qualityThreshold: 8, maxCost: 0.05 },
      { provider: "openai", model: "gpt-4o", qualityThreshold: 9, maxCost: 0.15 },
    ];

    const result = await executeCascade({
      chain,
      run: async (provider, model) => {
        if (model === "gpt-4o-mini") throw new Error("Model unavailable");
        return `response from ${provider}/${model}`;
      },
      evaluate: () => 9,
    });

    expect(result.model).toBe("gpt-4o");
  });

  it("throws when all steps fail", async () => {
    const chain: CascadeStep[] = [
      { provider: "openai", model: "gpt-4o-mini", qualityThreshold: 8, maxCost: 0.05 },
    ];

    await expect(
      executeCascade({
        chain,
        run: async () => { throw new Error("Fail"); },
        evaluate: () => 10,
      }),
    ).rejects.toThrow("All cascade steps failed");
  });
});
