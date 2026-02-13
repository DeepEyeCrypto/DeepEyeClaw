import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  subtext?: string;
  progress?: number; // 0-100
  accentColor?: string;
  trend?: { value: string; positive: boolean };
  className?: string;
  children?: ReactNode;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  progress,
  accentColor = "#6366F1",
  trend,
  className = "",
  children,
}: StatCardProps) {
  return (
    <div
      className={`stat-card ${className}`}
      style={{ "--accent": accentColor } as React.CSSProperties}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            <Icon size={16} />
          </div>
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            {label}
          </span>
        </div>

        {trend && (
          <span
            className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-full ${
              trend.positive ? "text-secondary bg-secondary/10" : "text-danger bg-danger/10"
            }`}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>

      <p className="text-2xl font-bold font-mono tracking-tight text-text">{value}</p>

      {subtext && <p className="text-xs text-text-muted mt-1">{subtext}</p>}

      {progress !== undefined && (
        <div className="mt-3">
          <div className="w-full h-2 rounded-full bg-surface-light overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(100, progress)}%`,
                background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)`,
              }}
            />
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
