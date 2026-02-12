/**
 * DeepEyeClaw — Gateway Server
 *
 * Express HTTP server + WebSocket hub. Ties together:
 *   - Provider adapters (Perplexity, OpenAI, Anthropic)
 *   - Semantic cache (Memory or Redis)
 *   - Analytics collector
 *   - Budget tracker
 *   - WebSocket real-time feed
 *   - REST API routes
 *
 * Run: npx tsx src/deepeye/gateway/server.ts
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "node:http";
import dotenv from "dotenv";

import type { ProviderName } from "../types.js";
import { BaseProvider } from "../providers/base.js";
import { PerplexityProvider } from "../providers/perplexity.js";
import { OpenAIProvider } from "../providers/openai.js";
import { AnthropicProvider } from "../providers/anthropic.js";
import { SemanticCache } from "../cache/semantic.js";
import { MemoryAdapter } from "../cache/adapters/memory.js";
import { getAnalytics } from "../analytics/collector.js";
import { getBudgetTracker } from "../budget-tracker.js";
import { WebSocketHub } from "./websocket.js";
import { createRouter } from "./routes.js";
import { logger, childLogger } from "../utils/logger.js";

dotenv.config();

const log = childLogger("server");

// ── Configuration ───────────────────────────────────────────────────────────

// PORT/HOST are now evaluated lazily inside startGateway() to support CLI overrides

// ── Provider Discovery ──────────────────────────────────────────────────────

function discoverProviders(): Map<ProviderName, BaseProvider> {
  const providers = new Map<ProviderName, BaseProvider>();

  if (process.env.PERPLEXITY_API_KEY) {
    providers.set("perplexity", new PerplexityProvider(process.env.PERPLEXITY_API_KEY));
    log.info("✓ Perplexity provider ready");
  }

  if (process.env.OPENAI_API_KEY) {
    providers.set("openai", new OpenAIProvider(process.env.OPENAI_API_KEY));
    log.info("✓ OpenAI provider ready");
  }

  if (process.env.ANTHROPIC_API_KEY) {
    providers.set("anthropic", new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
    log.info("✓ Anthropic provider ready");
  }

  if (providers.size === 0) {
    log.warn("⚠ No providers configured! Set at least one API key.");
    log.warn("  PERPLEXITY_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY");
  }

  return providers;
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

export async function startGateway() {
  const PORT = parseInt(process.env.GATEWAY_PORT ?? "3100", 10);
  const HOST = process.env.GATEWAY_HOST ?? "0.0.0.0";

  log.info("═══════════════════════════════════════════════════");
  log.info("  DeepEyeClaw Gateway v2.0 — Starting...");
  log.info("═══════════════════════════════════════════════════");

  // 1. Discover providers
  const providers = discoverProviders();

  // 2. Semantic cache (in-memory for now — swap to RedisAdapter for production)
  const cacheAdapter = new MemoryAdapter();
  const cache = new SemanticCache(cacheAdapter, {
    maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES ?? "1000", 10),
    similarityThreshold: parseFloat(process.env.CACHE_SIMILARITY ?? "0.82"),
    defaultTtlMs: parseInt(process.env.CACHE_DEFAULT_TTL ?? "3600000", 10),
    realtimeTtlMs: parseInt(process.env.CACHE_REALTIME_TTL ?? "60000", 10),
  });

  // 3. Analytics
  const analytics = getAnalytics();

  // 4. Budget tracker
  const budget = getBudgetTracker({
    dailyLimit: parseFloat(process.env.BUDGET_DAILY ?? "5"),
    weeklyLimit: parseFloat(process.env.BUDGET_WEEKLY ?? "30"),
    monthlyLimit: parseFloat(process.env.BUDGET_MONTHLY ?? "100"),
  });

  // 5. WebSocket hub
  const wsHub = new WebSocketHub();

  // Wire analytics → WebSocket broadcasts
  analytics.on("event", (event) => wsHub.broadcastEvent(event));

  // Wire provider health → WebSocket broadcasts
  for (const [name, provider] of providers) {
    provider.on("healthChange", (health) => wsHub.broadcastHealth(name, health));
  }

  // 6. Express app
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Request logging
  app.use((req, _res, next) => {
    if (req.path !== "/api/health") {
      log.debug(`${req.method} ${req.path}`);
    }
    next();
  });

  // API routes
  const apiRouter = createRouter({ providers, cache, analytics, ws: wsHub });
  app.use(apiRouter);

  // Root health endpoint
  app.get("/", (_req, res) => {
    res.json({
      name: "DeepEyeClaw Gateway",
      version: "2.0.0",
      status: "running",
      providers: Array.from(providers.keys()),
      uptime: process.uptime(),
    });
  });

  // Error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error("unhandled error", { error: err.message, stack: err.stack });
    res.status(err.statusCode ?? 500).json({
      error: err.name ?? "InternalError",
      message: err.message,
      code: err.code ?? "INTERNAL_ERROR",
    });
  });

  // 7. Create HTTP server + attach WebSocket
  const httpServer = createServer(app);
  wsHub.attach(httpServer, "/ws");

  // 8. Periodic maintenance
  setInterval(() => {
    cache.pruneExpired().catch((e) => log.error("cache prune failed", { error: (e as Error).message }));
    analytics.prune();
  }, 300_000); // every 5 min

  // 9. Start listening
  httpServer.listen(PORT, HOST, () => {
    log.info("═══════════════════════════════════════════════════");
    log.info(`  🚀 Gateway listening on http://${HOST}:${PORT}`);
    log.info(`  📡 WebSocket on ws://${HOST}:${PORT}/ws`);
    log.info(`  🤖 Providers: ${Array.from(providers.keys()).join(", ") || "none"}`);
    log.info(`  💾 Cache: in-memory (${cache.getStats().totalEntries} entries)`);
    log.info("═══════════════════════════════════════════════════");
  });

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down gateway...");
    wsHub.shutdown();
    httpServer.close(() => {
      log.info("Server closed. Goodbye.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5_000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { httpServer, providers, cache, analytics, wsHub };
}

// Auto-start when run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startGateway().catch((err) => {
    logger.error("Fatal startup error", { error: err });
    process.exit(1);
  });
}
