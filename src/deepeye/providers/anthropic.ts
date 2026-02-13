/**
 * DeepEyeClaw — Anthropic Provider (Gateway Adapter)
 *
 * Wraps Claude Sonnet 4.5 / Opus 4.6 via the Messages API.
 */

import { ProviderError } from "../utils/errors.js";
import { uid } from "../utils/helpers.js";
import { BaseProvider, type ChatRequest, type ChatResponse } from "./base.js";

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 0.003, output: 0.015 },
  "claude-opus-4-6": { input: 0.015, output: 0.075 },
};

const BASE_URL = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";

export class AnthropicProvider extends BaseProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    super("anthropic");
    this.apiKey = apiKey;
    this.log.info("Anthropic provider initialized", {
      models: this.getAvailableModels(),
    });
  }

  getAvailableModels(): string[] {
    return Object.keys(MODEL_PRICES);
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    const p = MODEL_PRICES[model] ?? MODEL_PRICES["claude-sonnet-4-5"];
    return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      // Even 400 means the API is reachable
      return res.status < 500;
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

    if (req.conversationHistory) {
      messages.push(...req.conversationHistory);
    }
    messages.push({ role: "user", content: req.content });

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
      ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
      ...opts,
    };

    const res = await fetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      throw new ProviderError("anthropic", `API ${res.status}: ${errText}`, {
        statusCode: res.status,
        model,
      });
    }

    const data = (await res.json()) as Record<string, any>;
    const textBlock = data.content?.find((b: any) => b.type === "text");
    const content = textBlock?.text ?? "";
    const usage = data.usage ?? {};

    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cost = this.estimateCost(input, output, model);

    return {
      id: data.id ?? uid(),
      content,
      provider: "anthropic",
      model,
      tokens: { input, output, total: input + output },
      cost,
      responseTimeMs: 0,
      cacheHit: false,
      finishReason: data.stop_reason,
    };
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": API_VERSION,
    };
  }
}
