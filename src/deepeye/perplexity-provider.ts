/**
 * DeepEyeClaw — Perplexity Provider
 *
 * OpenAI-compatible API client for Perplexity's Sonar family.
 * Supports:
 *   - sonar (fast web search)
 *   - sonar-pro (deep search with images)
 *   - sonar-reasoning-pro (DeepSeek-R1 powered reasoning + search)
 *
 * Follows the existing OpenClaw provider pattern (build*Provider).
 */

import type { ModelDefinitionConfig, ModelProviderConfig } from "../config/types.models.js";

// ─── Constants ──────────────────────────────────────────────────────────────

export const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";
export const PERPLEXITY_PROVIDER_ID = "perplexity";

// ─── Model Definitions ─────────────────────────────────────────────────────

const SONAR: ModelDefinitionConfig = {
  id: "sonar",
  name: "Perplexity Sonar",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 1,      // $1 per 1M input tokens → $0.001 per 1K
    output: 1,     // $1 per 1M output tokens
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 128000,
  maxTokens: 16384,
};

const SONAR_PRO: ModelDefinitionConfig = {
  id: "sonar-pro",
  name: "Perplexity Sonar Pro",
  reasoning: false,
  input: ["text", "image"],
  cost: {
    input: 3,      // $3 per 1M input tokens
    output: 15,    // $15 per 1M output tokens
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 200000,
  maxTokens: 16384,
};

const SONAR_REASONING_PRO: ModelDefinitionConfig = {
  id: "sonar-reasoning-pro",
  name: "Perplexity Sonar Reasoning Pro",
  reasoning: true,
  input: ["text"],
  cost: {
    input: 2,      // $2 per 1M input tokens
    output: 8,     // $8 per 1M output tokens
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 128000,
  maxTokens: 16384,
};

export const PERPLEXITY_MODELS: ModelDefinitionConfig[] = [
  SONAR,
  SONAR_PRO,
  SONAR_REASONING_PRO,
];

// ─── Provider Builder (follows OpenClaw pattern) ────────────────────────────

/**
 * Build a Perplexity provider config for OpenClaw's model registry.
 * Use the OpenAI-compatible completions API.
 */
export function buildPerplexityProvider(): ModelProviderConfig {
  return {
    baseUrl: PERPLEXITY_BASE_URL,
    api: "openai-completions",
    models: PERPLEXITY_MODELS,
  };
}

// ─── Perplexity-specific Request Helpers ────────────────────────────────────

/**
 * Perplexity extends the OpenAI request format with additional fields.
 * These are added as extra params when routing through the OpenAI SDK.
 */
export type PerplexitySearchOptions = {
  /** Whether to return web sources. Default: true for Sonar models. */
  return_citations?: boolean;
  /** How many search results to consider. Default: provider decides. */
  search_domain_filter?: string[];
  /** Recency filter for search results. */
  search_recency_filter?: "month" | "week" | "day" | "hour";
  /** Whether to return images (sonar-pro only). */
  return_images?: boolean;
  /** Whether to return related questions. */
  return_related_questions?: boolean;
};

export type PerplexityCitation = {
  url: string;
  text?: string;
};

export type PerplexityResponse = {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  citations?: PerplexityCitation[] | string[];
  images?: Array<{ url: string; description?: string }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/**
 * Build the extra body params for a Perplexity API call.
 * These get merged into the OpenAI SDK request body.
 */
export function buildPerplexityExtraParams(
  model: string,
  options?: PerplexitySearchOptions,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};

  // Citations are on by default for all Sonar models.
  extra.return_citations = options?.return_citations ?? true;

  if (options?.search_recency_filter) {
    extra.search_recency_filter = options.search_recency_filter;
  }

  if (options?.search_domain_filter && options.search_domain_filter.length > 0) {
    extra.search_domain_filter = options.search_domain_filter;
  }

  // Images only supported on sonar-pro.
  if (model === "sonar-pro" && options?.return_images !== false) {
    extra.return_images = options?.return_images ?? false;
  }

  if (options?.return_related_questions) {
    extra.return_related_questions = true;
  }

  return extra;
}

/**
 * Determine the best Perplexity model based on query characteristics.
 */
export function selectPerplexityModel(params: {
  isRealtime: boolean;
  needsReasoning: boolean;
  needsDeepSearch: boolean;
}): string {
  if (params.needsReasoning) return "sonar-reasoning-pro";
  if (params.needsDeepSearch) return "sonar-pro";
  return "sonar";
}

/**
 * Determine the search recency filter based on query intent.
 */
export function suggestRecencyFilter(
  isRealtime: boolean,
  text: string,
): PerplexitySearchOptions["search_recency_filter"] | undefined {
  if (!isRealtime) return undefined;

  const lower = text.toLowerCase();
  if (lower.includes("right now") || lower.includes("live") || lower.includes("breaking")) {
    return "hour";
  }
  if (lower.includes("today") || lower.includes("this morning") || lower.includes("tonight")) {
    return "day";
  }
  if (lower.includes("this week") || lower.includes("recent")) {
    return "week";
  }
  return "day"; // default for real-time queries
}

/**
 * Format Perplexity citations into a readable string for messaging platforms.
 */
export function formatCitations(
  citations: PerplexityCitation[] | string[] | undefined,
): string {
  if (!citations || citations.length === 0) return "";

  const formatted = citations.map((c, i) => {
    const url = typeof c === "string" ? c : c.url;
    return `[${i + 1}] ${url}`;
  });

  return `\n\n📚 Sources:\n${formatted.join("\n")}`;
}
