/**
 * DeepEyeClaw — Budget Tracker
 *
 * In-memory budget tracking with period rollover (daily/weekly/monthly).
 * Tracks costs, triggers alerts, and activates emergency mode when needed.
 */

import type {
  ActualCost,
  BudgetConfig,
  BudgetPeriod,
  BudgetStatus,
  ProviderName,
} from "./types.js";

// ─── Default Budget Config ──────────────────────────────────────────────────

const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  dailyLimit: 5.0,
  weeklyLimit: 30.0,
  monthlyLimit: 100.0,
  alertThresholds: [
    { percentage: 50, action: "log" },
    { percentage: 80, action: "notify", channels: ["telegram"] },
    { percentage: 95, action: "emergency_mode" },
  ],
  emergencyMode: {
    enabled: true,
    forceCheapestModels: true,
    disableProviders: ["anthropic"],
    notifyAdmin: true,
  },
};

// ─── Period Helpers ─────────────────────────────────────────────────────────

function getPeriodBounds(period: BudgetPeriod, now: number): { start: number; end: number } {
  const date = new Date(now);

  switch (period) {
    case "daily": {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const end = start + 24 * 60 * 60 * 1000;
      return { start, end };
    }
    case "weekly": {
      const dayOfWeek = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((dayOfWeek + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const start = monday.getTime();
      const end = start + 7 * 24 * 60 * 60 * 1000;
      return { start, end };
    }
    case "monthly": {
      const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
      return { start, end };
    }
  }
}

function getLimit(config: BudgetConfig, period: BudgetPeriod): number {
  switch (period) {
    case "daily": return config.dailyLimit;
    case "weekly": return config.weeklyLimit;
    case "monthly": return config.monthlyLimit;
  }
}

// ─── Budget Tracker ─────────────────────────────────────────────────────────

export class BudgetTracker {
  private costs: ActualCost[] = [];
  private config: BudgetConfig;
  private emergencyModeActive = false;
  private alertsFired = new Set<string>();

  constructor(config?: Partial<BudgetConfig>) {
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
  }

  /** Record a completed query cost. */
  recordCost(cost: ActualCost): void {
    this.costs.push(cost);
    this.checkAlerts();
  }

  /** Get budget status for a given period. */
  getStatus(period: BudgetPeriod): BudgetStatus {
    const now = Date.now();
    const { start, end } = getPeriodBounds(period, now);
    const limit = getLimit(this.config, period);
    const spent = this.costs
      .filter((c) => c.timestamp >= start && c.timestamp < end)
      .reduce((sum, c) => sum + c.totalCost, 0);

    const remaining = Math.max(0, limit - spent);
    const percentUsed = limit > 0 ? (spent / limit) * 100 : 0;

    return {
      period,
      limit,
      spent: Math.round(spent * 1000000) / 1000000,
      remaining: Math.round(remaining * 1000000) / 1000000,
      percentUsed: Math.round(percentUsed * 100) / 100,
      periodStart: start,
      periodEnd: end,
    };
  }

  /** Get all budget statuses. */
  getAllStatuses(): BudgetStatus[] {
    return (["daily", "weekly", "monthly"] as BudgetPeriod[]).map((p) =>
      this.getStatus(p),
    );
  }

  /** Remaining budget for the current day. */
  get dailyRemaining(): number {
    return this.getStatus("daily").remaining;
  }

  /** Whether emergency mode is currently active. */
  get isEmergencyMode(): boolean {
    return this.emergencyModeActive;
  }

  /** Force emergency mode on/off. */
  setEmergencyMode(active: boolean): void {
    this.emergencyModeActive = active;
  }

  /** Check if a provider is disabled by emergency mode. */
  isProviderDisabled(provider: ProviderName): boolean {
    if (!this.emergencyModeActive) return false;
    return this.config.emergencyMode.disableProviders.includes(provider);
  }

  /** Get total cost for today. */
  getTodaySpend(): number {
    return this.getStatus("daily").spent;
  }

  /** Get per-provider cost breakdown for a period. */
  getCostByProvider(period: BudgetPeriod): Record<ProviderName, number> {
    const now = Date.now();
    const { start, end } = getPeriodBounds(period, now);
    const byProvider: Record<string, number> = {};

    for (const cost of this.costs) {
      if (cost.timestamp >= start && cost.timestamp < end) {
        byProvider[cost.provider] = (byProvider[cost.provider] ?? 0) + cost.totalCost;
      }
    }

    return byProvider as Record<ProviderName, number>;
  }

  /** Get per-model cost breakdown for a period. */
  getCostByModel(period: BudgetPeriod): Record<string, number> {
    const now = Date.now();
    const { start, end } = getPeriodBounds(period, now);
    const byModel: Record<string, number> = {};

    for (const cost of this.costs) {
      if (cost.timestamp >= start && cost.timestamp < end) {
        const key = `${cost.provider}/${cost.model}`;
        byModel[key] = (byModel[key] ?? 0) + cost.totalCost;
      }
    }

    return byModel;
  }

  /** Get number of queries for a period. */
  getQueryCount(period: BudgetPeriod): number {
    const now = Date.now();
    const { start, end } = getPeriodBounds(period, now);
    return this.costs.filter((c) => c.timestamp >= start && c.timestamp < end).length;
  }

  /** Update budget configuration. */
  updateConfig(config: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...config };
    // Re-check alerts with new thresholds.
    this.alertsFired.clear();
    this.checkAlerts();
  }

  /** Prune old cost records to prevent memory buildup. Keep last 90 days. */
  prune(): void {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    this.costs = this.costs.filter((c) => c.timestamp >= cutoff);
  }

  // ─── Internal ───

  private checkAlerts(): void {
    const daily = this.getStatus("daily");

    for (const threshold of this.config.alertThresholds) {
      const alertKey = `${threshold.percentage}-${threshold.action}`;
      if (daily.percentUsed >= threshold.percentage && !this.alertsFired.has(alertKey)) {
        this.alertsFired.add(alertKey);
        this.fireAlert(threshold.action, daily, threshold.channels);
      }
    }
  }

  private fireAlert(
    action: string,
    status: BudgetStatus,
    channels?: string[],
  ): void {
    const msg = `[DeepEyeClaw Budget] ${action.toUpperCase()}: ${status.percentUsed.toFixed(1)}% of daily budget used ($${status.spent.toFixed(4)} / $${status.limit.toFixed(2)})`;

    switch (action) {
      case "log":
        console.info(msg);
        break;
      case "notify":
        console.warn(msg);
        // TODO: integrate with OpenClaw webhook system for Telegram/Discord notifications.
        // For now, just warn. Will be wired in Week 4.
        break;
      case "emergency_mode":
        if (this.config.emergencyMode.enabled) {
          this.emergencyModeActive = true;
          console.error(`🚨 ${msg} — EMERGENCY MODE ACTIVATED`);
        }
        break;
    }
  }

  /** Reset alerts for a new day (call on period rollover). */
  resetAlerts(): void {
    this.alertsFired.clear();
    this.emergencyModeActive = false;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _tracker: BudgetTracker | null = null;

export function getBudgetTracker(config?: Partial<BudgetConfig>): BudgetTracker {
  if (!_tracker) {
    _tracker = new BudgetTracker(config);
  }
  return _tracker;
}

export function resetBudgetTracker(): void {
  _tracker = null;
}
