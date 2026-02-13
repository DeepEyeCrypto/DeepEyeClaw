import {
  LayoutDashboard,
  BarChart3,
  Database,
  Server,
  Settings,
  Menu,
  RefreshCw,
  Octagon,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useDashboardStore } from "../store/dashboard";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/cache", icon: Database, label: "Cache" },
  { to: "/providers", icon: Server, label: "Providers" },
  { to: "/config", icon: Settings, label: "Config" },
];

export function Layout() {
  const { sidebarOpen, toggleSidebar, refreshData } = useDashboardStore();

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full bg-surface border-r border-border z-40 transition-all duration-300 ease-in-out ${
          sidebarOpen ? "w-60" : "w-[68px]"
        }`}
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-border">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary shrink-0">
            <Octagon size={20} />
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in-up">
              <h1 className="text-sm font-bold text-text leading-none tracking-tight">
                DeepEyeClaw
              </h1>
              <p className="text-[10px] text-text-muted mt-0.5 font-mono">v2.0 — GATEWAY</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-3 mt-2">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? "bg-primary/15 text-primary shadow-sm shadow-primary/10"
                    : "text-text-muted hover:text-text hover:bg-surface-light/50"
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              {sidebarOpen && <span className="animate-fade-in-up">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom collapse button */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border">
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-full py-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-light/50 transition-colors"
          >
            <Menu size={18} />
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <main
        className={`flex-1 transition-all duration-300 ease-in-out ${
          sidebarOpen ? "ml-60" : "ml-[68px]"
        }`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-6 bg-bg/80 backdrop-blur-xl border-b border-border/50">
          <div className="flex items-center gap-3">
            {(() => {
              const status = useDashboardStore.getState().connectionStatus;
              const colors = {
                connected: {
                  bg: "bg-secondary/10",
                  border: "border-secondary/20",
                  dot: "bg-secondary",
                  text: "text-secondary",
                  label: "Live",
                },
                disconnected: {
                  bg: "bg-danger/10",
                  border: "border-danger/20",
                  dot: "bg-danger",
                  text: "text-danger",
                  label: "Offline",
                },
                mock: {
                  bg: "bg-info/10",
                  border: "border-info/20",
                  dot: "bg-info",
                  text: "text-info",
                  label: "Mock",
                },
              };
              const c = colors[status];
              return (
                <div
                  className={`flex items-center gap-2 px-3 py-1 rounded-full ${c.bg} border ${c.border}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${c.dot} ${status === "connected" ? "animate-pulse" : ""}`}
                  />
                  <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshData}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text bg-surface hover:bg-surface-light border border-border transition-all"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
              E
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
