# 🧬 DeepEyeClaw

**Intelligent AI Gateway with Cascade Routing**

<p align="center">
  <a href="https://github.com/DeepEyeCrypto/DeepEyeClaw/releases"><img src="https://img.shields.io/github/v/release/DeepEyeCrypto/DeepEyeClaw?include_prereleases&style=for-the-badge&color=00d4aa" alt="Release"></a>
  <a href="https://github.com/DeepEyeCrypto/DeepEyeClaw/actions"><img src="https://img.shields.io/github/actions/workflow/status/DeepEyeCrypto/DeepEyeClaw/ci.yml?branch=main&style=for-the-badge" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node-%E2%89%A522-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node 22+">
</p>

---

DeepEyeClaw routes AI queries through multiple providers (Perplexity, OpenAI, Anthropic) using research-backed cascade escalation. Every query starts at the cheapest model that can handle it. If the response quality doesn't meet the threshold, it escalates. No wasted tokens, no overspending.

```
User Query → Classify → Route → Cascade (if needed) → Quality Check → Response
                 ↓          ↓           ↓                    ↓
            Complexity   Strategy    Escalate?         Score 0-10
            Intent       Budget      Next tier          Accept / Reject
            Real-time    Provider    Quality gate       Artifact logged
```

## Why

Every AI API call costs money. Most queries don't need GPT-4. But some do.

DeepEyeClaw solves this: start cheap, escalate when quality demands it, never exceed budget. Every routing decision is logged as a transparent, auditable artifact — not a log line, an artifact you can query and replay.

Built on cascade routing research from ETH Zurich (ICML 2025).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DeepEyeClaw Gateway                        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │    Query      │  │   Smart      │  │   Quality Estimator   │ │
│  │  Classifier   │→│   Router     │→│   (6-signal scoring)   │ │
│  │              │  │  (cascade)   │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│          ↓                ↓                      ↓              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Semantic    │  │   Budget     │  │   Artifact Manager    │ │
│  │  Cache       │  │   Tracker    │  │   (transparency)      │ │
│  │ (Redis/Mem)  │  │ (daily/wk)   │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│          ↓                ↓                      ↓              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Analytics   │  │   Agent      │  │   WebSocket Hub       │ │
│  │  Collector   │  │   Manager    │  │   (real-time)         │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│                                                                 │
│  Providers: Perplexity │ OpenAI │ Anthropic                     │
└─────────────────────────────────────────────────────────────────┘
         ↕                    ↕
    REST API              Dashboard
  /api/query            React + Vite
  /api/health           Live WebSocket
  /api/artifacts        Mock fallback
