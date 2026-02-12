/**
 * DeepEyeClaw — Quality Estimator Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { QualityEstimator, getQualityEstimator } from "./quality-estimator.js";
import type { ChatResponse } from "./providers/base.js";
import type { ClassifiedQuery } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQuery(overrides: Partial<ClassifiedQuery> = {}): ClassifiedQuery {
  return {
    text: "test query",
    complexity: "medium",
    complexityScore: 0.5,
    intent: "chat",
    isRealtime: false,
    matchedIndicators: [],
    estimatedTokens: 50,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    id: "test-1",
    content: "This is a well-structured response.\n\nAccording to research, the answer is clear. Studies demonstrate that the approach is proven.\n\n- First point\n- Second point\n- Third point",
    provider: "perplexity",
    model: "sonar",
    tokens: { input: 50, output: 200, total: 250 },
    cost: 0.005,
    responseTimeMs: 1200,
    citations: [
      { url: "https://example.com/doc1", title: "Source 1" },
      { url: "https://other.com/doc2", title: "Source 2" },
      { url: "https://third.org/doc3", title: "Source 3" },
    ],
    cacheHit: false,
    finishReason: "stop",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("QualityEstimator", () => {
  let estimator: QualityEstimator;

  beforeEach(() => {
    estimator = new QualityEstimator();
  });

  describe("estimate", () => {
    it("returns a quality report with all 6 signals", () => {
      const report = estimator.estimate(makeResponse(), makeQuery());
      expect(report.signals).toHaveLength(6);
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(10);
      expect(["A", "B", "C", "D", "F"]).toContain(report.grade);
      expect(["accept", "escalate", "reject"]).toContain(report.recommendation);
      expect(report.confidence).toBeGreaterThan(0);
      expect(report.confidence).toBeLessThanOrEqual(1);
    });

    it("scores well-structured responses with citations highly", () => {
      const response = makeResponse();
      const query = makeQuery();
      const report = estimator.estimate(response, query);
      expect(report.overallScore).toBeGreaterThanOrEqual(6);
      expect(report.recommendation).toBe("accept");
    });

    it("scores poorly for empty or refusal responses", () => {
      const response = makeResponse({
        content: "I'm sorry, but as an AI I cannot help with that. I'm unable to assist.",
        tokens: { input: 50, output: 20, total: 70 },
        citations: [],
      });
      const query = makeQuery();
      const report = estimator.estimate(response, query);
      expect(report.overallScore).toBeLessThan(5);
    });
  });

  describe("citation quality", () => {
    it("gives highest score for 2-5 citations", () => {
      const r1 = estimator.estimate(
        makeResponse({ citations: [
          { url: "https://a.com" }, { url: "https://b.com" }, { url: "https://c.com" },
        ] }),
        makeQuery(),
      );
      const r2 = estimator.estimate(
        makeResponse({ citations: [] }),
        makeQuery(),
      );
      const citeSig1 = r1.signals.find(s => s.name === "citationQuality")!;
      const citeSig2 = r2.signals.find(s => s.name === "citationQuality")!;
      expect(citeSig1.score).toBeGreaterThan(citeSig2.score);
    });

    it("penalizes too many citations (lack of synthesis)", () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ url: `https://site${i}.com` }));
      const report = estimator.estimate(makeResponse({ citations: many }), makeQuery());
      const citeSig = report.signals.find(s => s.name === "citationQuality")!;
      expect(citeSig.score).toBeLessThan(8);
    });
  });

  describe("confidence language", () => {
    it("detects high-confidence language", () => {
      const response = makeResponse({
        content: "Research shows that the evidence is clear. Studies demonstrate this is proven according to the data.",
      });
      const report = estimator.estimate(response, makeQuery());
      const confSig = report.signals.find(s => s.name === "confidenceLanguage")!;
      expect(confSig.score).toBeGreaterThanOrEqual(7);
    });

    it("detects hedging language", () => {
      const response = makeResponse({
        content: "I'm not sure, but perhaps it could be something. It's unclear and I think possibly it might work.",
      });
      const report = estimator.estimate(response, makeQuery());
      const confSig = report.signals.find(s => s.name === "confidenceLanguage")!;
      expect(confSig.score).toBeLessThan(6);
    });

    it("heavily penalizes refusal patterns", () => {
      const response = makeResponse({
        content: "I'm unable to help you with that. As an AI, I don't have the ability to do this.",
      });
      const report = estimator.estimate(response, makeQuery());
      const confSig = report.signals.find(s => s.name === "confidenceLanguage")!;
      expect(confSig.score).toBeLessThanOrEqual(1);
    });
  });

  describe("structural completeness", () => {
    it("rewards structured complex responses", () => {
      const response = makeResponse({
        content: "## Overview\n\nThis is a detailed analysis.\n\n### Key Points\n\n- **Point 1**: Important detail\n- **Point 2**: Another detail\n\n```typescript\nconst x = 1;\n```\n\nIn conclusion, the approach is solid.",
        tokens: { input: 50, output: 500, total: 550 },
      });
      const query = makeQuery({ complexity: "complex", intent: "code" });
      const report = estimator.estimate(response, query);
      const structSig = report.signals.find(s => s.name === "structuralCompleteness")!;
      expect(structSig.score).toBeGreaterThanOrEqual(7);
    });

    it("doesn't require structure for simple queries", () => {
      const response = makeResponse({
        content: "42 degrees Celsius.",
        tokens: { input: 10, output: 10, total: 20 },
      });
      const query = makeQuery({ complexity: "simple" });
      const report = estimator.estimate(response, query);
      const structSig = report.signals.find(s => s.name === "structuralCompleteness")!;
      expect(structSig.score).toBeGreaterThanOrEqual(5);
    });
  });

  describe("length appropriateness", () => {
    it("penalizes too-short responses", () => {
      const response = makeResponse({
        tokens: { input: 100, output: 10, total: 110 },
      });
      const query = makeQuery({ complexity: "complex" });
      const report = estimator.estimate(response, query);
      const lenSig = report.signals.find(s => s.name === "lengthAppropriateness")!;
      expect(lenSig.score).toBeLessThan(7);
    });

    it("scores appropriate length well", () => {
      const response = makeResponse({
        tokens: { input: 50, output: 200, total: 250 },
      });
      const query = makeQuery({ complexity: "simple" });
      const report = estimator.estimate(response, query);
      const lenSig = report.signals.find(s => s.name === "lengthAppropriateness")!;
      expect(lenSig.score).toBeGreaterThanOrEqual(7);
    });
  });

  describe("quickScore", () => {
    it("returns a single number", () => {
      const score = estimator.quickScore(makeResponse(), makeQuery());
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    });
  });

  describe("singleton", () => {
    it("returns the same instance", () => {
      const e1 = getQualityEstimator();
      const e2 = getQualityEstimator();
      expect(e1).toBe(e2);
    });
  });
});
