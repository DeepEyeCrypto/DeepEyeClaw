#!/usr/bin/env node
/**
 * DeepEyeClaw — CLI
 *
 * Command-line interface for managing the DeepEyeClaw gateway.
 */

import { Command } from "commander";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { getAnalytics } from "./analytics/collector.js";
import { getBudgetTracker } from "./budget-tracker.js";
import { startGateway } from "./gateway/server.js";
import { logger } from "./utils/logger.js";

dotenv.config();

const program = new Command();

program.name("deepeye").description("DeepEyeClaw AI Gateway CLI").version("1.0.0");

// ── Start ───────────────────────────────────────────────────────────────────

program
  .command("start")
  .description("Start the gateway server")
  .option("-p, --port <number>", "Port to listen on (default: env.GATEWAY_PORT or 4040)")
  .option("--prod", "Run in production mode (Redis cache)")
  .action(async (options) => {
    if (options.port) {
      process.env.GATEWAY_PORT = options.port;
    }
    if (options.prod) {
      process.env.NODE_ENV = "production";
      process.env.CACHE_ADAPTER = "redis";
    }

    try {
      await startGateway();
    } catch (err) {
      logger.error("Failed to start gateway", { error: (err as Error).message });
      process.exit(1);
    }
  });

// ── Status ──────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Check status of a running gateway")
  .option("-u, --url <url>", "Gateway URL", "http://localhost:4040")
  .action(async (options) => {
    try {
      const res = await fetch(`${options.url}/api/health`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      console.log("\n🟢 Gateway is ONLINE\n");
      console.log(`  Version:   ${data.version}`);
      console.log(`  Uptime:    ${data.uptime.toFixed(1)}s`);
      console.log(`  Status:    ${data.status}`);
      console.log(`  Providers: ${Object.keys(data.providers || {}).join(", ") || "none"}`);
      console.log(`  Clients:   ${data.wsClients || 0} connected\n`);

      // Provider health
      if (data.providers) {
        console.log("Providers:");
        for (const [name, info] of Object.entries(data.providers as Record<string, any>)) {
          const icon = info.live ? "✅" : "❌";
          console.log(`  ${icon} ${name.padEnd(12)} latency: ${info.latencyMs}ms`);
        }
      }
      console.log("");
    } catch (err) {
      console.error(`\n🔴 Gateway is OFFLINE or unreachable at ${options.url}`);
      console.error(`   Error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// ── Config ──────────────────────────────────────────────────────────────────

program
  .command("config")
  .description("View active configuration")
  .option("-u, --url <url>", "Gateway URL", "http://localhost:4040")
  .action(async (options) => {
    try {
      const res = await fetch(`${options.url}/api/config`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      console.dir(data, { depth: null, colors: true });
    } catch (err) {
      // Fallback to local config file if API is down
      console.log("⚠️  Could not connect to gateway. Showing local config file...\n");
      const configPath = path.resolve(process.cwd(), "deepeyeclaw.config.yaml");
      if (fs.existsSync(configPath)) {
        console.log(fs.readFileSync(configPath, "utf-8"));
      } else {
        console.error("No local config file found.");
      }
    }
  });

// ── Budget ──────────────────────────────────────────────────────────────────

program
  .command("budget")
  .description("View budget status")
  .option("-u, --url <url>", "Gateway URL", "http://localhost:4040")
  .action(async (options) => {
    try {
      const res = await fetch(`${options.url}/api/budget`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      console.log("\n💰 Budget Status\n");
      console.log(`  Emergency Mode: ${data.emergencyMode ? "🚨 ON" : "✅ OFF"}`);
      console.log("");

      const table = data.statuses.map((s: any) => ({
        Period: s.period,
        "Limit ($)": s.limit.toFixed(2),
        "Used ($)": s.spent.toFixed(2),
        "Remaining ($)": s.remaining.toFixed(2),
        "Usage %": `${s.percentUsed.toFixed(1)}%`,
      }));
      console.table(table);
      console.log("");
    } catch (err) {
      console.error(`Failed to fetch budget: ${(err as Error).message}`);
    }
  });

// ── Metrics ─────────────────────────────────────────────────────────────────

program
  .command("metrics")
  .description("Fetch Prometheus metrics")
  .option("-u, --url <url>", "Gateway URL", "http://localhost:4040")
  .action(async (options) => {
    try {
      const res = await fetch(`${options.url}/metrics`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      console.log(await res.text());
    } catch (err) {
      console.error(`Failed to fetch metrics: ${(err as Error).message}`);
    }
  });

program.parse();
