/**
 * DeepEyeClaw — Query Classifier
 *
 * Analyzes incoming queries to determine:
 * 1. Complexity score (0.0–1.0) → simple / medium / complex
 * 2. Intent → search / reasoning / chat / creative / code
 * 3. Real-time flag → whether the query needs live/current data
 *
 * This drives all downstream routing decisions.
 */

import type { ClassifiedQuery, QueryComplexity, QueryIntent } from "./types.js";

// ─── Keyword Dictionaries ───────────────────────────────────────────────────

const SIMPLE_INDICATORS = [
  "what is",
  "define",
  "explain simply",
  "translate",
  "summarize",
  "meaning of",
  "who is",
  "when was",
  "where is",
  "yes or no",
  "true or false",
  "how old",
  "how many",
  "what does",
  "tell me about",
  "hi",
  "hello",
  "hey",
  "thanks",
  "thank you",
  "good morning",
  "good night",
];

const MEDIUM_INDICATORS = [
  "how to",
  "how do i",
  "compare",
  "difference between",
  "pros and cons",
  "list",
  "steps to",
  "guide",
  "tutorial",
  "explain",
  "analyze",
  "review",
  "suggest",
  "recommend",
  "best way to",
  "advantages",
  "disadvantages",
  "example of",
  "write a",
  "create a",
  "help me",
];

const COMPLEX_INDICATORS = [
  "deep dive",
  "comprehensive",
  "in-depth analysis",
  "predict",
  "forecast",
  "strategy",
  "research",
  "evaluate",
  "critique",
  "debate",
  "build a complete",
  "architecture",
  "design system",
  "implement",
  "develop",
  "thesis",
  "dissertation",
  "scientific",
  "multi-step",
  "complex ",
  "advanced",
  "optimize",
  "refactor",
  "migrate",
];

const REALTIME_KEYWORDS = [
  "latest",
  "current",
  "today",
  "now",
  "recent",
  "news",
  "trending",
  "price",
  "weather",
  "stock",
  "live",
  "real-time",
  "right now",
  "this week",
  "this month",
  "yesterday",
  "tomorrow",
  "update",
  "breaking",
  "score",
  "market",
  "crypto",
  "bitcoin",
  "ethereum",
  "exchange rate",
  "traffic",
  "status of",
  "what happened",
  "election",
  "results",
];

const SEARCH_KEYWORDS = [
  "search",
  "find",
  "look up",
  "google",
  "source",
  "reference",
  "citation",
  "according to",
  "url",
  "link",
  "website",
  "article",
  "paper",
  "study",
  "research shows",
  "evidence",
  "fact check",
];

const REASONING_KEYWORDS = [
  "why",
  "because",
  "therefore",
  "consequently",
  "logic",
  "reason",
  "deduce",
  "infer",
  "prove",
  "derive",
  "calculate",
  "solve",
  "theorem",
  "hypothesis",
  "if then",
  "assuming",
  "given that",
  "math",
  "equation",
  "probability",
  "algorithm",
];

const CODE_KEYWORDS = [
  "code",
  "function",
  "class",
  "variable",
  "debug",
  "error",
  "bug",
  "compile",
  "runtime",
  "syntax",
  "api",
  "endpoint",
  "database",
  "sql",
  "javascript",
  "typescript",
  "python",
  "rust",
  "react",
  "node",
  "npm",
  "git",
  "docker",
  "deploy",
  "test",
  "unit test",
  "integration",
  "regex",
  "json",
  "yaml",
  "html",
  "css",
  "import",
  "export",
  "async",
  "await",
  "promise",
  "callback",
];

const CREATIVE_KEYWORDS = [
  "write a story",
  "poem",
  "essay",
  "creative",
  "fiction",
  "imagine",
  "brainstorm",
  "idea",
  "narrative",
  "dialogue",
  "script",
  "lyrics",
  "compose",
  "draft",
  "blog post",
  "article about",
  "content",
  "copywriting",
  "slogan",
  "tagline",
  "brand",
];

// ─── Token Estimation ───────────────────────────────────────────────────────

/** Rough token estimation: ~4 chars per token for English text. */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Keyword Matching ───────────────────────────────────────────────────────

function findMatchingKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

function keywordScore(text: string, keywords: string[]): number {
  const matches = findMatchingKeywords(text, keywords);
  // Diminishing returns: first match counts most, each subsequent adds less.
  if (matches.length === 0) {
    return 0;
  }
  return Math.min(1.0, matches.length * 0.25);
}

// ─── Complexity Scoring ─────────────────────────────────────────────────────

