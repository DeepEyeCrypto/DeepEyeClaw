/**
 * DeepEyeClaw — Module Index
 *
 * Public API for the DeepEye smart routing system.
 */

// Types
export type {
  QueryComplexity,
  QueryIntent,
  ClassifiedQuery,
  ProviderName,
  ModelCostProfile,
  ModelCapability,
  CostEstimate,
  ActualCost,
  RoutingStrategy,
  RoutingDecision,
  CascadeStep,
  BudgetPeriod,
  BudgetStatus,
  BudgetConfig,
  BudgetAlertThreshold,
  EmergencyModeConfig,
  CacheEntry,
  CacheStats,
  AnalyticsEvent,
  DeepEyeConfig,
} from "./types.js";

// Query Classifier
export { classifyQuery } from "./query-classifier.js";

// Cost Calculator
export {
  estimateCost,
  computeActualCost,
  estimateOutputTokens,
  listModelsByCost,
  listModelsForComplexity,
  cheapestModelWithinBudget,
  wouldExceedBudget,
} from "./cost-calculator.js";

// Smart Router
export {
  routeQuery,
  executeCascade,
  type SmartRouterConfig,
  type CascadeResult,
} from "./smart-router.js";

// Budget Tracker
export { BudgetTracker, getBudgetTracker, resetBudgetTracker } from "./budget-tracker.js";

// Quality Estimator
export {
  QualityEstimator,
  getQualityEstimator,
  type QualitySignal,
  type QualityReport,
} from "./quality-estimator.js";

// Routing Artifacts
export {
  ArtifactManager,
  getArtifactManager,
  resetArtifactManager,
  type RoutingArtifact,
  type ArtifactType,
  type CascadeTrailEntry,
} from "./artifacts.js";

// Agent Manager
export {
  AgentManager,
  getAgentManager,
  resetAgentManager,
  type AgentResponse,
  type ManagerView,
} from "./agent-manager.js";

// Perplexity
export {
  PERPLEXITY_MODELS,
  PERPLEXITY_BASE_URL,
  selectPerplexityModel,
  formatCitations,
  suggestRecencyFilter,
} from "./perplexity-provider.js";

// Cache
export { SemanticCache, type CacheAdapter, type SemanticCacheConfig } from "./cache/semantic.js";
export { MemoryAdapter } from "./cache/adapters/memory.js";
export { RedisAdapter } from "./cache/adapters/redis.js";

// Analytics
export { AnalyticsCollector, getAnalytics, resetAnalytics } from "./analytics/collector.js";

// Providers
export {
  BaseProvider,
  type ChatRequest,
  type ChatResponse,
  type ProviderHealth,
} from "./providers/base.js";
export { PerplexityProvider } from "./providers/perplexity.js";
export { OpenAIProvider } from "./providers/openai.js";
export { AnthropicProvider } from "./providers/anthropic.js";

// Metrics
export {
  registry as metricsRegistry,
  recordQueryMetrics,
  recordEscalation,
  recordError as recordMetricError,
  updateBudgetMetrics,
  updateCacheMetrics,
  updateProviderHealth,
  getMetricsOutput,
} from "./metrics.js";

// Utilities
export {
  DeepEyeClawError,
  ProviderError,
  BudgetExceededError,
  CacheError,
  RateLimitError,
} from "./utils/errors.js";
export { uid, sleep, hashString, formatCost, truncate, startTimer } from "./utils/helpers.js";
export { childLogger } from "./utils/logger.js";
