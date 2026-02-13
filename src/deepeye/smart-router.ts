/**
 * DeepEyeClaw — Smart Router
 *
 * The brain. Takes a classified query + budget status and decides
 * which provider/model to use, including cascade chains for complex queries.
 *
 * Routing strategies:
 *   - priority:       Use the best model for the task regardless of cost.
 *   - cost-optimized: Always pick the cheapest suitable model.
 *   - cascade:        Start cheap, escalate if quality is insufficient.
 *   - emergency:      Force cheapest models across the board.
 */

import type {
  CascadeStep,
  ClassifiedQuery,
  CostEstimate,
  ProviderName,
  RoutingDecision,
  RoutingStrategy,
} from "./types.js";
import { getBudgetTracker } from "./budget-tracker.js";
import {
  estimateCost,
  estimateOutputTokens,
  listModelsByCost,
  cheapestModelWithinBudget,
} from "./cost-calculator.js";
import { selectPerplexityModel } from "./perplexity-provider.js";

// ─── Default Cascade Chains ─────────────────────────────────────────────────

const SIMPLE_CASCADE: CascadeStep[] = [
  { provider: "perplexity", model: "sonar", qualityThreshold: 7, maxCost: 0.01 },
  { provider: "openai", model: "gpt-4o-mini", qualityThreshold: 8, maxCost: 0.05 },
];

const MEDIUM_CASCADE: CascadeStep[] = [
  { provider: "perplexity", model: "sonar-pro", qualityThreshold: 7.5, maxCost: 0.02 },
  { provider: "openai", model: "gpt-4o-mini", qualityThreshold: 8.5, maxCost: 0.08 },
  { provider: "openai", model: "gpt-4o", qualityThreshold: 9, maxCost: 0.15 },
];

const COMPLEX_CASCADE: CascadeStep[] = [
  { provider: "perplexity", model: "sonar-reasoning-pro", qualityThreshold: 8, maxCost: 0.05 },
  { provider: "openai", model: "gpt-4o", qualityThreshold: 9, maxCost: 0.15 },
  { provider: "anthropic", model: "claude-sonnet-4-5", qualityThreshold: 9.5, maxCost: 0.3 },
];

function getCascadeChain(query: ClassifiedQuery): CascadeStep[] {
  // Real-time always starts with Perplexity.
  if (query.isRealtime) {
    return [
      {
        provider: "perplexity",
        model: selectPerplexityModel({
          isRealtime: true,
          needsReasoning: query.intent === "reasoning",
          needsDeepSearch: query.complexity !== "simple",
        }),
        qualityThreshold: 7,
        maxCost: 0.02,
      },
      ...MEDIUM_CASCADE.slice(1),
    ];
  }

  switch (query.complexity) {
    case "simple":
      return SIMPLE_CASCADE;
    case "medium":
      return MEDIUM_CASCADE;
    case "complex":
      return COMPLEX_CASCADE;
  }
}

// ─── Strategy Implementations ───────────────────────────────────────────────

function routePriority(query: ClassifiedQuery): {
  provider: ProviderName;
  model: string;
  reason: string;
} {
  // Search/real-time → Perplexity always.
  if (query.isRealtime || query.intent === "search") {
    const model = selectPerplexityModel({
      isRealtime: query.isRealtime,
      needsReasoning: query.intent === "reasoning",
      needsDeepSearch: query.complexity !== "simple",
    });
    return { provider: "perplexity", model, reason: `Real-time/search → Perplexity ${model}` };
  }

  // Reasoning → Perplexity Reasoning Pro or Claude.
  if (query.intent === "reasoning") {
    if (query.complexity === "complex") {
      return {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        reason: "Complex reasoning → Claude Sonnet 4.5",
      };
    }
    return {
      provider: "perplexity",
      model: "sonar-reasoning-pro",
      reason: "Reasoning → Perplexity Sonar Reasoning Pro",
    };
  }

  // Code → Claude or GPT-4o (best code models).
  if (query.intent === "code") {
    if (query.complexity === "complex") {
      return {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        reason: "Complex code → Claude Sonnet 4.5",
      };
    }
    return { provider: "openai", model: "gpt-4o", reason: "Code → GPT-4o" };
  }

  // Simple queries → cheapest.
  if (query.complexity === "simple") {
    return { provider: "openai", model: "gpt-4o-mini", reason: "Simple query → GPT-4o-mini" };
  }

  // Medium → GPT-4o-mini (good enough, cheap).
  if (query.complexity === "medium") {
    return { provider: "openai", model: "gpt-4o-mini", reason: "Medium query → GPT-4o-mini" };
  }

  // Complex → Claude.
  return {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    reason: "Complex query → Claude Sonnet 4.5",
  };
}

function routeCostOptimized(query: ClassifiedQuery): {
  provider: ProviderName;
  model: string;
  reason: string;
} {
  const estimatedOutput = estimateOutputTokens(query.complexity, query.estimatedTokens);
  const ranked = listModelsByCost(query.complexity, query.estimatedTokens, estimatedOutput);

  // For real-time/search, filter to models with web_search capability.
  if (query.isRealtime || query.intent === "search") {
    const searchCandidates = ranked.filter((r) => r.profile.capabilities.includes("web_search"));
    if (searchCandidates.length > 0) {
      const best = searchCandidates[0];
      return {
        provider: best.profile.provider,
        model: best.profile.model,
        reason: `Cost-optimized search → ${best.profile.provider}/${best.profile.model} ($${best.estimatedCost.toFixed(4)})`,
      };
    }
  }

  if (ranked.length > 0) {
    const best = ranked[0];
    return {
      provider: best.profile.provider,
      model: best.profile.model,
      reason: `Cost-optimized → ${best.profile.provider}/${best.profile.model} ($${best.estimatedCost.toFixed(4)})`,
    };
  }

  // Absolute fallback.
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    reason: "Cost-optimized fallback → GPT-4o-mini",
  };
}

