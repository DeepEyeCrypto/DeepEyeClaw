/** Mock data that simulates what the DeepEye gateway would provide. */

export type Provider = "perplexity" | "openai" | "anthropic";
export type Complexity = "simple" | "medium" | "complex";
export type QueryIntent = "search" | "reasoning" | "chat" | "creative" | "code";

export type QueryEvent = {
  id: string;
  timestamp: number;
  query: string;
  provider: Provider;
  model: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  responseTimeMs: number;
  cacheHit: boolean;
  complexity: Complexity;
  intent: QueryIntent;
  isRealtime: boolean;
};

export type AlertEvent = {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
  resolved: boolean;
};

export type CacheEntry = {
  id: string;
  query: string;
  similarity: number;
  createdAt: number;
  hits: number;
  ttlMs: number;
  provider: Provider;
  model: string;
  cost: number;
};

export type ProviderStatus = {
  id: Provider;
  name: string;
  healthy: boolean;
  latencyMs: number;
  successRate: number;
  models: { id: string; active: boolean }[];
  todayCost: number;
  monthCost: number;
  monthLimit: number;
};

// ── Helpers ──────────────────────────────────────────────────────────

const now = Date.now();
const hour = 3600000;
const day = 86400000;
let _id = 0;
const uid = () => `evt_${++_id}`;

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Query events (last 7 days) ──────────────────────────────────────

const MODELS_BY_PROVIDER: Record<Provider, string[]> = {
  perplexity: ["sonar", "sonar-pro", "sonar-reasoning-pro"],
  openai: ["gpt-4o-mini", "gpt-4o"],
  anthropic: ["claude-sonnet-4-5", "claude-opus-4-6"],
};

const SAMPLE_QUERIES = [
  {
    q: "What is the current Bitcoin price?",
    p: "perplexity" as Provider,
    m: "sonar",
    c: "simple" as Complexity,
    i: "search" as QueryIntent,
    rt: true,
  },
  {
    q: "Latest news about AI regulation",
    p: "perplexity" as Provider,
    m: "sonar-pro",
    c: "medium" as Complexity,
    i: "search" as QueryIntent,
    rt: true,
  },
  {
    q: "Explain quantum computing",
    p: "openai" as Provider,
    m: "gpt-4o-mini",
    c: "simple" as Complexity,
    i: "chat" as QueryIntent,
    rt: false,
  },
  {
    q: "Write a React component for a dashboard",
    p: "openai" as Provider,
    m: "gpt-4o",
    c: "medium" as Complexity,
    i: "code" as QueryIntent,
    rt: false,
  },
  {
    q: "Comprehensive analysis of blockchain scalability",
    p: "anthropic" as Provider,
    m: "claude-sonnet-4-5",
    c: "complex" as Complexity,
    i: "reasoning" as QueryIntent,
    rt: false,
  },
  {
    q: "What happened in the election today?",
    p: "perplexity" as Provider,
    m: "sonar",
    c: "simple" as Complexity,
    i: "search" as QueryIntent,
    rt: true,
  },
  {
    q: "Write a poem about the ocean",
    p: "openai" as Provider,
    m: "gpt-4o-mini",
    c: "simple" as Complexity,
    i: "creative" as QueryIntent,
    rt: false,
  },
  {
    q: "Debug this TypeScript error",
    p: "openai" as Provider,
    m: "gpt-4o",
    c: "medium" as Complexity,
    i: "code" as QueryIntent,
    rt: false,
  },
  {
    q: "Weather forecast for Delhi this week",
    p: "perplexity" as Provider,
    m: "sonar",
    c: "simple" as Complexity,
    i: "search" as QueryIntent,
    rt: true,
  },
  {
    q: "Design a microservices architecture",
    p: "anthropic" as Provider,
    m: "claude-sonnet-4-5",
    c: "complex" as Complexity,
    i: "reasoning" as QueryIntent,
    rt: false,
  },
  {
    q: "Translate this to Hindi",
    p: "openai" as Provider,
    m: "gpt-4o-mini",
    c: "simple" as Complexity,
    i: "chat" as QueryIntent,
    rt: false,
  },
  {
    q: "Compare React vs Vue pros and cons",
    p: "openai" as Provider,
    m: "gpt-4o-mini",
    c: "medium" as Complexity,
    i: "reasoning" as QueryIntent,
    rt: false,
  },
  {
    q: "Current stock market trends",
    p: "perplexity" as Provider,
    m: "sonar-pro",
    c: "medium" as Complexity,
    i: "search" as QueryIntent,
    rt: true,
  },
  {
    q: "Implement auth middleware in Express",
    p: "openai" as Provider,
    m: "gpt-4o",
    c: "medium" as Complexity,
    i: "code" as QueryIntent,
    rt: false,
  },
  {
    q: "Hello!",
    p: "openai" as Provider,
    m: "gpt-4o-mini",
    c: "simple" as Complexity,
    i: "chat" as QueryIntent,
    rt: false,
  },
];

