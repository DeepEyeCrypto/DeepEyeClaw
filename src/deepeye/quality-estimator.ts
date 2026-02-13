/**
 * DeepEyeClaw — Quality Estimator
 *
 * Multi-signal quality scorer for cascade routing decisions.
 * Evaluates AI responses on 6 dimensions, produces a 0–10 score.
 *
 * Signals & weights (from empirical testing):
 *   - Citation quality:         0.25
 *   - Confidence language:      0.20
 *   - Structural completeness:  0.20
 *   - Length appropriateness:   0.15
 *   - Latency vs expected:      0.10
 *   - Token efficiency:         0.10
 *
 * Research note: 2-5 citations = high quality. 0-1 = questionable.
 * Too many (>8) = lack of synthesis.
 */

import type { ChatResponse } from "./providers/base.js";
import type { ClassifiedQuery } from "./types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QualitySignal {
  name: string;
  score: number; // 0–10
  weight: number; // 0–1
  detail?: string;
}

export interface QualityReport {
  overallScore: number;
  signals: QualitySignal[];
  grade: "A" | "B" | "C" | "D" | "F";
  confidence: number; // 0–1 — how confident we are in this assessment
  recommendation: "accept" | "escalate" | "reject";
}

// ── Signal Weights ───────────────────────────────────────────────────────────

const SIGNAL_WEIGHTS = {
  citationQuality: 0.25,
  confidenceLanguage: 0.2,
  structuralCompleteness: 0.2,
  lengthAppropriateness: 0.15,
  latencyVsExpected: 0.1,
  tokenEfficiency: 0.1,
} as const;

// ── Expected Response Characteristics ────────────────────────────────────────

const EXPECTED_TOKENS_BY_COMPLEXITY: Record<string, { min: number; max: number; ideal: number }> = {
  simple: { min: 50, max: 500, ideal: 200 },
  medium: { min: 150, max: 1500, ideal: 600 },
  complex: { min: 300, max: 4000, ideal: 1500 },
};

const EXPECTED_LATENCY_BY_COMPLEXITY: Record<string, number> = {
  simple: 2000,
  medium: 5000,
  complex: 10000,
};

// ── Confidence/Hedging Patterns ──────────────────────────────────────────────

const HIGH_CONFIDENCE_PATTERNS = [
  /\bis\b/i,
  /\bare\b/i,
  /\bshows\b/i,
  /\bdemonstrates\b/i,
  /\baccording to\b/i,
  /\bevidence\b/i,
  /\bresearch\b/i,
  /\bspecifically\b/i,
  /\bin conclusion\b/i,
  /\bproven\b/i,
  /\bdata shows\b/i,
  /\bstudies\b/i,
  /\bconfirmed\b/i,
];

