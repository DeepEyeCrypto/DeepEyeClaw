/**
 * DeepEyeClaw — Shared Helpers
 */

import { randomUUID } from "node:crypto";

/** Generate a unique ID */
export function uid(): string {
  return randomUUID();
}

/** Sleep for ms */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff delay in ms */
export function backoffMs(attempt: number, baseMs: number = 500, cap: number = 30_000): number {
  return Math.min(baseMs * Math.pow(2, attempt) + Math.random() * 200, cap);
}

/** Truncate a string to maxLen, appending "…" */
export function truncate(str: string, maxLen: number = 120): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

/** Safe JSON parse that returns undefined on failure */
export function safeParse<T = unknown>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Timer utility */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

/** Hash a string to a short hex digest (for cache keys) */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Format cost as $X.XXXX */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/** Deep merge two objects, right wins */
export function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const val = override[key];
    if (val !== undefined && typeof val === "object" && !Array.isArray(val) && val !== null) {
      result[key] = deepMerge(
        (result[key] ?? {}) as Record<string, unknown>,
        val as Record<string, unknown>,
      ) as T[keyof T];
    } else if (val !== undefined) {
      result[key] = val as T[keyof T];
    }
  }
  return result;
}
