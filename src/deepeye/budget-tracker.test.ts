/**
 * DeepEyeClaw — Budget Tracker Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { ActualCost } from "./types.js";
import { BudgetTracker, resetBudgetTracker } from "./budget-tracker.js";

function makeCost(totalCost: number, provider = "openai", model = "gpt-4o-mini"): ActualCost {
  return {
    provider: provider as ActualCost["provider"],
    model,
    inputTokens: 100,
    outputTokens: 50,
    totalCost,
    timestamp: Date.now(),
  };
}

describe("BudgetTracker", () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    resetBudgetTracker();
    tracker = new BudgetTracker({ dailyLimit: 5.0, weeklyLimit: 30.0, monthlyLimit: 100.0 });
  });

  describe("recording costs", () => {
    it("tracks total daily spend", () => {
      tracker.recordCost(makeCost(0.01));
      tracker.recordCost(makeCost(0.02));
      expect(tracker.getTodaySpend()).toBeCloseTo(0.03, 4);
    });

    it("updates remaining budget", () => {
      tracker.recordCost(makeCost(1.0));
      expect(tracker.dailyRemaining).toBeCloseTo(4.0, 4);
    });
  });

  describe("budget status", () => {
    it("returns correct daily status", () => {
      tracker.recordCost(makeCost(2.5));
      const status = tracker.getStatus("daily");
      expect(status.period).toBe("daily");
      expect(status.limit).toBe(5.0);
      expect(status.spent).toBeCloseTo(2.5, 4);
      expect(status.remaining).toBeCloseTo(2.5, 4);
      expect(status.percentUsed).toBeCloseTo(50, 1);
    });

    it("returns all statuses", () => {
      const statuses = tracker.getAllStatuses();
      expect(statuses.length).toBe(3);
      expect(statuses.map((s) => s.period)).toEqual(["daily", "weekly", "monthly"]);
    });
  });

  describe("per-provider breakdown", () => {
    it("tracks costs by provider", () => {
      tracker.recordCost(makeCost(0.01, "openai"));
      tracker.recordCost(makeCost(0.02, "perplexity"));
      tracker.recordCost(makeCost(0.03, "anthropic"));

      const breakdown = tracker.getCostByProvider("daily");
      expect(breakdown.openai).toBeCloseTo(0.01, 4);
      expect(breakdown.perplexity).toBeCloseTo(0.02, 4);
      expect(breakdown.anthropic).toBeCloseTo(0.03, 4);
    });
  });

  describe("per-model breakdown", () => {
    it("tracks costs by model", () => {
      tracker.recordCost(makeCost(0.01, "openai", "gpt-4o-mini"));
      tracker.recordCost(makeCost(0.05, "openai", "gpt-4o"));

      const breakdown = tracker.getCostByModel("daily");
      expect(breakdown["openai/gpt-4o-mini"]).toBeCloseTo(0.01, 4);
      expect(breakdown["openai/gpt-4o"]).toBeCloseTo(0.05, 4);
    });
  });

  describe("query count", () => {
    it("counts queries for a period", () => {
      tracker.recordCost(makeCost(0.01));
      tracker.recordCost(makeCost(0.02));
      tracker.recordCost(makeCost(0.03));
      expect(tracker.getQueryCount("daily")).toBe(3);
    });
  });

  describe("emergency mode", () => {
    it("starts with emergency mode off", () => {
      expect(tracker.isEmergencyMode).toBe(false);
    });

    it("can manually set emergency mode", () => {
      tracker.setEmergencyMode(true);
      expect(tracker.isEmergencyMode).toBe(true);
    });

    it("disables providers in emergency mode", () => {
      const t = new BudgetTracker({
        dailyLimit: 1.0,
        emergencyMode: {
          enabled: true,
          forceCheapestModels: true,
          disableProviders: ["anthropic"],
          notifyAdmin: false,
        },
      });
      t.setEmergencyMode(true);
      expect(t.isProviderDisabled("anthropic")).toBe(true);
      expect(t.isProviderDisabled("openai")).toBe(false);
    });

    it("allows all providers when not in emergency mode", () => {
      expect(tracker.isProviderDisabled("anthropic")).toBe(false);
    });
  });

  describe("config updates", () => {
    it("can update budget limits", () => {
      tracker.updateConfig({ dailyLimit: 10.0 });
      const status = tracker.getStatus("daily");
      expect(status.limit).toBe(10.0);
    });
  });

  describe("pruning", () => {
    it("prunes old records without error", () => {
      tracker.recordCost(makeCost(0.01));
      tracker.prune();
      // Recent records should survive.
      expect(tracker.getTodaySpend()).toBeCloseTo(0.01, 4);
    });
  });
});