function computeComplexityScore(text: string): {
  score: number;
  matchedIndicators: string[];
} {
  const matchedIndicators: string[] = [];

  // Base score from text length (longer queries tend to be more complex).
  const tokens = estimateTokenCount(text);
  let lengthScore = 0;
  if (tokens < 10) {
    lengthScore = 0.1;
  } else if (tokens < 30) {
    lengthScore = 0.2;
  } else if (tokens < 80) {
    lengthScore = 0.35;
  } else if (tokens < 200) {
    lengthScore = 0.5;
  } else {
    lengthScore = 0.65;
  }

  // Keyword-based scoring.
  const simpleMatches = findMatchingKeywords(text, SIMPLE_INDICATORS);
  const mediumMatches = findMatchingKeywords(text, MEDIUM_INDICATORS);
  const complexMatches = findMatchingKeywords(text, COMPLEX_INDICATORS);

  matchedIndicators.push(...simpleMatches, ...mediumMatches, ...complexMatches);

  let keywordAdjust = 0;
  if (complexMatches.length > 0) {
    keywordAdjust += 0.3 + complexMatches.length * 0.1;
  }
  if (mediumMatches.length > 0) {
    keywordAdjust += 0.1 + mediumMatches.length * 0.05;
  }
  if (simpleMatches.length > 0) {
    keywordAdjust -= 0.2 + simpleMatches.length * 0.05;
  }

  // Question mark count: more questions = more complex context needed.
  const questionMarks = (text.match(/\?/g) || []).length;
  const questionBoost = questionMarks > 1 ? 0.1 * Math.min(questionMarks, 3) : 0;

  // Sentence count: multiple sentences = more complex.
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const sentenceBoost = sentences > 3 ? 0.1 * Math.min(sentences - 3, 3) : 0;

  // Numbered items or bullet points = structured/complex.
  const hasList = /(\d+\.|[-*•]\s)/.test(text);
  const listBoost = hasList ? 0.15 : 0;

  const raw = lengthScore + keywordAdjust + questionBoost + sentenceBoost + listBoost;
  const score = Math.max(0, Math.min(1.0, raw));

  return { score, matchedIndicators };
}

function scoreToComplexity(
  score: number,
  thresholds?: { simple: number; medium: number; complex: number },
): QueryComplexity {
  const t = thresholds ?? { simple: 0.3, medium: 0.7, complex: 1.0 };
  if (score <= t.simple) {
    return "simple";
  }
  if (score <= t.medium) {
    return "medium";
  }
  return "complex";
}

// ─── Intent Classification ──────────────────────────────────────────────────

function classifyIntent(text: string, isRealtime: boolean): QueryIntent {
  const scores: Record<QueryIntent, number> = {
    search: keywordScore(text, SEARCH_KEYWORDS),
    reasoning: keywordScore(text, REASONING_KEYWORDS),
    chat: 0,
    creative: keywordScore(text, CREATIVE_KEYWORDS),
    code: keywordScore(text, CODE_KEYWORDS),
  };

  // Real-time queries are inherently search-oriented.
  if (isRealtime) {
    scores.search += 0.5;
  }

  // Default "chat" gets a base score — it's the fallback.
  scores.chat = 0.15;

  // Short, greeting-like messages are likely chat.
  const lower = text.toLowerCase().trim();
  if (lower.length < 20) {
    scores.chat += 0.3;
  }

  // Pick highest-scoring intent.
  let best: QueryIntent = "chat";
  let bestScore = scores.chat;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = intent as QueryIntent;
      bestScore = score;
    }
  }

  return best;
}

// ─── Real-time Detection ────────────────────────────────────────────────────

function detectRealtime(text: string): boolean {
  return findMatchingKeywords(text, REALTIME_KEYWORDS).length > 0;
}

// ─── Main Classifier ────────────────────────────────────────────────────────

export function classifyQuery(
  text: string,
  thresholds?: { simple: number; medium: number; complex: number },
): ClassifiedQuery {
  const isRealtime = detectRealtime(text);
  const { score, matchedIndicators } = computeComplexityScore(text);
  const complexity = scoreToComplexity(score, thresholds);
  const intent = classifyIntent(text, isRealtime);
  const estimatedTokens = estimateTokenCount(text);

  return {
    text,
    complexity,
    complexityScore: Math.round(score * 100) / 100,
    intent,
    isRealtime,
    matchedIndicators,
    estimatedTokens,
  };
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Quick check: should this query skip the cache entirely? */
export function shouldSkipCache(classified: ClassifiedQuery): boolean {
  // Real-time queries shouldn't serve stale cached responses
  // (they still get cached with short TTL after the response).
  if (classified.isRealtime) {
    return true;
  }

  // Creative/generative queries should produce unique responses.
  if (classified.intent === "creative") {
    return true;
  }

  return false;
}

/** Determine an appropriate cache TTL (in ms) for a classified query. */
export function suggestCacheTtl(classified: ClassifiedQuery): number {
  if (classified.isRealtime) {
    return 5 * 60 * 1000;
  } // 5 min for real-time
  if (classified.intent === "search") {
    return 30 * 60 * 1000;
  } // 30 min for search
  if (classified.complexity === "complex") {
    return 60 * 60 * 1000;
  } // 1hr for complex
  return 60 * 60 * 1000; // 1hr default
}
