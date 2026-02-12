/**
 * DeepEyeClaw — Redis Cache Adapter
 *
 * Distributed cache via Redis (ioredis). Stores CacheEntry objects as JSON.
 * Supports Redis Cluster and Sentinel out of the box via ioredis.
 */

import type { CacheEntry } from "../../types.js";
import type { CacheAdapter } from "../semantic.js";
import { childLogger } from "../../utils/logger.js";

const log = childLogger("cache:redis");

// ioredis is an optional dependency — only imported if actually used
let Redis: any;

export class RedisAdapter implements CacheAdapter {
  private client: any;
  private prefix: string;

  constructor(redisUrl: string = "redis://127.0.0.1:6379", prefix: string = "dec:cache:") {
    this.prefix = prefix;
    this.init(redisUrl);
  }

  private async init(url: string) {
    try {
      Redis = (await import("ioredis")).default;
      this.client = new Redis(url, { maxRetriesPerRequest: 3 });
      this.client.on("error", (err: Error) => log.error("Redis error", { error: err.message }));
      this.client.on("connect", () => log.info("Redis connected"));
    } catch (err) {
      log.error("Failed to initialize Redis adapter — falling back", { error: (err as Error).message });
      throw err;
    }
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get(key: string): Promise<CacheEntry | null> {
    const raw = await this.client.get(this.key(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CacheEntry;
    } catch {
      return null;
    }
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    const ttlMs = entry.expiresAt - Date.now();
    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    await this.client.setex(this.key(key), ttlSec, JSON.stringify(entry));
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.client.del(this.key(key));
    return result > 0;
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async size(): Promise<number> {
    const keys = await this.client.keys(`${this.prefix}*`);
    return keys.length;
  }

  async entries(): Promise<CacheEntry[]> {
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length === 0) return [];

    const pipeline = this.client.pipeline();
    for (const k of keys) {
      pipeline.get(k);
    }
    const results = await pipeline.exec();
    const entries: CacheEntry[] = [];

    for (const [err, raw] of results ?? []) {
      if (!err && raw) {
        try {
          entries.push(JSON.parse(raw as string));
        } catch {}
      }
    }

    return entries;
  }

  async disconnect(): Promise<void> {
    await this.client?.quit();
  }
}
