/**
 * DeepEyeClaw — Cost Calculator Tests
 */

import { describe, it, expect } from "vitest";
import {
  getModelCostProfile,
  listModelCostProfiles,
  listModelsForComplexity,
  listModelsByCost,
  estimateOutputTokens,
  estimateCost,
  computeActualCost,
  wouldExceedBudget,
  cheapestModelWithinBudget,
} from "./cost-calculator.js";

describe("getModelCostProfile", () => {
  it("finds Perplexity sonar profile", () => {
    const profile = getModelCostProfile("perplexity", "sonar");
    expect(profile).toBeDefined();
    expect(profile!.provider).toBe("perplexity");
    expect(profile!.model).toBe("sonar");
    expect(profile!.capabilities).toContain("web_search");
  });

  it("finds Perplexity sonar-pro profile", () => {
    const profile = getModelCostProfile("perplexity", "sonar-pro");
    expect(profile).toBeDefined();
    expect(profile!.capabilities).toContain("deep_search");
  });

  it("finds Perplexity sonar-reasoning-pro profile", () => {
    const profile = getModelCostProfile("perplexity", "sonar-reasoning-pro");
    expect(profile).toBeDefined();
    expect(profile!.capabilities).toContain("reasoning");
  });

  it("finds OpenAI gpt-4o-mini profile", () => {
    const profile = getModelCostProfile("openai", "gpt-4o-mini");
    expect(profile).toBeDefined();
    expect(profile!.perRequestCost).toBe(0);
  });

  it("returns undefined for unknown model", () => {
    const profile = getModelCostProfile("openai", "gpt-999");
    expect(profile).toBeUndefined();
  });
});

describe("listModelCostProfiles", () => {
  it("returns all models", () => {
    const profiles = listModelCostProfiles();
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.some((p) => p.provider === "perplexity")).toBe(true);
    expect(profiles.some((p) => p.provider === "openai")).toBe(true);
    expect(profiles.some((p) => p.provider === "anthropic")).toBe(true);
  });
});

describe("listModelsForComplexity", () => {
  it("returns models for 'simple' complexity", () => {
    const models = listModelsForComplexity("simple");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.suitableFor.includes("simple"))).toBe(true);
  });

  it("returns models for 'complex' complexity", () => {
    const models = listModelsForComplexity("complex");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.suitableFor.includes("complex"))).toBe(true);
  });
});

describe("listModelsByCost", () => {
  it("returns models sorted by cost (cheapest first)", () => {
    const ranked = listModelsByCost("medium", 100, 300);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].estimatedCost).toBeGreaterThanOrEqual(ranked[i - 1].estimatedCost);
    }
  });
});

describe("estimateOutputTokens", () => {
  it("estimates fewer tokens for simple queries", () => {
    const simple = estimateOutputTokens("simple", 20);
    const complex = estimateOutputTokens("complex", 20);
    expect(simple).toBeLessThan(complex);
  });

  it("caps output tokens", () => {
    const tokens = estimateOutputTokens("simple", 5000);
    expect(tokens).toBeLessThanOrEqual(200);
  });
});

describe("estimateCost", () => {
  it("estimates cost for known model", () => {
    const estimate = estimateCost("perplexity", "sonar", 1000, 500);
    expect(estimate.estimatedCost).toBeGreaterThan(0);
    expect(estimate.breakdown.perRequestCost).toBe(0.005);
  });

  it("returns zero cost for unknown model", () => {
    const estimate = estimateCost("openai", "unknown-model", 1000, 500);
    expect(estimate.estimatedCost).toBe(0);
  });

  it("includes per-request cost for Perplexity", () => {
    const estimate = estimateCost("perplexity", "sonar-pro", 1000, 500);
    expect(estimate.breakdown.perRequestCost).toBe(0.005);
  });

  it("has zero per-request cost for OpenAI", () => {
    const estimate = estimateCost("openai", "gpt-4o-mini", 1000, 500);
    expect(estimate.breakdown.perRequestCost).toBe(0);
  });
});

describe("computeActualCost", () => {
  it("computes actual cost with timestamp", () => {
    const actual = computeActualCost("perplexity", "sonar", 1000, 500);
    expect(actual.totalCost).toBeGreaterThan(0);
    expect(actual.timestamp).toBeGreaterThan(0);
    expect(actual.inputTokens).toBe(1000);
    expect(actual.outputTokens).toBe(500);
  });
});

describe("wouldExceedBudget", () => {
  it("returns true when estimate exceeds remaining", () => {
    const estimate = estimateCost("anthropic", "claude-opus-4-6", 10000, 5000);
    expect(wouldExceedBudget(estimate, 0.001)).toBe(true);
  });

  it("returns false when estimate fits within remaining", () => {
    const estimate = estimateCost("openai", "gpt-4o-mini", 100, 50);
    expect(wouldExceedBudget(estimate, 1.0)).toBe(false);
  });
});

describe("cheapestModelWithinBudget", () => {
  it("finds a model within budget", () => {
    const model = cheapestModelWithinBudget("simple", 100, 200, 1.0);
    expect(model).not.toBeNull();
    expect(model!.suitableFor).toContain("simple");
  });

  it("returns null when no model fits", () => {
    const model = cheapestModelWithinBudget("simple", 100, 200, 0.0000001);
    expect(model).toBeNull();
  });
});
