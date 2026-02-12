/**
 * DeepEyeClaw — Analytics Collector
 *
 * Central event bus for recording query events, costs, cache hits/misses,
 * and provider health updates. Events are stored in-memory with an
 * optional file-persistence layer, and broadcast via WebSocket for the
 * real-time dashboard.
 */

import { EventEmitter } from "node:events";
import type { AnalyticsEvent, ProviderName, ClassifiedQuery, RoutingDecision, ActualCost } from "../types.js";
import { childLogger } from "../utils/logger.js";
import { uid } from "../utils/helpers.js";

const log = childLogger("analytics");

export interface AnalyticsConfig {
  maxEvents: number;
  retentionMs: number;
}

const DEFAULTS: AnalyticsConfig = {
  maxEvents: 10_000,
  retentionMs: 7 * 86_400_000, // 7 days
};

export class AnalyticsCollector extends EventEmitter {
  private events: AnalyticsEvent[] = [];
  private config: AnalyticsConfig;

  constructor(config?: Partial<AnalyticsConfig>) {
    super();
    this.config = { ...DEFAULTS, ...config };
    log.info("Analytics collector initialized", { maxEvents: this.config.maxEvents });
  }

  // ── Record Events ───────────────────────────────────────────────────────

  recordQuery(params: {
    query: string;
    classification: ClassifiedQuery;
    routing: RoutingDecision;
    cost: ActualCost;
    responseTimeMs: number;
    cacheHit: boolean;
  }): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: uid(),
      timestamp: Date.now(),
      eventType: params.cacheHit ? "cache_hit" : "query",
      query: params.query,
      classification: params.classification,
      routing: params.routing,
      cost: params.cost,
      cacheHit: params.cacheHit,
      responseTimeMs: params.responseTimeMs,
    };

    this.push(event);
    return event;
  }

  recordCacheHit(query: string, costSaved: number): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: uid(),
      timestamp: Date.now(),
      eventType: "cache_hit",
      query,
      cacheHit: true,
      cost: {
        provider: "perplexity",
        model: "cache",
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        timestamp: Date.now(),
      },
      responseTimeMs: 0,
    };

    this.push(event);
    return event;
  }

  recordCacheMiss(query: string): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: uid(),
      timestamp: Date.now(),
      eventType: "cache_miss",
      query,
      cacheHit: false,
    };

    this.push(event);
    return event;
  }

  recordBudgetAlert(message: string): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: uid(),
      timestamp: Date.now(),
      eventType: "budget_alert",
      error: message,
    };

    this.push(event);
    return event;
  }

  recordError(query: string, error: string, provider?: ProviderName): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: uid(),
      timestamp: Date.now(),
      eventType: "error",
      query,
      error,
    };

    this.push(event);
    return event;
  }

  // ── Query ─────────────────────────────────────────────────────────────

  /** Get all events (most recent first). */
  getEvents(limit: number = 100, offset: number = 0): AnalyticsEvent[] {
    return this.events.slice(offset, offset + limit);
  }

  /** Filter events by type. */
  getByType(type: AnalyticsEvent["eventType"], limit?: number): AnalyticsEvent[] {
    const filtered = this.events.filter((e) => e.eventType === type);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /** Events in a time range. */
  getByTimeRange(startMs: number, endMs: number): AnalyticsEvent[] {
    return this.events.filter((e) => e.timestamp >= startMs && e.timestamp <= endMs);
  }

  /** Total cost for a time range. */
  totalCost(startMs: number = 0, endMs: number = Date.now()): number {
    return this.events
      .filter((e) => e.cost && e.timestamp >= startMs && e.timestamp <= endMs)
      .reduce((sum, e) => sum + (e.cost?.totalCost ?? 0), 0);
  }

  /** Cost breakdown by provider for a time range. */
  costByProvider(startMs: number = 0, endMs: number = Date.now()): Record<ProviderName, number> {
    const result: Record<string, number> = { perplexity: 0, openai: 0, anthropic: 0 };
    for (const e of this.events) {
      if (e.cost && e.timestamp >= startMs && e.timestamp <= endMs) {
        result[e.cost.provider] = (result[e.cost.provider] ?? 0) + e.cost.totalCost;
      }
    }
    return result as Record<ProviderName, number>;
  }

  /** Average response time for a time range. */
  avgResponseTime(startMs: number = 0, endMs: number = Date.now()): number {
    const relevant = this.events.filter(
      (e) => e.responseTimeMs !== undefined && e.timestamp >= startMs && e.timestamp <= endMs,
    );
    if (relevant.length === 0) return 0;
    return relevant.reduce((sum, e) => sum + (e.responseTimeMs ?? 0), 0) / relevant.length;
  }

  /** Cache hit rate for a time range. */
  cacheHitRate(startMs: number = 0, endMs: number = Date.now()): number {
    const relevant = this.events.filter(
      (e) => (e.eventType === "query" || e.eventType === "cache_hit" || e.eventType === "cache_miss") &&
        e.timestamp >= startMs && e.timestamp <= endMs,
    );
    if (relevant.length === 0) return 0;
    const hits = relevant.filter((e) => e.cacheHit).length;
    return hits / relevant.length;
  }

  /** Query count for a time range. */
  queryCount(startMs: number = 0, endMs: number = Date.now()): number {
    return this.events.filter(
      (e) => (e.eventType === "query" || e.eventType === "cache_hit") &&
        e.timestamp >= startMs && e.timestamp <= endMs,
    ).length;
  }

  /** Get summary snapshot for dashboard. */
  getSummary() {
    const now = Date.now();
    const dayStart = now - 86_400_000;

    return {
      totalEvents: this.events.length,
      todayCost: this.totalCost(dayStart),
      todayQueries: this.queryCount(dayStart),
      avgResponseTime: this.avgResponseTime(dayStart),
      cacheHitRate: this.cacheHitRate(dayStart),
      costByProvider: this.costByProvider(dayStart),
      recentEvents: this.getEvents(20),
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private push(event: AnalyticsEvent): void {
    this.events.unshift(event); // newest first

    // Cap at maxEvents
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(0, this.config.maxEvents);
    }

    // Emit for WebSocket broadcast
    this.emit("event", event);
  }

  /** Prune events older than retention period. */
  prune(): number {
    const cutoff = Date.now() - this.config.retentionMs;
    const initial = this.events.length;
    this.events = this.events.filter((e) => e.timestamp >= cutoff);
    const pruned = initial - this.events.length;
    if (pruned > 0) log.info("pruned analytics events", { count: pruned });
    return pruned;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _collector: AnalyticsCollector | null = null;

export function getAnalytics(config?: Partial<AnalyticsConfig>): AnalyticsCollector {
  if (!_collector) _collector = new AnalyticsCollector(config);
  return _collector;
}

export function resetAnalytics(): void {
  _collector = null;
}
