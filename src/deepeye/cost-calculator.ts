/**
 * DeepEyeClaw — Cost Calculator
 *
 * Pre-flight cost estimation and post-flight cost tracking.
 * All costs in USD. Pricing from provider rate cards as of 2025.
 */

import type {
  CostEstimate,
  ActualCost,
  ModelCostProfile,
  ProviderName,
  QueryComplexity,
} from "./types.js";

// ─── Model Cost Registry ────────────────────────────────────────────────────

/** All known models and their costs. Updated from provider rate cards. */
const MODEL_COSTS: ModelCostProfile[] = [
  // ── Perplexity Sonar family ──
  {
    provider: "perplexity",
    model: "sonar",
    inputCostPer1k: 0.001,
    outputCostPer1k: 0.001,
    perRequestCost: 0.005,
    maxOutputTokens: 16384,
    contextWindow: 128000,
    suitableFor: ["simple"],
    capabilities: ["web_search", "citations"],
  },
  {
    provider: "perplexity",
    model: "sonar-pro",
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    perRequestCost: 0.005,
    maxOutputTokens: 16384,
    contextWindow: 200000,
    suitableFor: ["simple", "medium"],
    capabilities: ["web_search", "deep_search", "citations", "images"],
  },
  {
    provider: "perplexity",
    model: "sonar-reasoning-pro",
    inputCostPer1k: 0.002,
    outputCostPer1k: 0.008,
    perRequestCost: 0.005,
    maxOutputTokens: 16384,
    contextWindow: 128000,
    suitableFor: ["medium", "complex"],
    capabilities: ["web_search", "reasoning", "chain_of_thought", "citations"],
  },

  // ── OpenAI ──
  {
    provider: "openai",
    model: "gpt-4o-mini",
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    perRequestCost: 0,
    maxOutputTokens: 16384,
    contextWindow: 128000,
    suitableFor: ["simple", "medium"],
    capabilities: ["code", "long_context"],
  },
  {
    provider: "openai",
    model: "gpt-4o",
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
    perRequestCost: 0,
    maxOutputTokens: 4096,
    contextWindow: 128000,
    suitableFor: ["medium", "complex"],
    capabilities: ["code", "reasoning", "long_context"],
  },

  // ── Anthropic ──
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    perRequestCost: 0,
    maxOutputTokens: 8192,
    contextWindow: 200000,
    suitableFor: ["complex"],
    capabilities: ["code", "reasoning", "long_context"],
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-6",
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
    perRequestCost: 0,
    maxOutputTokens: 32768,
    contextWindow: 200000,
    suitableFor: ["complex"],
    capabilities: ["code", "reasoning", "long_context"],
  },
];

// ─── Lookup ─────────────────────────────────────────────────────────────────

export function getModelCostProfile(
  provider: ProviderName,
  model: string,
): ModelCostProfile | undefined {
  return MODEL_COSTS.find(
    (m) => m.provider === provider && m.model === model,
  );
}

export function listModelCostProfiles(): ModelCostProfile[] {
  return [...MODEL_COSTS];
}

export function listModelsForComplexity(
  complexity: QueryComplexity,
): ModelCostProfile[] {
  return MODEL_COSTS.filter((m) => m.suitableFor.includes(complexity));
}

/** Returns models sorted by estimated cost (cheapest first). */
export function listModelsByCost(
  complexity: QueryComplexity,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): Array<{ profile: ModelCostProfile; estimatedCost: number }> {
  const candidates = listModelsForComplexity(complexity);
  return candidates
    .map((profile) => ({
      profile,
      estimatedCost: estimateCostForModel(
        profile,
        estimatedInputTokens,
        estimatedOutputTokens,
      ),
    }))
    .sort((a, b) => a.estimatedCost - b.estimatedCost);
}

// ─── Cost Estimation (pre-flight) ───────────────────────────────────────────

/** Rough output token estimation based on complexity and intent. */
export function estimateOutputTokens(
  complexity: QueryComplexity,
  estimatedInputTokens: number,
): number {
  // Heuristic: simple queries get short answers, complex get long.
  switch (complexity) {
    case "simple":
      return Math.min(200, Math.max(50, estimatedInputTokens * 2));
    case "medium":
      return Math.min(800, Math.max(200, estimatedInputTokens * 3));
    case "complex":
      return Math.min(4000, Math.max(500, estimatedInputTokens * 4));
    default:
      return 300;
  }
}

function estimateCostForModel(
  profile: ModelCostProfile,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost = (inputTokens / 1000) * profile.inputCostPer1k;
  const outputCost = (outputTokens / 1000) * profile.outputCostPer1k;
  return inputCost + outputCost + profile.perRequestCost;
}

export function estimateCost(
  provider: ProviderName,
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): CostEstimate {
  const profile = getModelCostProfile(provider, model);
  if (!profile) {
    return {
      provider,
      model,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCost: 0,
      breakdown: { inputCost: 0, outputCost: 0, perRequestCost: 0 },
    };
  }

  const inputCost = (estimatedInputTokens / 1000) * profile.inputCostPer1k;
  const outputCost = (estimatedOutputTokens / 1000) * profile.outputCostPer1k;
  const { perRequestCost } = profile;

  return {
    provider,
    model,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCost: inputCost + outputCost + perRequestCost,
    breakdown: { inputCost, outputCost, perRequestCost },
  };
}

// ─── Actual Cost Tracking (post-flight) ─────────────────────────────────────

export function computeActualCost(
  provider: ProviderName,
  model: string,
  inputTokens: number,
  outputTokens: number,
): ActualCost {
  const profile = getModelCostProfile(provider, model);
  if (!profile) {
    return {
      provider,
      model,
      inputTokens,
      outputTokens,
      totalCost: 0,
      timestamp: Date.now(),
    };
  }

  const inputCost = (inputTokens / 1000) * profile.inputCostPer1k;
  const outputCost = (outputTokens / 1000) * profile.outputCostPer1k;

  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    totalCost: inputCost + outputCost + profile.perRequestCost,
    timestamp: Date.now(),
  };
}

// ─── Budget Helpers ─────────────────────────────────────────────────────────

/**
 * Check whether a cost estimate would exceed the remaining budget.
 * Returns true if the estimate would blow the budget.
 */
export function wouldExceedBudget(
  estimate: CostEstimate,
  remaining: number,
): boolean {
  return estimate.estimatedCost > remaining;
}

/**
 * Find the cheapest model that can handle the given complexity
 * and fits within the remaining budget.
 */
export function cheapestModelWithinBudget(
  complexity: QueryComplexity,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  remainingBudget: number,
): ModelCostProfile | null {
  const ranked = listModelsByCost(
    complexity,
    estimatedInputTokens,
    estimatedOutputTokens,
  );

  for (const { profile, estimatedCost } of ranked) {
    if (estimatedCost <= remainingBudget) {
      return profile;
    }
  }
  return null;
}
