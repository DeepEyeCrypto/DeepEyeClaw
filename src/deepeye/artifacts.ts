/**
 * DeepEyeClaw — Routing Artifacts
 *
 * Every routing decision generates a human-reviewable artifact.
 * Not logs. Artifacts. Transparent, auditable decisions.
 *
 * Stores recent artifacts in memory with a capped ring buffer.
 * Emits "artifact" events for WebSocket broadcast.
 */

import { EventEmitter } from "node:events";
import type { ClassifiedQuery, RoutingDecision, ProviderName, ActualCost } from "./types.js";
import type { ChatResponse } from "./providers/base.js";
import type { QualityReport } from "./quality-estimator.js";
import { uid } from "./utils/helpers.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoutingArtifact {
  /** Unique artifact ID */
  id: string;
  /** Unique query ID */
  queryId: string;
  /** ISO timestamp */
  timestamp: string;
  /** Time of recording (epoch ms) */
  epochMs: number;
  /** Artifact type */
  type: ArtifactType;
  /** Query complexity classification */
  complexity: { level: string; score: number };
  /** Selected model */
  selectedModel: { provider: string; model: string };
  /** Estimated cost */
  estimatedCost: number;
  /** Actual cost (if available) */
  actualCost?: number;
  /** Routing confidence (0–1) */
  confidence: number;
  /** Human-readable reasoning */
  reasoning: string;
  /** Cascade trail (if cascade strategy used) */
  cascadeTrail?: CascadeTrailEntry[];
  /** Quality report (if evaluated) */
  qualityReport?: QualityReport;
  /** Cache interaction */
  cache?: {
    hit: boolean;
    similarity?: number;
    savedCost?: number;
    savedLatencyMs?: number;
  };
  /** Budget state at decision time */
  budgetSnapshot?: {
    dailySpent: number;
    dailyLimit: number;
    percentUsed: number;
    emergencyMode: boolean;
  };
  /** Response metadata */
  response?: {
    contentLength: number;
    tokensUsed: number;
    responseTimeMs: number;
    finishReason?: string;
  };
  /** Tags for filtering */
  tags: string[];
}

export type ArtifactType =
  | "route_decision"
  | "cascade_start"
  | "cascade_escalation"
  | "cascade_success"
  | "cascade_failure"
  | "cache_hit"
  | "cache_miss"
  | "budget_reject"
  | "emergency_mode"
  | "error";

export interface CascadeTrailEntry {
  tier: number;
  provider: string;
  model: string;
  qualityScore: number;
  qualityThreshold: number;
  action: "accepted" | "escalated" | "failed";
  costEstimate: number;
  latencyMs?: number;
}

// ── Artifact Manager ─────────────────────────────────────────────────────────

export class ArtifactManager extends EventEmitter {
  private artifacts: RoutingArtifact[] = [];
  private maxArtifacts: number;

  constructor(maxArtifacts: number = 5000) {
    super();
    this.maxArtifacts = maxArtifacts;
  }

  // ── Create Artifacts ────────────────────────────────────────────────────

  /** Record a routing decision artifact */
  recordRouteDecision(params: {
    queryId: string;
    query: ClassifiedQuery;
    decision: RoutingDecision;
    confidence?: number;
  }): RoutingArtifact {
    const artifact: RoutingArtifact = {
      id: uid(),
      queryId: params.queryId,
      timestamp: new Date().toISOString(),
      epochMs: Date.now(),
      type: "route_decision",
      complexity: {
        level: params.query.complexity,
        score: params.query.complexityScore,
      },
      selectedModel: {
        provider: params.decision.provider,
        model: params.decision.model,
      },
      estimatedCost: params.decision.estimatedCost.estimatedCost,
      confidence: params.confidence ?? 0.8,
      reasoning: params.decision.reason,
      cascadeTrail: params.decision.cascadeChain?.map((step, i) => ({
        tier: i + 1,
        provider: step.provider,
        model: step.model,
        qualityScore: 0,
        qualityThreshold: step.qualityThreshold,
        action: i === 0 ? "accepted" as const : "escalated" as const,
        costEstimate: step.maxCost,
      })),
      tags: [
        params.decision.strategy,
        params.query.complexity,
        params.query.intent,
        params.decision.emergencyMode ? "emergency" : "normal",
      ],
    };

    return this.push(artifact);
  }

  /** Record a cascade escalation */
  recordCascadeStep(params: {
    queryId: string;
    query: ClassifiedQuery;
    fromProvider: ProviderName;
    fromModel: string;
    toProvider?: ProviderName;
    toModel?: string;
    qualityScore: number;
    qualityThreshold: number;
    cost: number;
    latencyMs?: number;
    isLast: boolean;
  }): RoutingArtifact {
    const type: ArtifactType = params.toProvider
      ? "cascade_escalation"
      : (params.qualityScore >= params.qualityThreshold ? "cascade_success" : "cascade_failure");

    const artifact: RoutingArtifact = {
      id: uid(),
      queryId: params.queryId,
      timestamp: new Date().toISOString(),
      epochMs: Date.now(),
      type,
      complexity: {
        level: params.query.complexity,
        score: params.query.complexityScore,
      },
      selectedModel: {
        provider: params.fromProvider,
        model: params.fromModel,
      },
      estimatedCost: params.cost,
      confidence: params.qualityScore / 10,
      reasoning: params.toProvider
        ? `Quality ${params.qualityScore.toFixed(1)}/${params.qualityThreshold} → escalating to ${params.toProvider}/${params.toModel}`
        : `Quality ${params.qualityScore.toFixed(1)}/${params.qualityThreshold} → ${params.qualityScore >= params.qualityThreshold ? "accepted" : "best available"}`,
      tags: ["cascade", params.query.complexity, params.isLast ? "final" : "intermediate"],
    };

    return this.push(artifact);
  }

