import {
  DollarSign,
  BarChart3,
  Zap,
  Target,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";
import {
  AreaChart,
  Area,
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
import { getCostByDay, getProviderDistribution } from "../data/mock";
import { useDashboardStore } from "../store/dashboard";

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold text-text mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-muted capitalize">{entry.dataKey}:</span>
          <span className="font-mono font-medium text-text">${entry.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) {
    return null;
  }
  const d = payload[0];
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-2 shadow-xl">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.payload.color }} />
        <span className="text-text font-medium">{d.name}:</span>
        <span className="font-mono text-text">{d.value}</span>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { events, alerts, todayCost, todayQueries, avgResponseTime, cacheHitRate } =
    useDashboardStore();

  const costData = useMemo(() => getCostByDay(events), [events]);
  const distData = useMemo(() => getProviderDistribution(events), [events]);
  const cost = todayCost();
  const queries = todayQueries();
  const avgResp = avgResponseTime();
  const hitRate = cacheHitRate();

  const recentEvents = events.slice(0, 8);
  const recentAlerts = alerts.slice(0, 5);

  const alertIcon = (level: string) => {
    if (level === "error") {
      return <XCircle size={14} className="text-danger" />;
    }
    if (level === "warn") {
      return <AlertTriangle size={14} className="text-warning" />;
    }
    return <Info size={14} className="text-info" />;
  };

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-text">Overview</h1>
        <p className="text-sm text-text-muted mt-1">
          Real-time gateway performance & cost tracking
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="animate-fade-in-up stagger-1">
          <StatCard
            icon={DollarSign}
            label="Today's Cost"
            value={`$${cost.toFixed(2)}`}
            subtext="of $5.00 daily limit"
            progress={(cost / 5) * 100}
            accentColor="#6366F1"
          />
        </div>
        <div className="animate-fade-in-up stagger-2">
          <StatCard
            icon={BarChart3}
            label="Today's Queries"
            value={queries.toString()}
            accentColor="#10B981"
            trend={{ value: "+23 vs y'day", positive: true }}
          />
        </div>
        <div className="animate-fade-in-up stagger-3">
          <StatCard
            icon={Zap}
            label="Avg Response"
            value={`${(avgResp / 1000).toFixed(1)}s`}
            accentColor="#F59E0B"
            trend={{ value: "-0.3s", positive: true }}
          />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <StatCard
            icon={Target}
            label="Cache Hit Rate"
            value={`${hitRate.toFixed(0)}%`}
            accentColor="#3B82F6"
            trend={{ value: "+5% vs y'day", positive: true }}
          />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <ChartCard title="Cost Breakdown (Last 7 Days)" icon="📈" className="lg:col-span-3">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={costData}>
                <defs>
                  <linearGradient id="gPerplexity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOpenAI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gAnthropic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="perplexity"
                  stroke="#6366F1"
                  fill="url(#gPerplexity)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="openai"
                  stroke="#10B981"
                  fill="url(#gOpenAI)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="anthropic"
                  stroke="#F59E0B"
                  fill="url(#gAnthropic)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Provider Distribution" icon="🥧" className="lg:col-span-2">
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {distData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {distData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Bottom section — Live stream + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live query stream */}
        <ChartCard title="Live Query Stream" icon="🔄">
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
            {recentEvents.map((e, i) => (
              <div
                key={e.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-bg/50 border border-border/30 hover:border-primary/20 transition-colors animate-slide-in"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="shrink-0 mt-1">
                  {e.cacheHit ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-info/10 text-info text-[10px] font-mono font-bold">
                      CACHE
                    </span>
                  ) : (
                    <Clock size={12} className="text-text-dim" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-text-dim">
                      {formatTimeAgo(e.timestamp)}
                    </span>
                    {!e.cacheHit && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-light text-text-muted">
                        {e.provider}:{e.model}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text truncate">&ldquo;{e.query}&rdquo;</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] font-mono text-text-dim">
                      Cost: <span className="text-text-muted">${e.cost.toFixed(4)}</span>
                    </span>
                    <span className="text-[10px] font-mono text-text-dim">
                      Tokens:{" "}
                      <span className="text-text-muted">
                        {(e.inputTokens + e.outputTokens).toLocaleString()}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-text-dim">
                      Time:{" "}
                      <span className="text-text-muted">
                        {e.responseTimeMs < 1000
                          ? `${Math.round(e.responseTimeMs)}ms`
                          : `${(e.responseTimeMs / 1000).toFixed(1)}s`}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Recent alerts */}
        <ChartCard title="Recent Alerts" icon="⚠️">
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2">
            {recentAlerts.map((a, i) => (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-bg/50 border border-border/30 animate-slide-in"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="shrink-0 mt-0.5">{alertIcon(a.level)}</div>
                <div className="flex-1">
                  <p className="text-xs text-text">{a.message}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-mono text-text-dim">
                      {formatTimeAgo(a.timestamp)}
                    </span>
                    {a.resolved && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-secondary">
                        <CheckCircle2 size={10} /> Resolved
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
