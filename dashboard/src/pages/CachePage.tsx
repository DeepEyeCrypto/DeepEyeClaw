import { Package, HardDrive, Target, Clock, Search, Trash2, Zap } from "lucide-react";
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
import { StatCard } from "../components/StatCard";
import { useDashboardStore } from "../store/dashboard";

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
          <span className="font-mono font-medium text-text">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function CachePage() {
  const { cacheEntries, events } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const perPage = 10;

  const filtered = useMemo(
    () =>
      searchQuery.trim()
        ? cacheEntries.filter((e) => e.query.toLowerCase().includes(searchQuery.toLowerCase()))
        : cacheEntries,
    [cacheEntries, searchQuery],
  );

  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const totalHits = cacheEntries.reduce((s, e) => s + e.hits, 0);
  const totalEvents = events.length;
  const hitRate =
    totalEvents > 0 ? (events.filter((e) => e.cacheHit).length / totalEvents) * 100 : 0;
  const totalCostSaved = events.filter((e) => e.cacheHit).length * 0.005;
  const avgTtl = cacheEntries.reduce((s, e) => s + e.ttlMs, 0) / (cacheEntries.length || 1);

  // Hour-of-day hit rates
  const hourlyHitRate = useMemo(() => {
    const hours = Array.from({ length: 6 }, (_, i) => ({
      hour: `${String(i * 4).padStart(2, "0")}:00`,
      rate: Math.round(20 + Math.random() * 40),
    }));
    return hours;
  }, []);

  const hitDistribution = [
    { name: "Exact Match", value: 60, color: "#6366F1" },
    { name: "Semantic Match", value: 40, color: "#10B981" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">Cache Management</h1>
        <p className="text-sm text-text-muted mt-1">
          Semantic cache performance & entry management
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="animate-fade-in-up stagger-1">
          <StatCard
            icon={Package}
            label="Total Entries"
            value={cacheEntries.length.toLocaleString()}
            accentColor="#6366F1"
          />
        </div>
        <div className="animate-fade-in-up stagger-2">
          <StatCard
            icon={HardDrive}
            label="Memory Used"
            value="234 MB"
            subtext="of 1 GB"
            progress={23.4}
            accentColor="#10B981"
          />
        </div>
        <div className="animate-fade-in-up stagger-3">
          <StatCard
            icon={Target}
            label="Hit Rate (24h)"
            value={`${hitRate.toFixed(1)}%`}
            accentColor="#3B82F6"
          />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <StatCard
            icon={Clock}
            label="Avg TTL"
            value={`${Math.round(avgTtl / 60000)} min`}
            accentColor="#F59E0B"
          />
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            placeholder="Search cache entries..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="w-full pl-9 pr-4 py-2 text-xs bg-surface border border-border rounded-xl text-text placeholder:text-text-dim focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-danger bg-danger/10 border border-danger/20 hover:bg-danger/20 transition-colors">
          <Trash2 size={13} />
          Clear Expired
        </button>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors">
          <Zap size={13} />
          Preload Popular
        </button>
      </div>

      {/* Cache entries table */}
      <ChartCard title="Cache Entries" icon="📦">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Query
                </th>
                <th className="text-right text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Similarity
                </th>
                <th className="text-right text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Created
                </th>
                <th className="text-right text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Hits
                </th>
                <th className="text-center text-[10px] uppercase tracking-wider text-text-dim py-3 px-4">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((entry, i) => (
                <tr
                  key={entry.id}
                  className="border-b border-border/30 hover:bg-surface-light/30 transition-colors animate-slide-in"
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  <td className="py-3 px-4 text-xs text-text max-w-xs truncate">
                    &ldquo;{entry.query}&rdquo;
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-text-muted text-right">
                    {entry.similarity.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-text-dim text-right">
                    {formatTimeAgo(entry.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/10 text-primary">
                      {entry.hits}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button className="text-text-dim hover:text-danger transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text bg-surface border border-border disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-text-dim font-mono">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text bg-surface border border-border disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </ChartCard>

      {/* Bottom charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Hit Rate by Time of Day" icon="📊">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyHitRate} barCategoryGap="25%">
                <XAxis dataKey="hour" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="rate" fill="#6366F1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Cache Hit Distribution" icon="🥧">
          <div className="h-48 flex items-center gap-6">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={hitDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {hitDistribution.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {hitDistribution.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color }} />
                  <span className="text-sm text-text flex-1">{d.name}</span>
                  <span className="text-sm font-mono font-medium text-text">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) {
    return `${s}s ago`;
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return `${h}h ago`;
  }
  return `${Math.floor(h / 24)}d ago`;
}
