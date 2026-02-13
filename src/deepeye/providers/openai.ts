/**
 * DeepEyeClaw — OpenAI Provider (Gateway Adapter)
 *
 * Wraps GPT-4o / GPT-4o-mini via the official chat completions endpoint.
 */

import { ProviderError } from "../utils/errors.js";
import { uid } from "../utils/helpers.js";
import { BaseProvider, type ChatRequest, type ChatResponse } from "./base.js";

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
};

const BASE_URL = "https://api.openai.com/v1";

export class OpenAIProvider extends BaseProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    super("openai");
    this.apiKey = apiKey;
    this.log.info("OpenAI provider initialized", {
      models: this.getAvailableModels(),
    });
  }

  getAvailableModels(): string[] {
    return Object.keys(MODEL_PRICES);
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const p = MODEL_PRICES[model] ?? MODEL_PRICES["gpt-4o-mini"];
    return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  protected async _chat(
    req: ChatRequest,
    model: string,
    opts?: Record<string, unknown>,
  ): Promise<ChatResponse> {
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
      ...opts,
    };

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      throw new ProviderError("openai", `API ${res.status}: ${errText}`, {
        statusCode: res.status,
        model,
      });
    }

    const data = (await res.json()) as Record<string, any>;
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";
    const usage = data.usage ?? {};

    const input = usage.prompt_tokens ?? 0;
    const output = usage.completion_tokens ?? 0;
    const cost = this.estimateCost(input, output, model);

    return {
      id: data.id ?? uid(),
      content,
      provider: "openai",
      model,
      tokens: { input, output, total: input + output },
      cost,
      responseTimeMs: 0,
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
