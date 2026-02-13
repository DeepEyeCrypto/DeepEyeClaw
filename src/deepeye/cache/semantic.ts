/**
 * DeepEyeClaw — Semantic Cache
 *
 * In-memory embedding-based cache that also supports a pluggable storage adapter.
 * Uses cosine similarity to find "close enough" queries and return cached responses.
 *
 * Flow:
 *   1. Hash the query → check exact match
 *   2. Compute embedding → check semantic similarity
 *   3. If above threshold → cache hit
 *   4. Otherwise → cache miss
 */

import type { ChatResponse } from "../providers/base.js";
import type { CacheEntry, CacheStats, ProviderName } from "../types.js";
import { CacheError } from "../utils/errors.js";
import { hashString, uid } from "../utils/helpers.js";
import { childLogger } from "../utils/logger.js";

const log = childLogger("cache");

// ── Embedding (lightweight) ─────────────────────────────────────────────────
// Simple bag-of-words embedding for fast local similarity matching.
// In production, swap this for a proper embedding model (e.g. @xenova/transformers).

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function buildVocab(docs: string[]): Map<string, number> {
  const vocab = new Map<string, number>();
  let idx = 0;
  for (const doc of docs) {
    for (const tok of tokenize(doc)) {
      if (!vocab.has(tok)) {
        vocab.set(tok, idx++);
      }
    }
  }
  return vocab;
}

function toVector(text: string, vocab: Map<string, number>): number[] {
  const vec = new Array(vocab.size).fill(0);
  for (const tok of tokenize(text)) {
    const i = vocab.get(tok);
    if (i !== undefined) {
      vec[i]++;
    }
  }
  return vec;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Cache adapter interface ─────────────────────────────────────────────────

export interface CacheAdapter {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
  entries(): Promise<CacheEntry[]>;
}

// ── Semantic Cache ──────────────────────────────────────────────────────────

export interface SemanticCacheConfig {
  maxEntries: number;
  similarityThreshold: number;
  defaultTtlMs: number;
  realtimeTtlMs: number;
}

const DEFAULT_CONFIG: SemanticCacheConfig = {
  maxEntries: 1000,
  similarityThreshold: 0.82,
  defaultTtlMs: 3_600_000, // 1 hour
  realtimeTtlMs: 60_000, // 1 minute
};

export class SemanticCache {
  private adapter: CacheAdapter;
  private config: SemanticCacheConfig;
  private stats: CacheStats = {
    totalEntries: 0,
    hitCount: 0,
    missCount: 0,
    hitRate: 0,
    totalCostSaved: 0,
    avgResponseTimeMs: 0,
  };
  private vocab: Map<string, number> = new Map();

  constructor(adapter: CacheAdapter, config?: Partial<SemanticCacheConfig>) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info("Semantic cache initialized", {
      maxEntries: this.config.maxEntries,
      threshold: this.config.similarityThreshold,
    });
  }

  /**
   * Look up a query in the cache.
   * Returns the cached response if found, null otherwise.
   */
  async lookup(query: string): Promise<{ entry: CacheEntry; similarity: number } | null> {
    const hash = await hashString(query);

    // 1. Exact match
    const exact = await this.adapter.get(hash);
    if (exact && exact.expiresAt > Date.now()) {
      exact.hitCount++;
      await this.adapter.set(hash, exact);
      this.recordHit(exact.cost);
      log.debug("cache HIT (exact)", { hash: hash.slice(0, 8), hits: exact.hitCount });
      return { entry: exact, similarity: 1.0 };
    }

    // 2. Semantic match — compare against all entries
    const allEntries = await this.adapter.entries();
    const now = Date.now();
    const active = allEntries.filter((e) => e.expiresAt > now);

    if (active.length === 0) {
      this.recordMiss();
      return null;
    }

    // Build vocab from all stored queries + the incoming query
    const allTexts = active.map((e) => e.queryText);
    allTexts.push(query);
    this.vocab = buildVocab(allTexts);

    const queryVec = toVector(query, this.vocab);
    let bestEntry: CacheEntry | null = null;
    let bestSim = 0;

    for (const entry of active) {
      const entryVec = toVector(entry.queryText, this.vocab);
      const sim = cosineSimilarity(queryVec, entryVec);
      if (sim > bestSim) {
        bestSim = sim;
        bestEntry = entry;
      }
    }

    if (bestEntry && bestSim >= this.config.similarityThreshold) {
      bestEntry.hitCount++;
      await this.adapter.set(bestEntry.queryHash, bestEntry);
      this.recordHit(bestEntry.cost);
      log.debug("cache HIT (semantic)", {
        similarity: bestSim.toFixed(3),
        hash: bestEntry.queryHash.slice(0, 8),
      });
      return { entry: bestEntry, similarity: bestSim };
    }

    this.recordMiss();
    return null;
  }

  /**
   * Store a response in the cache.
   */
  async store(query: string, response: ChatResponse, ttlMs?: number): Promise<void> {
    const hash = await hashString(query);
    const ttl = ttlMs ?? this.config.defaultTtlMs;

    // Evict if at capacity
    const size = await this.adapter.size();
    if (size >= this.config.maxEntries) {
      await this.evictOldest();
    }

    const entry: CacheEntry = {
      queryHash: hash,
      queryText: query,
      response: response.content,
      provider: response.provider,
      model: response.model,
      cost: response.cost,
      tokensUsed: response.tokens.total,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      hitCount: 0,
    };

    await this.adapter.set(hash, entry);
    this.stats.totalEntries = await this.adapter.size();
    log.debug("cache STORE", { hash: hash.slice(0, 8), ttl, model: response.model });
  }

  /** Remove expired entries. */
  async pruneExpired(): Promise<number> {
    const all = await this.adapter.entries();
    const now = Date.now();
    let pruned = 0;

    for (const entry of all) {
      if (entry.expiresAt <= now) {
        await this.adapter.delete(entry.queryHash);
        pruned++;
      }
    }

    this.stats.totalEntries = await this.adapter.size();
    if (pruned > 0) {
      log.info("pruned expired", { count: pruned });
    }
    return pruned;
  }

  /** Evict the oldest / least-hit entry. */
  private async evictOldest(): Promise<void> {
    const all = await this.adapter.entries();
    if (all.length === 0) {
      return;
    }

    // Sort by hitCount ASC, then createdAt ASC — evict least valuable first
    all.sort((a, b) => a.hitCount - b.hitCount || a.createdAt - b.createdAt);
    const victim = all[0];
    await this.adapter.delete(victim.queryHash);
    log.debug("cache EVICT", { hash: victim.queryHash.slice(0, 8), hits: victim.hitCount });
  }

  /** Get cache statistics. */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /** Clear the cache. */
  async clear(): Promise<void> {
    await this.adapter.clear();
    this.stats = {
      totalEntries: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      totalCostSaved: 0,
      avgResponseTimeMs: 0,
    };
    log.info("cache cleared");
  }

  /** All current entries (for dashboard). */
  async getAllEntries(): Promise<CacheEntry[]> {
    return this.adapter.entries();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private recordHit(costSaved: number): void {
    this.stats.hitCount++;
    this.stats.totalCostSaved += costSaved;
    this.updateHitRate();
  }

  private recordMiss(): void {
    this.stats.missCount++;
    this.updateHitRate();
  }

  private updateHitRate(): void {
    const total = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRate = total > 0 ? this.stats.hitCount / total : 0;
  }
}
