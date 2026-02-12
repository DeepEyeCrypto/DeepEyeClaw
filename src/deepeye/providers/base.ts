/**
 * DeepEyeClaw — Abstract Provider Base
 *
 * All AI provider adapters extend this class for a consistent interface:
 *   chat() → send a query and get a response
 *   estimateCost() → pre-flight cost estimate
 *   getHealth() → check provider health
 */

import { EventEmitter } from "node:events";
import type { ProviderName, ActualCost } from "../types.js";
import { ProviderError } from "../utils/errors.js";
import { childLogger } from "../utils/logger.js";
import { uid, startTimer, backoffMs, sleep } from "../utils/helpers.js";
import type { Logger } from "winston";

// ── Shared interfaces ───────────────────────────────────────────────────────

export interface ChatRequest {
  id?: string;
  content: string;
  systemPrompt?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  id: string;
  content: string;
  provider: ProviderName;
  model: string;
  tokens: { input: number; output: number; total: number };
  cost: number;
  responseTimeMs: number;
  citations?: Array<{ url: string; title?: string }>;
  cacheHit: boolean;
  finishReason?: string;
}

export interface ProviderHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  lastChecked: number;
  errorRate: number;
  totalRequests: number;
  totalErrors: number;
}

// ── Base class ──────────────────────────────────────────────────────────────

export abstract class BaseProvider extends EventEmitter {
  readonly name: ProviderName;
  protected log: Logger;
  protected health: ProviderHealth = {
    status: "healthy",
    latencyMs: 0,
    lastChecked: Date.now(),
    errorRate: 0,
    totalRequests: 0,
    totalErrors: 0,
  };

  constructor(name: ProviderName) {
    super();
    this.name = name;
    this.log = childLogger(`provider:${name}`);
  }

  /**
   * Send a chat completion request.
   * Subclasses implement `_chat()`, this wrapper adds timing, retries, and
   * health-tracking.
   */
  async chat(req: ChatRequest, model: string, opts?: Record<string, unknown>): Promise<ChatResponse> {
    const requestId = req.id ?? uid();
    const elapsed = startTimer();

    this.health.totalRequests++;
    this.log.debug("chat request", { requestId, model, contentLen: req.content.length });

    try {
      const response = await this.withRetry(() => this._chat(req, model, opts), 2);
      const ms = elapsed();

      this.updateHealth({ latencyMs: ms, status: "healthy" });
      this.log.info("chat OK", {
        requestId,
        model,
        tokens: response.tokens.total,
        cost: response.cost,
        ms,
      });

      this.emit("response", response);
      return { ...response, id: requestId, responseTimeMs: ms, cacheHit: false };
    } catch (err) {
      this.health.totalErrors++;
      const errRate = this.health.totalErrors / this.health.totalRequests;
      this.updateHealth({ errorRate: errRate, status: errRate > 0.3 ? "unhealthy" : "degraded" });

      const wrapped =
        err instanceof ProviderError
          ? err
          : new ProviderError(this.name, (err as Error).message, { model });

      this.log.error("chat failed", { requestId, model, error: wrapped.message });
      this.emit("error", wrapped);
      throw wrapped;
    }
  }

  /** Subclass implements the actual API call here. */
  protected abstract _chat(req: ChatRequest, model: string, opts?: Record<string, unknown>): Promise<ChatResponse>;

  /** Return available model names. */
  abstract getAvailableModels(): string[];

  /** Estimate cost for a given token count. */
  abstract estimateCost(inputTokens: number, outputTokens: number, model: string): number;

  /** Health check — ping the provider. */
  abstract healthCheck(): Promise<boolean>;

  // ── Shared logic ────────────────────────────────────────────────────────

  getHealth(): ProviderHealth {
    return { ...this.health };
  }

  updateHealth(partial: Partial<ProviderHealth>): void {
    Object.assign(this.health, partial, { lastChecked: Date.now() });
    this.emit("healthChange", this.health);
  }

  protected async withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let last: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        last = err as Error;
        if (attempt < maxRetries) {
          const delay = backoffMs(attempt);
          this.log.warn("retrying", { attempt: attempt + 1, delay, error: last.message });
          await sleep(delay);
        }
      }
    }
    throw last;
  }

  /** Convert an ActualCost record for internal tracking. */
  protected toCost(model: string, input: number, output: number, cost: number): ActualCost {
    return {
      provider: this.name,
      model,
      inputTokens: input,
      outputTokens: output,
      totalCost: cost,
      timestamp: Date.now(),
    };
  }
}
