/**
 * DeepEyeClaw — In-Memory Cache Adapter
 *
 * Simple Map-based cache for development and single-instance deployments.
 */

import type { CacheEntry } from "../../types.js";
import type { CacheAdapter } from "../semantic.js";

export class MemoryAdapter implements CacheAdapter {
  private store = new Map<string, CacheEntry>();

  async get(key: string): Promise<CacheEntry | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async size(): Promise<number> {
    return this.store.size;
  }

  async entries(): Promise<CacheEntry[]> {
    return Array.from(this.store.values());
  }
}
