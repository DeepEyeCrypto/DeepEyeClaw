import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ChartCard } from "../components/ChartCard";
import {
  getCostByDay,
  getModelUsage,
  getResponseTimeDistribution,
  getComplexityDistribution,
} from "../data/mock";
import { useDashboardStore } from "../store/dashboard";

type TimeRange = "24h" | "7d" | "30d";

function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold text-text mb-1">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          <span className="text-text-muted capitalize">{entry.dataKey ?? entry.name}:</span>
          <span className="font-mono font-medium text-text">
            {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function PieLabel({ name, pct }: { name: string; pct: number }) {
  return `${name} ${pct}%`;
}

export function AnalyticsPage() {
  const { events, filteredEvents } = useDashboardStore();
  const [range, setRange] = useState<TimeRange>("7d");

  const filtered = useMemo(() => {
    const now = Date.now();
    const day = 86400000;
    const cutoff = range === "24h" ? now - day : range === "7d" ? now - 7 * day : now - 30 * day;
    return events.filter((e) => e.timestamp >= cutoff);
  }, [events, range]);

  const costByDay = useMemo(() => getCostByDay(filtered), [filtered]);
  const modelUsage = useMemo(() => getModelUsage(filtered), [filtered]);
  const responseTimeDist = useMemo(() => getResponseTimeDistribution(filtered), [filtered]);
  const complexityDist = useMemo(() => getComplexityDistribution(filtered), [filtered]);

  const totalCost = filtered.reduce((s, e) => s + e.cost, 0);
  const totalRequests = filtered.filter((e) => !e.cacheHit).length;
  const avgTime =
    filtered.length > 0 ? filtered.reduce((s, e) => s + e.responseTimeMs, 0) / filtered.length : 0;
  const p95Time = (() => {
    const sorted = [...filtered].toSorted((a, b) => a.responseTimeMs - b.responseTimeMs);
    const idx = Math.floor(sorted.length * 0.95);
    return sorted[idx]?.responseTimeMs ?? 0;
  })();

  const topQueries = useMemo(() => {
    const counts: Record<string, { count: number; totalCost: number; totalTime: number }> = {};
    filtered.forEach((e) => {
      if (!counts[e.query]) {
        counts[e.query] = { count: 0, totalCost: 0, totalTime: 0 };
      }
      counts[e.query].count++;
      counts[e.query].totalCost += e.cost;
      counts[e.query].totalTime += e.responseTimeMs;
    });
    return Object.entries(counts)
      .map(([query, data]) => ({
        query,
        count: data.count,
        avgCost: data.totalCost / data.count,
        avgTime: data.totalTime / data.count,
      }))
      .toSorted((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  const rangeButtons: { label: string; value: TimeRange }[] = [
    { label: "Last 24h", value: "24h" },
    { label: "Last 7 Days", value: "7d" },
    { label: "Last 30 Days", value: "30d" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Analytics</h1>
          <p className="text-sm text-text-muted mt-1">Deep dive into usage, costs & performance</p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-surface border border-border">
          {rangeButtons.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                range === r.value
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <div className="px-4 py-2 rounded-xl bg-surface border border-border">
          <span className="text-[10px] uppercase tracking-wider text-text-dim">Total Cost</span>
          <p className="text-lg font-bold font-mono text-text">${totalCost.toFixed(2)}</p>
        </div>
        <div className="px-4 py-2 rounded-xl bg-surface border border-border">
          <span className="text-[10px] uppercase tracking-wider text-text-dim">Total Requests</span>
          <p className="text-lg font-bold font-mono text-text">{totalRequests.toLocaleString()}</p>
        </div>
        <div className="px-4 py-2 rounded-xl bg-surface border border-border">
          <span className="text-[10px] uppercase tracking-wider text-text-dim">Avg Response</span>
          <p className="text-lg font-bold font-mono text-text">{(avgTime / 1000).toFixed(1)}s</p>
        </div>
        <div className="px-4 py-2 rounded-xl bg-surface border border-border">
          <span className="text-[10px] uppercase tracking-wider text-text-dim">P95 Response</span>
          <p className="text-lg font-bold font-mono text-text">{(p95Time / 1000).toFixed(1)}s</p>
        </div>
      </div>

      {/* Chart grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Cost Trend by Provider" icon="💵">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costByDay} barGap={2}>
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="perplexity" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="openai" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="anthropic" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Model Usage Distribution" icon="🎯">
          <div className="space-y-3 mt-2">
            {modelUsage.map((m) => (
              <div key={m.model} className="flex items-center gap-3">
                <span className="text-xs font-mono text-text-muted w-36 shrink-0 truncate">
                  {m.model}
                </span>
                <div className="flex-1 h-5 bg-surface-light rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${m.pct}%`,
                      background: "linear-gradient(90deg, #6366F1, #818CF8)",
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-text w-12 text-right">{m.pct}%</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Response Time Distribution" icon="⏱️">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={responseTimeDist} barCategoryGap="20%">
                <XAxis dataKey="range" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="count" fill="#3B82F6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Query Complexity Split" icon="📊">
          <div className="h-64 flex items-center gap-6">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={complexityDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {complexityDist.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<DarkTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {complexityDist.map((d) => {
                const total = complexityDist.reduce((s, x) => s + x.value, 0);
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color }} />
                    <span className="text-sm text-text flex-1">{d.name}</span>
                    <span className="text-sm font-mono font-medium text-text">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Top queries table */}
      <ChartCard title="Top Queries" icon="📋">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Query
                </th>
                <th className="text-right text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Count
                </th>
                <th className="text-right text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Avg Cost
                </th>
                <th className="text-right text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Avg Time
                </th>
              </tr>
            </thead>
            <tbody>
              {topQueries.map((q, i) => (
                <tr
                  key={i}
                  className="border-b border-border/30 hover:bg-surface-light/30 transition-colors animate-slide-in"
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  <td className="py-3 px-4 text-xs text-text max-w-xs truncate">
                    &ldquo;{q.query}&rdquo;
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-text-muted text-right">
                    {q.count}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-text-muted text-right">
                    ${q.avgCost.toFixed(4)}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-text-muted text-right">
                    {(q.avgTime / 1000).toFixed(1)}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
