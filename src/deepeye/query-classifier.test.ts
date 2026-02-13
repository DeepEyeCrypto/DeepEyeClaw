/**
 * DeepEyeClaw — Query Classifier Tests
 */

import { describe, it, expect } from "vitest";
import { classifyQuery, shouldSkipCache, suggestCacheTtl } from "./query-classifier.js";

describe("classifyQuery", () => {
  // ── Complexity ──────────────────────────────────────────────────────────

  describe("complexity scoring", () => {
    it("classifies simple greetings", () => {
      const result = classifyQuery("hello");
      expect(result.complexity).toBe("simple");
      expect(result.complexityScore).toBeLessThan(0.3);
    });

    it("classifies simple questions", () => {
      const result = classifyQuery("What is TypeScript?");
      expect(result.complexity).toBe("simple");
    });

    it("classifies medium how-to questions", () => {
      const result = classifyQuery(
        "How to set up a Node.js server with Express and handle authentication?",
      );
      expect(result.complexity).toBe("medium");
    });

    it("classifies complex analysis requests", () => {
      const result = classifyQuery(
        "Provide a comprehensive deep dive analysis of the economic impact of AI on job markets. Include predictions for the next 10 years, policy recommendations, and research-backed evidence from multiple sources.",
      );
      expect(result.complexity).toBe("complex");
      expect(result.complexityScore).toBeGreaterThan(0.7);
    });

    it("respects custom thresholds", () => {
      const result = classifyQuery("how to compare two arrays", {
        simple: 0.1,
        medium: 0.3,
        complex: 1.0,
      });
      // With more aggressive thresholds, medium/complex queries shift.
      expect(["medium", "complex"]).toContain(result.complexity);
    });
  });

  // ── Intent ─────────────────────────────────────────────────────────────

  describe("intent classification", () => {
    it("detects search intent", () => {
      const result = classifyQuery("Find me the latest research paper on quantum computing");
      expect(result.intent).toBe("search");
    });

    it("detects reasoning intent", () => {
      const result = classifyQuery(
        "Calculate the probability of drawing 3 aces from a deck of cards",
      );
      expect(result.intent).toBe("reasoning");
    });

    it("detects code intent", () => {
      const result = classifyQuery("Write a function to sort an array in JavaScript");
      expect(result.intent).toBe("code");
    });

    it("detects creative intent", () => {
      const result = classifyQuery("Write a short poem about the ocean at sunset");
      expect(result.intent).toBe("creative");
    });

    it("defaults to chat for ambiguous queries", () => {
      const result = classifyQuery("hey");
      expect(result.intent).toBe("chat");
    });
  });

  // ── Real-time Detection ────────────────────────────────────────────────

  describe("real-time detection", () => {
    it("detects real-time queries", () => {
      expect(classifyQuery("What is the current Bitcoin price?").isRealtime).toBe(true);
      expect(classifyQuery("Latest news about the election").isRealtime).toBe(true);
      expect(classifyQuery("What is the weather today?").isRealtime).toBe(true);
      expect(classifyQuery("trending topics on Twitter right now").isRealtime).toBe(true);
    });

    it("identifies non-real-time queries", () => {
      expect(classifyQuery("Explain quantum computing").isRealtime).toBe(false);
      expect(classifyQuery("What is the Pythagorean theorem?").isRealtime).toBe(false);
    });

    it("boosts search intent for real-time queries", () => {
      const result = classifyQuery("What is the latest stock market news?");
      expect(result.isRealtime).toBe(true);
      expect(result.intent).toBe("search");
    });
  });

  // ── Token Estimation ──────────────────────────────────────────────────

  describe("token estimation", () => {
    it("estimates tokens based on text length", () => {
      const result = classifyQuery("Hello world");
      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.estimatedTokens).toBeLessThan(10);
    });

    it("estimates more tokens for longer text", () => {
      const short = classifyQuery("Hi");
      const long = classifyQuery(
        "This is a much longer query that should result in more estimated tokens because it contains many words",
      );
      expect(long.estimatedTokens).toBeGreaterThan(short.estimatedTokens);
    });
  });

  // ── Matched Indicators ────────────────────────────────────────────────

  describe("matched indicators", () => {
    it("reports which keywords matched", () => {
      const result = classifyQuery("Deep dive into the research strategy for AI");
      expect(result.matchedIndicators.length).toBeGreaterThan(0);
      expect(result.matchedIndicators).toContain("deep dive");
    });
  });
});

// ── Cache Helpers ────────────────────────────────────────────────────────────

describe("shouldSkipCache", () => {
  it("skips cache for real-time queries", () => {
    const result = classifyQuery("Current Bitcoin price");
    expect(shouldSkipCache(result)).toBe(true);
  });

  it("skips cache for creative queries", () => {
    const result = classifyQuery("Write a poem about the ocean");
    expect(shouldSkipCache(result)).toBe(true);
  });

  it("allows cache for simple factual queries", () => {
    const result = classifyQuery("What is TypeScript?");
    expect(shouldSkipCache(result)).toBe(false);
  });
});

describe("suggestCacheTtl", () => {
  it("suggests short TTL for real-time queries", () => {
    const result = classifyQuery("Current stock price of Apple");
    const ttl = suggestCacheTtl(result);
    expect(ttl).toBe(5 * 60 * 1000); // 5 min
  });

  it("suggests longer TTL for static queries", () => {
    const result = classifyQuery("What is TypeScript?");
    const ttl = suggestCacheTtl(result);
    expect(ttl).toBeGreaterThanOrEqual(30 * 60 * 1000); // >= 30 min
  });
});