const LOW_CONFIDENCE_PATTERNS = [
  /\bi('m| am) not sure\b/i,
  /\bi don'?t know\b/i,
  /\bperhaps\b/i,
  /\bmight\b/i,
  /\bcould be\b/i,
  /\bi think\b/i,
  /\bpossibly\b/i,
  /\bit'?s unclear\b/i,
  /\bnot certain\b/i,
  /\bhard to say\b/i,
  /\bi cannot\b/i,
  /\bi can('| )not\b/i,
  /\bunable to\b/i,
  /\bdon'?t have access\b/i,
  /\bmay or may not\b/i,
];

const REFUSAL_PATTERNS = [
  /\bi cannot help\b/i,
  /\bi'?m unable\b/i,
  /\bas an ai\b/i,
  /\bi don'?t have the ability\b/i,
  /\bnot (able|equipped) to\b/i,
];

// ── Quality Estimator ────────────────────────────────────────────────────────

export class QualityEstimator {
  /**
   * Score a response against a query. Returns a QualityReport with
   * overall score (0–10), individual signal scores, and a recommendation.
   */
  estimate(response: ChatResponse, query: ClassifiedQuery): QualityReport {
    const signals: QualitySignal[] = [
      this.scoreCitationQuality(response),
      this.scoreConfidenceLanguage(response),
      this.scoreStructuralCompleteness(response, query),
      this.scoreLengthAppropriateness(response, query),
      this.scoreLatencyVsExpected(response, query),
      this.scoreTokenEfficiency(response),
    ];

    const overallScore = signals.reduce((sum, s) => sum + s.score * s.weight, 0);
    const confidence = this.computeConfidence(signals);
    const grade = this.toGrade(overallScore);
    const recommendation = this.toRecommendation(overallScore, query);

    return { overallScore, signals, grade, confidence, recommendation };
  }

  /**
   * Quick score — just the number. For cascade routing decisions.
   */
  quickScore(response: ChatResponse, query: ClassifiedQuery): number {
    return this.estimate(response, query).overallScore;
  }

  // ── Signal Scorers ──────────────────────────────────────────────────────

  /** Citation quality: 2-5 = high, 0-1 = questionable, >8 = lack of synthesis */
  private scoreCitationQuality(response: ChatResponse): QualitySignal {
    const citations = response.citations ?? [];
    const count = citations.length;
    let score: number;
    let detail: string;

    if (count === 0) {
      // No citations — check if provider supports them
      const supportsSearch = response.provider === "perplexity";
      score = supportsSearch ? 3.0 : 6.0; // Perplexity should have citations
      detail = supportsSearch
        ? "No citations from search provider"
        : "No citations (non-search model)";
    } else if (count === 1) {
      score = 6.0;
      detail = "Single citation — limited sourcing";
    } else if (count >= 2 && count <= 5) {
      score = 9.0;
      detail = `${count} citations — well-sourced`;
    } else if (count <= 8) {
      score = 7.5;
      detail = `${count} citations — adequate`;
    } else {
      score = 6.0;
      detail = `${count} citations — possibly lacking synthesis`;
    }

    // Bonus: check citation variety (different domains)
    if (count >= 2) {
      const domains = new Set(
        citations.map((c) => {
          try {
            return new URL(c.url).hostname;
          } catch {
            return "unknown";
          }
        }),
      );
      if (domains.size >= Math.min(3, count)) {
        score = Math.min(10, score + 0.5);
        detail += " (diverse sources)";
      }
    }

    return { name: "citationQuality", score, weight: SIGNAL_WEIGHTS.citationQuality, detail };
  }

  /** Confidence language: high-confidence phrases vs hedging/refusal */
  private scoreConfidenceLanguage(response: ChatResponse): QualitySignal {
    const text = response.content;
    let score = 7.0; // baseline

    // Count confidence/hedging signals
    const highCount = HIGH_CONFIDENCE_PATTERNS.filter((p) => p.test(text)).length;
    const lowCount = LOW_CONFIDENCE_PATTERNS.filter((p) => p.test(text)).length;
    const refusalCount = REFUSAL_PATTERNS.filter((p) => p.test(text)).length;

    // Refusal = very bad
    if (refusalCount > 0) {
      return {
        name: "confidenceLanguage",
        score: 1.0,
        weight: SIGNAL_WEIGHTS.confidenceLanguage,
        detail: `Refusal detected (${refusalCount} patterns)`,
      };
    }

    // Net confidence
    const net = highCount - lowCount * 2;
    score += Math.max(-5, Math.min(3, net * 0.5));

    // Clamp
    score = Math.max(0, Math.min(10, score));

    let detail: string;
    if (score >= 8) {
      detail = "High confidence language";
    } else if (score >= 5) {
      detail = "Moderate confidence";
    } else {
      detail = `Excessive hedging (${lowCount} hedging patterns)`;
    }

    return { name: "confidenceLanguage", score, weight: SIGNAL_WEIGHTS.confidenceLanguage, detail };
  }

  /** Structural completeness: headings, lists, code blocks, paragraphs */
  private scoreStructuralCompleteness(
    response: ChatResponse,
    query: ClassifiedQuery,
  ): QualitySignal {
    const text = response.content;
    let score = 5.0;

    // Structural elements
    const hasHeadings = /^#{1,4}\s/m.test(text);
    const hasList = /^[-*]\s|^\d+\.\s/m.test(text);
    const hasCodeBlock = /```[\s\S]*?```/.test(text);
    const hasBold = /\*\*[^*]+\*\*/.test(text);
    const paragraphCount = text.split(/\n\n+/).length;

    // Scoring depends on query complexity
    if (query.complexity === "simple") {
      // Simple queries: clear, concise answer is fine
      if (paragraphCount >= 1) {
        score += 2;
      }
      if (hasList || hasBold) {
        score += 1;
      }
      if (text.length > 50) {
        score += 1;
      }
    } else if (query.complexity === "medium") {
      if (paragraphCount >= 2) {
        score += 1;
      }
      if (hasHeadings) {
        score += 1;
      }
      if (hasList) {
        score += 1;
      }
      if (hasBold) {
        score += 0.5;
      }
      if (text.length > 200) {
        score += 1;
      }
    } else {
      // Complex: expect rich structure
      if (hasHeadings) {
        score += 1.5;
      }
      if (hasList) {
        score += 1;
      }
      if (hasCodeBlock && query.intent === "code") {
        score += 1;
      }
      if (hasBold) {
        score += 0.5;
      }
      if (paragraphCount >= 3) {
        score += 1;
      }
    }

    // Code queries should have code blocks
    if (query.intent === "code" && !hasCodeBlock) {
      score -= 2;
    }

    score = Math.max(0, Math.min(10, score));
    const detail =
      [
        hasHeadings ? "headings" : null,
        hasList ? "lists" : null,
        hasCodeBlock ? "code" : null,
        hasBold ? "emphasis" : null,
      ]
        .filter(Boolean)
        .join(", ") || "plain text";

    return {
      name: "structuralCompleteness",
      score,
      weight: SIGNAL_WEIGHTS.structuralCompleteness,
      detail: `Structure: ${detail}`,
    };
  }

  /** Length appropriateness: is the response the right size for the query? */
  private scoreLengthAppropriateness(
    response: ChatResponse,
    query: ClassifiedQuery,
  ): QualitySignal {
    const expected =
      EXPECTED_TOKENS_BY_COMPLEXITY[query.complexity] ?? EXPECTED_TOKENS_BY_COMPLEXITY.medium;
    const totalTokens = response.tokens.output;

    let score: number;
    let detail: string;

    if (totalTokens < expected.min) {
      // Too short
      const ratio = totalTokens / expected.min;
      score = Math.max(2, ratio * 7);
      detail = `Too short (${totalTokens} tokens, expected ${expected.min}+)`;
    } else if (totalTokens > expected.max) {
      // Too long — penalize but not as heavily
      const overRatio = totalTokens / expected.max;
      score = Math.max(4, 10 - (overRatio - 1) * 3);
      detail = `Verbose (${totalTokens} tokens, expected <${expected.max})`;
    } else {
      // In range — score based on proximity to ideal
      const dist = Math.abs(totalTokens - expected.ideal) / expected.ideal;
      score = Math.max(7, 10 - dist * 3);
      detail = `Appropriate length (${totalTokens} tokens)`;
    }

    score = Math.max(0, Math.min(10, score));
    return {
      name: "lengthAppropriateness",
      score,
      weight: SIGNAL_WEIGHTS.lengthAppropriateness,
      detail,
    };
  }

  /** Latency vs expected: penalize slow responses */
  private scoreLatencyVsExpected(response: ChatResponse, query: ClassifiedQuery): QualitySignal {
    const expectedMs = EXPECTED_LATENCY_BY_COMPLEXITY[query.complexity] ?? 5000;
    const actualMs = response.responseTimeMs;

    let score: number;
    let detail: string;

    if (actualMs <= 0) {
      // Unknown latency — neutral
      score = 7;
      detail = "Latency unknown";
    } else if (actualMs <= expectedMs * 0.5) {
      score = 10;
      detail = `Very fast (${actualMs}ms, expected ${expectedMs}ms)`;
    } else if (actualMs <= expectedMs) {
      score = 9;
      detail = `Within expected (${actualMs}ms / ${expectedMs}ms)`;
    } else if (actualMs <= expectedMs * 2) {
      score = 6;
      detail = `Somewhat slow (${actualMs}ms, expected ${expectedMs}ms)`;
    } else {
      score = 3;
      detail = `Very slow (${actualMs}ms, expected ${expectedMs}ms)`;
    }

    return { name: "latencyVsExpected", score, weight: SIGNAL_WEIGHTS.latencyVsExpected, detail };
  }

  /** Token efficiency: output tokens relative to input tokens */
  private scoreTokenEfficiency(response: ChatResponse): QualitySignal {
    const { input, output } = response.tokens;

    if (input === 0 || output === 0) {
      return {
        name: "tokenEfficiency",
        score: 5,
        weight: SIGNAL_WEIGHTS.tokenEfficiency,
        detail: "Unknown efficiency",
      };
    }

    const ratio = output / input;
    let score: number;
    let detail: string;

    if (ratio < 0.5) {
      // Very terse — might be truncated or refusing
      score = 4;
      detail = `Low output ratio (${ratio.toFixed(2)})`;
    } else if (ratio >= 0.5 && ratio <= 5) {
      // Healthy range
      score = 9;
      detail = `Good output ratio (${ratio.toFixed(2)})`;
    } else if (ratio <= 10) {
      score = 7;
      detail = `High output ratio (${ratio.toFixed(2)})`;
    } else {
      // Extremely verbose
      score = 5;
      detail = `Very high output ratio (${ratio.toFixed(2)})`;
    }

    return { name: "tokenEfficiency", score, weight: SIGNAL_WEIGHTS.tokenEfficiency, detail };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private computeConfidence(signals: QualitySignal[]): number {
    // Confidence in our assessment. Low if signals disagree wildly.
    const scores = signals.map((s) => s.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    const stddev = Math.sqrt(variance);
    // If stddev is low, we're confident. If high, signals conflict.
    return Math.max(0.2, Math.min(1.0, 1 - stddev / 5));
  }

  private toGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 8.5) {
      return "A";
    }
    if (score >= 7.0) {
      return "B";
    }
    if (score >= 5.0) {
      return "C";
    }
    if (score >= 3.0) {
      return "D";
    }
    return "F";
  }

  private toRecommendation(
    score: number,
    query: ClassifiedQuery,
  ): "accept" | "escalate" | "reject" {
    // Thresholds depend on complexity — complex queries need higher quality
    const thresholds = {
      simple: { accept: 6, reject: 3 },
      medium: { accept: 7, reject: 4 },
      complex: { accept: 8, reject: 5 },
    };
    const t = thresholds[query.complexity] ?? thresholds.medium;

    if (score >= t.accept) {
      return "accept";
    }
    if (score >= t.reject) {
      return "escalate";
    }
    return "reject";
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _estimator: QualityEstimator | null = null;

export function getQualityEstimator(): QualityEstimator {
  if (!_estimator) {
    _estimator = new QualityEstimator();
  }
  return _estimator;
}