  /** Record a cache hit artifact */
  recordCacheHit(params: {
    queryId: string;
    query: ClassifiedQuery;
    similarity: number;
    savedCost: number;
    savedLatencyMs: number;
    provider: string;
    model: string;
  }): RoutingArtifact {
    const artifact: RoutingArtifact = {
      id: uid(),
      queryId: params.queryId,
      timestamp: new Date().toISOString(),
      epochMs: Date.now(),
      type: "cache_hit",
      complexity: { level: params.query.complexity, score: params.query.complexityScore },
      selectedModel: { provider: params.provider, model: params.model },
      estimatedCost: 0,
      confidence: params.similarity,
      reasoning: `Cache hit (${(params.similarity * 100).toFixed(1)}% similarity) — saved $${params.savedCost.toFixed(4)}`,
      cache: {
        hit: true,
        similarity: params.similarity,
        savedCost: params.savedCost,
        savedLatencyMs: params.savedLatencyMs,
      },
      tags: ["cache", "hit", params.query.complexity],
    };

    return this.push(artifact);
  }

  /** Record a budget rejection */
  recordBudgetReject(params: {
    queryId: string;
    query: ClassifiedQuery;
    dailySpent: number;
    dailyLimit: number;
    estimatedCost: number;
  }): RoutingArtifact {
    const percentUsed = (params.dailySpent / params.dailyLimit) * 100;
    const artifact: RoutingArtifact = {
      id: uid(),
      queryId: params.queryId,
      timestamp: new Date().toISOString(),
      epochMs: Date.now(),
      type: "budget_reject",
      complexity: { level: params.query.complexity, score: params.query.complexityScore },
      selectedModel: { provider: "none", model: "none" },
      estimatedCost: params.estimatedCost,
      confidence: 1.0,
      reasoning: `Budget exceeded: $${params.dailySpent.toFixed(4)} / $${params.dailyLimit.toFixed(2)} (${percentUsed.toFixed(1)}%)`,
      budgetSnapshot: {
        dailySpent: params.dailySpent,
        dailyLimit: params.dailyLimit,
        percentUsed,
        emergencyMode: percentUsed >= 95,
      },
      tags: ["budget", "rejected", percentUsed >= 95 ? "emergency" : "over_limit"],
    };

    return this.push(artifact);
  }

  /** Enrich an existing artifact with response data */
  enrichWithResponse(artifactId: string, response: ChatResponse, qualityReport?: QualityReport): void {
    const artifact = this.artifacts.find(a => a.id === artifactId);
    if (!artifact) return;

    artifact.actualCost = response.cost;
    artifact.response = {
      contentLength: response.content.length,
      tokensUsed: response.tokens.total,
      responseTimeMs: response.responseTimeMs,
      finishReason: response.finishReason,
    };
    if (qualityReport) {
      artifact.qualityReport = qualityReport;
      artifact.confidence = qualityReport.confidence;
    }
  }

  // ── Query ───────────────────────────────────────────────────────────────

  /** Get recent artifacts (newest first) */
  getRecent(limit: number = 20): RoutingArtifact[] {
    return this.artifacts.slice(0, limit);
  }

  /** Get all artifacts for a query */
  getByQueryId(queryId: string): RoutingArtifact[] {
    return this.artifacts.filter(a => a.queryId === queryId);
  }

  /** Get artifacts by type */
  getByType(type: ArtifactType, limit?: number): RoutingArtifact[] {
    const filtered = this.artifacts.filter(a => a.type === type);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /** Get artifacts by tag */
  getByTag(tag: string, limit?: number): RoutingArtifact[] {
    const filtered = this.artifacts.filter(a => a.tags.includes(tag));
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /** Get artifacts in a time range */
  getByTimeRange(startMs: number, endMs: number): RoutingArtifact[] {
    return this.artifacts.filter(a => a.epochMs >= startMs && a.epochMs <= endMs);
  }

  /** Get summary statistics */
  getSummary() {
    const now = Date.now();
    const dayStart = now - 86_400_000;
    const today = this.artifacts.filter(a => a.epochMs >= dayStart);

    const byType: Record<string, number> = {};
    const totalCost = today.reduce((sum, a) => {
      byType[a.type] = (byType[a.type] ?? 0) + 1;
      return sum + (a.actualCost ?? a.estimatedCost);
    }, 0);

    const cascadeEscalations = today.filter(a => a.type === "cascade_escalation").length;
    const cacheHits = today.filter(a => a.type === "cache_hit").length;
    const avgConfidence = today.length > 0
      ? today.reduce((sum, a) => sum + a.confidence, 0) / today.length
      : 0;

    return {
      totalArtifacts: this.artifacts.length,
      todayCount: today.length,
      byType,
      totalCostToday: totalCost,
      cascadeEscalations,
      cacheHits,
      avgConfidence,
    };
  }

  /** Total artifact count */
  get size(): number {
    return this.artifacts.length;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private push(artifact: RoutingArtifact): RoutingArtifact {
    this.artifacts.unshift(artifact);
    if (this.artifacts.length > this.maxArtifacts) {
      this.artifacts = this.artifacts.slice(0, this.maxArtifacts);
    }
    this.emit("artifact", artifact);
    return artifact;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _manager: ArtifactManager | null = null;

export function getArtifactManager(): ArtifactManager {
  if (!_manager) _manager = new ArtifactManager();
  return _manager;
}

export function resetArtifactManager(): void {
  _manager = null;
}
