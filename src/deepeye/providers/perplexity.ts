/**
 * DeepEyeClaw — Perplexity Provider (Gateway Adapter)
 *
 * Wraps Perplexity's Sonar API via OpenAI-compatible completions.
 * Supports citations, search recency filtering, and domain filtering.
 */

import { BaseProvider, type ChatRequest, type ChatResponse } from "./base.js";
import { ProviderError } from "../utils/errors.js";
import { uid } from "../utils/helpers.js";
import {
  PERPLEXITY_BASE_URL,
  PERPLEXITY_MODELS,
  selectPerplexityModel,
  formatCitations,
  suggestRecencyFilter,
} from "../perplexity-provider.js";
import type { ClassifiedQuery } from "../types.js";

const MODEL_PRICES: Record<string, { input: number; output: number; perRequest: number }> = {
  sonar:                { input: 0.001, output: 0.001, perRequest: 0.005 },
  "sonar-pro":          { input: 0.003, output: 0.015, perRequest: 0.005 },
  "sonar-reasoning-pro": { input: 0.002, output: 0.008, perRequest: 0.005 },
};

export class PerplexityProvider extends BaseProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    super("perplexity");
    this.apiKey = apiKey;
    this.baseUrl = PERPLEXITY_BASE_URL;
    this.log.info("Perplexity provider initialized", {
      models: this.getAvailableModels(),
    });
  }

  getAvailableModels(): string[] {
    return Object.keys(MODEL_PRICES);
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const p = MODEL_PRICES[model] ?? MODEL_PRICES.sonar;
    return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output + p.perRequest;
  }

  /** Select the best Perplexity model for a given classified query. */
  selectModel(query: ClassifiedQuery): string {
    return selectPerplexityModel({
      isRealtime: query.isRealtime,
      needsReasoning: query.intent === "reasoning",
      needsDeepSearch: query.intent === "search" && query.complexity !== "simple",
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  protected async _chat(req: ChatRequest, model: string, opts?: Record<string, unknown>): Promise<ChatResponse> {
    const messages: Array<{ role: string; content: string }> = [];

    if (req.systemPrompt) {
      messages.push({ role: "system", content: req.systemPrompt });
    }
    if (req.conversationHistory) {
      messages.push(...req.conversationHistory);
    }
    messages.push({ role: "user", content: req.content });

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
      return_citations: true,
      ...(opts ?? {}),
    };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      throw new ProviderError("perplexity", `API ${res.status}: ${errText}`, {
        statusCode: res.status,
        model,
      });
    }

    const data = (await res.json()) as Record<string, any>;
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";
    const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const citations = data.citations ?? [];

    const input = usage.prompt_tokens ?? 0;
    const output = usage.completion_tokens ?? 0;
    const cost = this.estimateCost(input, output, model);

    return {
      id: data.id ?? uid(),
      content,
      provider: "perplexity",
      model,
      tokens: { input, output, total: input + output },
      cost,
      responseTimeMs: 0, // filled by base
      citations: citations.map((c: any) => ({
        url: typeof c === "string" ? c : c.url,
        title: typeof c === "object" ? c.title : undefined,
      })),
      cacheHit: false,
      finishReason: choice?.finish_reason,
    };
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }
}
