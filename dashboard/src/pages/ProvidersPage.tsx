import { CheckCircle2, XCircle, Zap, Settings, Activity, FileText } from "lucide-react";
import { useState } from "react";
import { ChartCard } from "../components/ChartCard";
import { useDashboardStore } from "../store/dashboard";

const PROVIDER_COLORS: Record<string, string> = {
  perplexity: "#6366F1",
  openai: "#10B981",
  anthropic: "#F59E0B",
};

const PROVIDER_ICONS: Record<string, string> = {
  perplexity: "🔮",
  openai: "🤖",
  anthropic: "🧠",
};

export function ProvidersPage() {
  const { providers } = useDashboardStore();
  const [expanded, setExpanded] = useState<string | null>(providers[0]?.id ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">Provider Status & Configuration</h1>
        <p className="text-sm text-text-muted mt-1">
          Health, latency, and model management per provider
        </p>
      </div>

      {/* Provider cards */}
      <div className="space-y-4">
        {providers.map((p) => {
          const color = PROVIDER_COLORS[p.id] ?? "#6366F1";
          const isExpanded = expanded === p.id;

          return (
            <div
              key={p.id}
              className="glass-card overflow-hidden transition-all duration-300"
              style={{ borderColor: isExpanded ? `${color}40` : undefined }}
            >
              {/* Header — always visible */}
              <button
                onClick={() => setExpanded(isExpanded ? null : p.id)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    {PROVIDER_ICONS[p.id] ?? "⚡"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-text">{p.name}</h3>
                      {p.healthy ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/10 text-secondary text-[10px] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                          Healthy
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/10 text-danger text-[10px] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                          Unhealthy
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-text-muted">
                      <span className="font-mono">
                        Latency: <span className="text-text">{p.latencyMs}ms</span>
                      </span>
                      <span className="font-mono">
                        Success: <span className="text-text">{p.successRate}%</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-text-dim">Today</p>
                    <p className="text-sm font-mono font-bold text-text">
                      ${p.todayCost.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-text-dim">Month</p>
                    <p className="text-sm font-mono font-bold text-text">
                      ${p.monthCost.toFixed(2)}
                      <span className="text-text-dim text-[10px]"> / ${p.monthLimit}</span>
                    </p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-text-dim transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-0 border-t border-border/30 animate-fade-in-up">
                  {/* Models list */}
                  <div className="mt-4">
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                      Models
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {p.models.map((m) => (
                        <div
                          key={m.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
                            m.active
                              ? "bg-surface-light/50 border-border text-text"
                              : "bg-bg/50 border-border/30 text-text-dim"
                          }`}
                        >
                          {m.active ? (
                            <CheckCircle2 size={13} className="text-secondary" />
                          ) : (
                            <XCircle size={13} className="text-text-dim" />
                          )}
                          <span className="text-xs font-mono">{m.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Usage bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                        Monthly Budget
                      </h4>
                      <span className="text-xs font-mono text-text-muted">
                        {Math.round((p.monthCost / p.monthLimit) * 100)}% used
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-surface-light overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(100, (p.monthCost / p.monthLimit) * 100)}%`,
                          background: `linear-gradient(90deg, ${color}, ${color}80)`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors">
                      <Zap size={13} />
                      Test Connection
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-text-muted bg-surface border border-border hover:bg-surface-light transition-colors">
                      <Settings size={13} />
                      Edit Settings
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-text-muted bg-surface border border-border hover:bg-surface-light transition-colors">
                      <FileText size={13} />
                      View Logs
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall health summary */}
      <ChartCard title="Provider Health Summary" icon="📊">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {providers.map((p) => {
            const color = PROVIDER_COLORS[p.id] ?? "#6366F1";
            return (
              <div key={p.id} className="p-4 rounded-xl bg-bg/50 border border-border/30">
                <div className="flex items-center gap-2 mb-3">
                  <span>{PROVIDER_ICONS[p.id]}</span>
                  <span className="text-sm font-semibold text-text">{p.name}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Uptime</span>
                    <span className="font-mono text-secondary">{p.successRate}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Avg Latency</span>
                    <span className="font-mono text-text">{p.latencyMs}ms</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Active Models</span>
                    <span className="font-mono text-text">
                      {p.models.filter((m) => m.active).length}/{p.models.length}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Month Spend</span>
                    <span className="font-mono text-text">${p.monthCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  );
}