```

---

## Core Systems

### 🧠 Smart Router

Classifies every query on three axes — **complexity** (simple/medium/complex), **intent** (factual, creative, code, analysis, real-time, conversational), and **real-time awareness** — then picks the optimal strategy:

| Strategy | When | What happens |
|----------|------|-------------|
| **Cascade** | Default | Start cheap → escalate on quality gate failure |
| **Priority** | Complex/code | Skip to the best model immediately |
| **Cost-optimized** | Simple queries | Force cheapest capable model |
| **Emergency** | Budget critical | Only the cheapest model, period |

### 🎯 Quality Estimator

Scores every AI response on a 0-10 scale using **6 weighted signals**:

| Signal | Weight | What it catches |
|--------|--------|----------------|
| **Citation quality** | 25% | 2-5 citations ideal. 0 from Perplexity = bad. \>8 = lazy sourcing |
| **Confidence language** | 20% | "I'm not sure" vs "Based on the evidence" |
| **Structural completeness** | 20% | Headings, lists, code blocks — scaled by complexity |
| **Length appropriateness** | 15% | Token count vs expected range for the complexity tier |
| **Latency vs expected** | 10% | Timeout detection, complexity-adjusted expectations |
| **Token efficiency** | 10% | Output/input ratio — catches truncation and bloat |

Produces a `QualityReport` with overall score, letter grade (A-F), and recommendation: **accept**, **escalate**, or **reject**.

### 📦 Routing Artifacts

Every routing decision produces a structured, human-reviewable **artifact** — not a log line. These are first-class data:

- **Route decisions** — full context: query, model, cost, confidence, reasoning
- **Cascade steps** — which model tried, what quality score it got, why it escalated
- **Cache hits** — similarity score, saved cost, saved latency
- **Budget rejections** — exact budget state at decision time

Artifacts are queryable by ID, type, tag, query ID, and time range. Ring buffer capped at 5,000 with WebSocket broadcast for real-time dashboards.

### 💰 Budget Tracker

In-memory budget tracking across daily, weekly, and monthly periods:

- Configurable limits with percentage-based alerts
- **Emergency mode**: auto-restricts to cheapest provider when budget is critical
- Per-provider and per-model cost breakdowns
- Budget status available via `/api/budget`

### 🔍 Semantic Cache

Embedding-based semantic matching — if someone already asked a similar question, return the cached response:

- Cosine similarity with configurable threshold (default 0.85)
- **Memory** and **Redis** adapters (pluggable interface)
- Auto-skip for real-time and creative queries
- TTL-based expiration

### 🤖 Agent Manager

The orchestrator. Ties all agents together with parallel processing:

1. **Parallel pre-processing** — cache check + classification simultaneously
2. **Cache hit** → immediate return with artifact
3. **Budget exceeded** → reject with artifact
4. **Cascade routing** with real quality evaluation
5. **Parallel post-processing** — cache store + analytics + budget tracking

---

## Quick Start

### Prerequisites

- **Node.js ≥ 22**
- **pnpm** (recommended) or npm

### Install

```bash
git clone https://github.com/DeepEyeCrypto/DeepEyeClaw.git
cd DeepEyeClaw
pnpm install
```

### Configure

```bash
cp deepeyeclaw.config.yaml deepeyeclaw.config.yaml.local
```

Edit `deepeyeclaw.config.yaml` with your API keys:

```yaml
providers:
  perplexity:
    apiKey: ${PERPLEXITY_API_KEY}
  openai:
    apiKey: ${OPENAI_API_KEY}
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}

budget:
  daily: 5.00
  weekly: 25.00
  monthly: 100.00
```

Or use environment variables:

```bash
export PERPLEXITY_API_KEY=pplx-...
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

### Run

```bash
# Start the gateway
npm run deepeye start

# Start the dashboard (separate terminal)
cd dashboard && npm run dev
```

### CLI

`npm run deepeye <command>`

| Command | Description |
|---------|-------------|
| `start` | Start the gateway server |
| `status` | Check gateway health and provider status |
| `config` | View active configuration |
| `budget` | Check budget usage and mode |
| `metrics` | Fetch Prometheus metrics raw text |

Example:

```bash
npm run deepeye status -- --url http://localhost:4040
```

### Test

```bash
# Run all DeepEye tests
pnpm vitest run src/deepeye/

# TypeScript check
npx tsc --noEmit --project tsconfig.deepeye.json
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/query` | Send a query through the routing pipeline |
| `GET` | `/api/health` | Gateway + provider health status |
| `GET` | `/api/analytics` | Query analytics and cost breakdowns |
| `GET` | `/api/budget` | Current budget status across all periods |
| `GET` | `/api/cache` | Cache statistics and hit rates |
| `GET` | `/api/config` | Active gateway configuration |
| `GET` | `/api/artifacts` | Recent routing artifacts (filterable by type/tag) |
| `GET` | `/api/artifacts/:queryId` | All artifacts for a specific query |
| `GET` | `/api/manager-view` | Aggregated system status for dashboards |
| `GET` | `/metrics` | Prometheus metrics (scrape target) |

### Example Query

```bash
curl -X POST http://localhost:4040/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What were the key findings of the latest IPCC report?",
    "options": {
      "maxTokens": 2048,
      "temperature": 0.3
    }
  }'
```

Response includes the AI response, routing decision, quality score, and generated artifacts.

---

## Dashboard

React + Vite dashboard with live gateway connection:

- **Analytics** — query volume, cost trends, provider distribution
- **Cache** — hit rates, storage size, recent entries
- **Providers** — health status, latency, success rates
- **Config** — active configuration viewer

Connection modes:

- 🟢 **Live** — connected to gateway WebSocket
- 🟡 **Mock** — using demo data (gateway offline)
- 🔴 **Offline** — no connection

```bash
cd dashboard && npm run dev
# Opens at http://localhost:5173
```

---

## Docker

```bash
# Build and run the gateway
docker compose -f docker-compose.deepeye.yml up -d

# Or build the image directly
docker build -f Dockerfile.gateway -t deepeyeclaw-gateway .
```

