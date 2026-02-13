/**
 * DeepEyeClaw — Smart Routing Types
 *
 * Core type definitions for the query classifier, cost calculator,
 * smart router, budget tracker, and semantic cache.
 */

// ─── Query Classification ───────────────────────────────────────────────────

export type QueryComplexity = "simple" | "medium" | "complex";

export type QueryIntent =
  | "search" // Needs web search / real-time data
  | "reasoning" // Deep analysis, multi-step logic
  | "chat" // Simple conversation / Q&A
  | "creative" // Content generation, writing
  | "code"; // Programming tasks

export type ClassifiedQuery = {
  text: string;
  complexity: QueryComplexity;
  complexityScore: number; // 0.0 – 1.0
  intent: QueryIntent;
  isRealtime: boolean;
  /** Keywords that influenced the classification. */
  matchedIndicators: string[];
  /** Estimated input token count (rough heuristic). */
  estimatedTokens: number;
};

// ─── Provider & Model Costs ─────────────────────────────────────────────────

export type ProviderName = "perplexity" | "openai" | "anthropic";

export type ModelCostProfile = {
  provider: ProviderName;
  model: string;
  /** Cost per 1K input tokens (USD). */
  inputCostPer1k: number;
  /** Cost per 1K output tokens (USD). */
  outputCostPer1k: number;
  /** Fixed per-request cost (e.g. Perplexity search fee). */
  perRequestCost: number;
  /** Maximum output tokens. */
  maxOutputTokens: number;
  /** Context window size in tokens. */
  contextWindow: number;
  /** What complexity levels this model handles well. */
  suitableFor: QueryComplexity[];
  /** Model-specific capabilities. */
  capabilities: ModelCapability[];
};

export type ModelCapability =
  | "web_search"
  | "citations"
  | "deep_search"
  | "reasoning"
  | "chain_of_thought"
  | "images"
  | "code"
  | "long_context";

// ─── Cost Estimation ────────────────────────────────────────────────────────

export type CostEstimate = {
  provider: ProviderName;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
    perRequestCost: number;
  };
};

export type ActualCost = {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  timestamp: number;
};

// ─── Routing ────────────────────────────────────────────────────────────────

export type RoutingStrategy = "priority" | "cost-optimized" | "cascade" | "emergency";

export type RoutingDecision = {
  provider: ProviderName;
  model: string;
  strategy: RoutingStrategy;
  reason: string;
  estimatedCost: CostEstimate;
  /** If cascade, the chain of models to try in order. */
  cascadeChain?: CascadeStep[];
  /** Whether emergency mode forced this decision. */
  emergencyMode: boolean;
};

export type CascadeStep = {
  provider: ProviderName;
  model: string;
  qualityThreshold: number;
  maxCost: number;
};

// ─── Budget ─────────────────────────────────────────────────────────────────

export type BudgetPeriod = "daily" | "weekly" | "monthly";

export type BudgetStatus = {
  period: BudgetPeriod;
  limit: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  periodStart: number;
  periodEnd: number;
};

export type BudgetConfig = {
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  alertThresholds: BudgetAlertThreshold[];
  emergencyMode: EmergencyModeConfig;
};

export type BudgetAlertThreshold = {
  percentage: number;
  action: "log" | "notify" | "emergency_mode";
  channels?: string[];
};

export type EmergencyModeConfig = {
  enabled: boolean;
  forceCheapestModels: boolean;
  disableProviders: ProviderName[];
  notifyAdmin: boolean;
};

// ─── Cache ──────────────────────────────────────────────────────────────────

export type CacheEntry = {
  queryHash: string;
  queryText: string;
  response: string;
  provider: ProviderName;
  model: string;
  cost: number;
  tokensUsed: number;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  /** Embedding vector for semantic similarity matching. */
  embedding?: number[];
};

export type CacheStats = {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  totalCostSaved: number;
  avgResponseTimeMs: number;
};

// ─── Analytics Event ────────────────────────────────────────────────────────

export type AnalyticsEvent = {
  id: string;
  timestamp: number;
  eventType: "query" | "cache_hit" | "cache_miss" | "budget_alert" | "error" | "cascade";
  query?: string;
  classification?: ClassifiedQuery;
  routing?: RoutingDecision;
  cost?: ActualCost;
  cacheHit?: boolean;
  responseTimeMs?: number;
  error?: string;
};

// ─── DeepEye Config (extends OpenClaw) ──────────────────────────────────────

export type DeepEyeConfig = {
  routing?: {
    strategy?: RoutingStrategy;
    defaultProvider?: ProviderName;
    complexityThresholds?: {
      simple: number;
      medium: number;
      complex: number;
    };
  };
  budget?: BudgetConfig;
  cache?: {
    enabled?: boolean;
    maxEntries?: number;
    defaultTtlMs?: number;
    realtimeTtlMs?: number;
    similarityThreshold?: number;
  };
  analytics?: {
    enabled?: boolean;
    logLevel?: "error" | "warn" | "info" | "debug";
    storagePath?: string;
    retentionDays?: number;
  };
  perplexity?: {
    enabled?: boolean;
    monthlyBudget?: number;
    alertAtPercentage?: number;
  };
};