function genCost(provider: Provider, model: string, cacheHit: boolean): number {
  if (cacheHit) {
    return 0;
  }
  const base: Record<string, number> = {
    sonar: 0.005,
    "sonar-pro": 0.012,
    "sonar-reasoning-pro": 0.018,
    "gpt-4o-mini": 0.002,
    "gpt-4o": 0.015,
    "claude-sonnet-4-5": 0.025,
    "claude-opus-4-6": 0.085,
  };
  return (base[model] ?? 0.005) * rand(0.7, 1.4);
}

export function generateQueryEvents(count = 250): QueryEvent[] {
  const events: QueryEvent[] = [];
  for (let i = 0; i < count; i++) {
    const s = pick(SAMPLE_QUERIES);
    const cacheHit = Math.random() < 0.35;
    const ts = now - rand(0, 7 * day);
    events.push({
      id: uid(),
      timestamp: ts,
      query: s.q,
      provider: cacheHit ? s.p : s.p,
      model: cacheHit ? s.m : s.m,
      cost: genCost(s.p, s.m, cacheHit),
      inputTokens: Math.floor(rand(50, 2000)),
      outputTokens: Math.floor(rand(100, 4000)),
      responseTimeMs: cacheHit ? rand(5, 50) : rand(300, 5000),
      cacheHit,
      complexity: s.c,
      intent: s.i,
      isRealtime: s.rt,
    });
  }
  return events.toSorted((a, b) => b.timestamp - a.timestamp);
}

// ── Alerts ───────────────────────────────────────────────────────────

export function generateAlerts(): AlertEvent[] {
  return [
    {
      id: uid(),
      timestamp: now - 2 * hour,
      level: "warn",
      message: "Budget 80% reached — $4.00 of $5.00 daily limit",
      resolved: false,
    },
    {
      id: uid(),
      timestamp: now - 5 * hour,
      level: "error",
      message: "Perplexity API timeout — auto-recovered after 3 retries",
      resolved: true,
    },
    {
      id: uid(),
      timestamp: now - 8 * hour,
      level: "info",
      message: "New model registered: sonar-pro (Perplexity)",
      resolved: true,
    },
    {
      id: uid(),
      timestamp: now - 1 * day,
      level: "warn",
      message: "Cache memory usage at 85% — pruning oldest entries",
      resolved: true,
    },
    {
      id: uid(),
      timestamp: now - 1.5 * day,
      level: "error",
      message: "Emergency mode activated — daily budget exceeded",
      resolved: true,
    },
    {
      id: uid(),
      timestamp: now - 2 * day,
      level: "info",
      message: "Cascade fallback: sonar → gpt-4o-mini (quality below threshold)",
      resolved: true,
    },
  ];
}

// ── Cache entries ────────────────────────────────────────────────────

export function generateCacheEntries(count = 80): CacheEntry[] {
  const entries: CacheEntry[] = [];
  const queries = [
    "What is TypeScript?",
    "Explain quantum computing",
    "Latest Bitcoin price",
    "How to use React hooks",
    "Weather in Delhi",
    "Compare Python vs JavaScript",
    "What is machine learning?",
    "Docker best practices",
    "REST API design",
    "Explain blockchain",
    "How to use Git",
    "CSS flexbox tutorial",
    "Node.js vs Deno",
    "Kubernetes explained",
    "What is GraphQL?",
    "Explain async/await",
    "MongoDB vs PostgreSQL",
    "How does DNS work?",
    "What is WebSocket?",
    "Explain microservices",
  ];
  for (let i = 0; i < count; i++) {
    const q = pick(queries);
    const s = pick(SAMPLE_QUERIES);
    entries.push({
      id: uid(),
      query: q + (i > 20 ? ` (variant ${i})` : ""),
      similarity: rand(0.82, 0.99),
      createdAt: now - rand(0, 12 * hour),
      hits: Math.floor(rand(1, 30)),
      ttlMs: pick([5 * 60000, 30 * 60000, 60 * 60000]),
      provider: s.p,
      model: s.m,
      cost: genCost(s.p, s.m, false),
    });
  }
  return entries.toSorted((a, b) => b.hits - a.hits);
}

// ── Provider status ──────────────────────────────────────────────────