---

## Project Structure

```
src/deepeye/
├── gateway/
│   ├── routes.ts          # Express REST API endpoints
│   ├── server.ts          # HTTP + WebSocket server
│   └── websocket.ts       # Real-time event broadcasting
├── providers/
│   ├── base.ts            # Abstract provider interface
│   ├── perplexity.ts      # Perplexity adapter (Sonar models)
│   ├── openai.ts          # OpenAI adapter (GPT-4o models)
│   └── anthropic.ts       # Anthropic adapter (Claude models)
├── cache/
│   ├── semantic.ts        # Semantic cache engine
│   └── adapters/
│       ├── memory.ts      # In-memory adapter
│       └── redis.ts       # Redis adapter
├── analytics/
│   └── collector.ts       # Event bus + analytics engine
├── query-classifier.ts    # Query complexity/intent classification
├── smart-router.ts        # Cascade routing engine
├── quality-estimator.ts   # 6-signal quality scoring
├── cost-calculator.ts     # Per-model cost calculation
├── budget-tracker.ts      # Budget enforcement + emergency mode
├── artifacts.ts           # Routing artifact manager
├── agent-manager.ts       # Central orchestrator
├── types.ts               # Shared TypeScript types
├── index.ts               # Module exports
└── utils/
    ├── errors.ts          # Custom error hierarchy
    ├── helpers.ts          # Utility functions
    └── logger.ts          # Structured logging

dashboard/                 # React + Vite dashboard
deepeyeclaw.config.yaml    # Gateway configuration
Dockerfile.gateway         # Docker image
docker-compose.deepeye.yml # Docker Compose setup
```

---

## Test Coverage

```
 ✓ src/deepeye/query-classifier.test.ts     — 28 tests
 ✓ src/deepeye/smart-router.test.ts         — 23 tests
 ✓ src/deepeye/cost-calculator.test.ts      — 18 tests
 ✓ src/deepeye/budget-tracker.test.ts       — 13 tests
 ✓ src/deepeye/perplexity-provider.test.ts  — 14 tests
 ✓ src/deepeye/quality-estimator.test.ts    — 12 tests
 ✓ src/deepeye/artifacts.test.ts            — 11 tests
───────────────────────────────────────────────
 119 tests passing │ 7 test suites │ 0 TS errors
```

---

## Configuration Reference

`deepeyeclaw.config.yaml` controls everything:

```yaml
# Providers — API keys, models, cost tables
providers:
  perplexity:   { apiKey, models: [sonar, sonar-pro, sonar-reasoning-pro] }
  openai:       { apiKey, models: [gpt-4o-mini, gpt-4o, o1-mini] }
  anthropic:    { apiKey, models: [claude-3-haiku, claude-3.5-sonnet, claude-3-opus] }

# Routing — strategy, cascade quality thresholds
routing:
  defaultStrategy: cascade
  cascadeMinQuality: 7.0
  complexityThresholds: { medium: 30, complex: 70 }

# Budget — daily/weekly/monthly limits
budget:
  daily: { limit: 5.00, alertAt: 80 }
  weekly: { limit: 25.00 }
  monthly: { limit: 100.00 }
  emergencyThreshold: 95

# Cache — similarity threshold, TTL, adapter
cache:
  adapter: memory        # or "redis"
  similarityThreshold: 0.85
  maxEntries: 10000
  ttlMs: 3600000

# Server
server:
  port: 4040
  cors: { origin: "*" }
```

Full config reference: [`deepeyeclaw.config.yaml`](deepeyeclaw.config.yaml)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js ≥ 22 |
| **Language** | TypeScript 5.9 |
| **Server** | Express 5 + ws |
| **Cache** | In-memory / Redis (ioredis) |
| **Dashboard** | React 19 + Vite 7 + Recharts |
| **Testing** | Vitest 4 |
| **Container** | Docker + Docker Compose |
| **Package Manager** | pnpm 10 |

---

## Roadmap

- [ ] FAISS vector store for semantic cache
- [ ] Manager View + Artifact Viewer dashboard pages
- [ ] Streaming response support
- [ ] Rate limiting per provider
- [ ] Plugin system for custom providers

---

## License

MIT — see [LICENSE](LICENSE) for details.

Built by [DeepEyeCrypto](https://github.com/DeepEyeCrypto).