function routeEmergency(query: ClassifiedQuery): {
  provider: ProviderName;
  model: string;
  reason: string;
} {
  const estimatedOutput = estimateOutputTokens(query.complexity, query.estimatedTokens);
  const budget = getBudgetTracker();
  const remaining = budget.dailyRemaining;

  const cheapest = cheapestModelWithinBudget(
    query.complexity,
    query.estimatedTokens,
    estimatedOutput,
    remaining,
  );

  if (cheapest) {
    return {
      provider: cheapest.provider,
      model: cheapest.model,
      reason: `🚨 Emergency mode → ${cheapest.provider}/${cheapest.model} (budget: $${remaining.toFixed(4)} remaining)`,
    };
  }

  // If nothing fits, force GPT-4o-mini (cheapest option).
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    reason: "🚨 Emergency mode → forced GPT-4o-mini (budget nearly exhausted)",
  };
}

// ─── Main Router ────────────────────────────────────────────────────────────

export type SmartRouterConfig = {
  strategy?: RoutingStrategy;
  defaultProvider?: ProviderName;
};

/**
 * The main routing entry point.
 * Takes a classified query and returns a routing decision.
 */
export function routeQuery(query: ClassifiedQuery, config?: SmartRouterConfig): RoutingDecision {
  const budget = getBudgetTracker();
  const strategy = determineStrategy(config?.strategy, budget.isEmergencyMode);

  let selection: { provider: ProviderName; model: string; reason: string };
  let cascadeChain: CascadeStep[] | undefined;

  switch (strategy) {
    case "emergency":
      selection = routeEmergency(query);
      break;
    case "cost-optimized":
      selection = routeCostOptimized(query);
      break;
    case "cascade":
      cascadeChain = getCascadeChain(query);
      selection = {
        provider: cascadeChain[0].provider,
        model: cascadeChain[0].model,
        reason: `Cascade start → ${cascadeChain[0].provider}/${cascadeChain[0].model} (${cascadeChain.length} steps)`,
      };
      break;
    case "priority":
    default:
      selection = routePriority(query);
      break;
  }

  // Check if the selected provider is disabled by emergency mode.
  if (budget.isProviderDisabled(selection.provider)) {
    selection = routeEmergency(query);
  }

  const estimatedOutput = estimateOutputTokens(query.complexity, query.estimatedTokens);
  const estimatedCost = estimateCost(
    selection.provider,
    selection.model,
    query.estimatedTokens,
    estimatedOutput,
  );

  return {
    provider: selection.provider,
    model: selection.model,
    strategy,
    reason: selection.reason,
    estimatedCost,
    cascadeChain,
    emergencyMode: budget.isEmergencyMode,
  };
}

function determineStrategy(configured?: RoutingStrategy, isEmergency?: boolean): RoutingStrategy {
  if (isEmergency) {
    return "emergency";
  }
  return configured ?? "cascade";
}

// ─── Cascade Executor ───────────────────────────────────────────────────────

export type CascadeResult<T> = {
  response: T;
  provider: ProviderName;
  model: string;
  step: number;
  totalSteps: number;
  totalCost: number;
};

/**
 * Execute a cascade chain: try each model in order.
 * The `run` function should return the response.
 * The `evaluate` function scores the response quality (0–10).
 * Cascade stops when quality meets the threshold or we exhaust the chain.
 */
export async function executeCascade<T>(params: {
  chain: CascadeStep[];
  run: (provider: ProviderName, model: string) => Promise<T>;
  evaluate: (response: T) => number;
  onStep?: (step: {
    provider: ProviderName;
    model: string;
    quality: number;
    index: number;
  }) => void;
}): Promise<CascadeResult<T>> {
  let bestResponse: T | null = null;
  let bestQuality = 0;
  let bestProvider: ProviderName = params.chain[0].provider;
  let bestModel = params.chain[0].model;
  let bestStep = 0;
  let totalCost = 0;

  for (let i = 0; i < params.chain.length; i++) {
    const step = params.chain[i];

    try {
      const response = await params.run(step.provider, step.model);
      const quality = params.evaluate(response);

      params.onStep?.({
        provider: step.provider,
        model: step.model,
        quality,
        index: i,
      });

      if (quality > bestQuality) {
        bestResponse = response;
        bestQuality = quality;
        bestProvider = step.provider;
        bestModel = step.model;
        bestStep = i;
      }

      // Meets threshold — we're done.
      if (quality >= step.qualityThreshold) {
        return {
          response,
          provider: step.provider,
          model: step.model,
          step: i,
          totalSteps: params.chain.length,
          totalCost,
        };
      }
    } catch (error) {
      console.warn(
        `[DeepEyeClaw] Cascade step ${i + 1}/${params.chain.length} failed (${step.provider}/${step.model}): ${String(error)}`,
      );
      // Continue to next step on failure.
    }
  }

  // Return best response seen, even if no threshold was met.
  if (bestResponse === null) {
    throw new Error("[DeepEyeClaw] All cascade steps failed");
  }

  return {
    response: bestResponse,
    provider: bestProvider,
    model: bestModel,
    step: bestStep,
    totalSteps: params.chain.length,
    totalCost,
  };
}

// ─── Convenience: Full Pipeline ─────────────────────────────────────────────

/**
 * High-level: classify → route → return decision.
 * Import classifyQuery separately if you need the classification too.
 */
export { classifyQuery } from "./query-classifier.js";
