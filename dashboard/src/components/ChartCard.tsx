import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  icon?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export function ChartCard({ title, icon, children, className = "", actions }: ChartCardProps) {
  return (
    <div className={`glass-card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </div>
  );
}
