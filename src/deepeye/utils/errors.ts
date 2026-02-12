/**
 * DeepEyeClaw — Error Hierarchy
 *
 * Typed errors for clean catch/handle flows across the gateway.
 */

export class DeepEyeClawError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = "DEEPEYE_ERROR",
    statusCode: number = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DeepEyeClawError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class ProviderError extends DeepEyeClawError {
  readonly provider: string;
  readonly model?: string;

  constructor(
    provider: string,
    message: string,
    opts: { code?: string; statusCode?: number; model?: string; details?: Record<string, unknown> } = {},
  ) {
    super(
      `[${provider}] ${message}`,
      opts.code ?? "PROVIDER_ERROR",
      opts.statusCode ?? 502,
      opts.details,
    );
    this.name = "ProviderError";
    this.provider = provider;
    this.model = opts.model;
  }
}

export class BudgetExceededError extends DeepEyeClawError {
  constructor(period: string, spent: number, limit: number) {
    super(
      `Budget exceeded for ${period}: $${spent.toFixed(4)} / $${limit.toFixed(2)}`,
      "BUDGET_EXCEEDED",
      429,
      { period, spent, limit },
    );
    this.name = "BudgetExceededError";
  }
}

export class CacheError extends DeepEyeClawError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CACHE_ERROR", 500, details);
    this.name = "CacheError";
  }
}

export class ConfigError extends DeepEyeClawError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", 500, details);
    this.name = "ConfigError";
  }
}

export class RateLimitError extends DeepEyeClawError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      `Rate limited. Retry after ${retryAfterMs}ms`,
      "RATE_LIMITED",
      429,
      { retryAfterMs },
    );
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}