export function generateProviderStatuses(): ProviderStatus[] {
  return [
    {
      id: "perplexity",
      name: "Perplexity",
      healthy: true,
      latencyMs: 45,
      successRate: 99.2,
      models: [
        { id: "sonar", active: true },
        { id: "sonar-pro", active: true },
        { id: "sonar-reasoning-pro", active: true },
      ],
      todayCost: 1.23,
      monthCost: 18.45,
      monthLimit: 30,
    },
    {
      id: "openai",
      name: "OpenAI",
      healthy: true,
      latencyMs: 62,
      successRate: 99.8,
      models: [
        { id: "gpt-4o-mini", active: true },
        { id: "gpt-4o", active: true },
      ],
      todayCost: 0.87,
      monthCost: 8.12,
      monthLimit: 30,
    },
    {
      id: "anthropic",
      name: "Anthropic",
      healthy: true,
      latencyMs: 78,
      successRate: 98.9,
      models: [
        { id: "claude-sonnet-4-5", active: true },
        { id: "claude-opus-4-6", active: false },
      ],
      todayCost: 0.24,
      monthCost: 3.91,
      monthLimit: 30,
    },
  ];
}

// ── Chart data generators ────────────────────────────────────────────

export function getCostByDay(
  events: QueryEvent[],
): { date: string; perplexity: number; openai: number; anthropic: number; cache: number }[] {
  const days: Record<
    string,
    { perplexity: number; openai: number; anthropic: number; cache: number }
  > = {};
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  labels.forEach((l) => {
    days[l] = { perplexity: 0, openai: 0, anthropic: 0, cache: 0 };
  });

  events.forEach((e) => {
    const d = new Date(e.timestamp);
    const label = labels[d.getDay() === 0 ? 6 : d.getDay() - 1];
    if (e.cacheHit) {
      days[label].cache += e.cost || 0.003;
    } else {
      days[label][e.provider] += e.cost;
    }
  });

  return labels.map((date) => ({
    date,
    perplexity: Math.round(days[date].perplexity * 100) / 100,
    openai: Math.round(days[date].openai * 100) / 100,
    anthropic: Math.round(days[date].anthropic * 100) / 100,
    cache: Math.round(days[date].cache * 100) / 100,
  }));
}

export function getProviderDistribution(
  events: QueryEvent[],
): { name: string; value: number; color: string }[] {
  const totals: Record<string, number> = { Perplexity: 0, OpenAI: 0, Anthropic: 0, "Cache Hit": 0 };
  events.forEach((e) => {
    if (e.cacheHit) {
      totals["Cache Hit"]++;
    } else if (e.provider === "perplexity") {
      totals["Perplexity"]++;
    } else if (e.provider === "openai") {
      totals["OpenAI"]++;
    } else if (e.provider === "anthropic") {
      totals["Anthropic"]++;
    }
  });
  return [
    { name: "Perplexity", value: totals["Perplexity"], color: "#6366F1" },
    { name: "OpenAI", value: totals["OpenAI"], color: "#10B981" },
    { name: "Anthropic", value: totals["Anthropic"], color: "#F59E0B" },
    { name: "Cache Hit", value: totals["Cache Hit"], color: "#3B82F6" },
  ];
}

export function getComplexityDistribution(
  events: QueryEvent[],
): { name: string; value: number; color: string }[] {
  const totals: Record<string, number> = { Simple: 0, Medium: 0, Complex: 0 };
  events.forEach((e) => {
    if (e.complexity === "simple") {
      totals["Simple"]++;
    } else if (e.complexity === "medium") {
      totals["Medium"]++;
    } else if (e.complexity === "complex") {
      totals["Complex"]++;
    }
  });
  return [
    { name: "Simple", value: totals["Simple"], color: "#10B981" },
    { name: "Medium", value: totals["Medium"], color: "#F59E0B" },
    { name: "Complex", value: totals["Complex"], color: "#EF4444" },
  ];
}

export function getResponseTimeDistribution(
  events: QueryEvent[],
): { range: string; count: number }[] {
  const ranges = [
    { label: "<100ms", min: 0, max: 100 },
    { label: "100-500ms", min: 100, max: 500 },
    { label: "500ms-1s", min: 500, max: 1000 },
    { label: "1-2s", min: 1000, max: 2000 },
    { label: "2-5s", min: 2000, max: 5000 },
    { label: ">5s", min: 5000, max: Infinity },
  ];
  return ranges.map(({ label, min, max }) => ({
    range: label,
    count: events.filter((e) => e.responseTimeMs >= min && e.responseTimeMs < max).length,
  }));
}

export function getModelUsage(
  events: QueryEvent[],
): { model: string; count: number; pct: number }[] {
  const counts: Record<string, number> = {};
  events.forEach((e) => {
    if (!e.cacheHit) {
      counts[e.model] = (counts[e.model] ?? 0) + 1;
    }
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .map(([model, count]) => ({ model, count, pct: Math.round((count / total) * 100) }))
    .toSorted((a, b) => b.count - a.count);
}
