import { create } from "zustand";
import {
  generateQueryEvents,
  generateAlerts,
  generateCacheEntries,
  generateProviderStatuses,
  type QueryEvent,
  type AlertEvent,
  type CacheEntry,
  type ProviderStatus,
} from "../data/mock";
import {
  checkGatewayHealth,
  fetchAnalytics,
  fetchBudget,
  fetchCacheStats,
  GatewayWebSocket,
} from "../data/api";

type TimeRange = "24h" | "7d" | "30d" | "custom";
type ConnectionStatus = "connected" | "disconnected" | "mock";

interface DashboardState {
  // Data
  events: QueryEvent[];
  alerts: AlertEvent[];
  cacheEntries: CacheEntry[];
  providers: ProviderStatus[];
  // Live connection
  connectionStatus: ConnectionStatus;
  gatewayUptime: number | null;
  wsClients: number;
  // UI
  timeRange: TimeRange;
  sidebarOpen: boolean;
  activeNav: string;
  // Actions
  setTimeRange: (range: TimeRange) => void;
  toggleSidebar: () => void;
  setActiveNav: (nav: string) => void;
  refreshData: () => void;
  connectToGateway: () => void;
  // Derived
  todayCost: () => number;
  todayQueries: () => number;
  avgResponseTime: () => number;
  cacheHitRate: () => number;
  filteredEvents: () => QueryEvent[];
}

const now = Date.now();
const day = 86400000;

let wsInstance: GatewayWebSocket | null = null;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  events: generateQueryEvents(300),
  alerts: generateAlerts(),
  cacheEntries: generateCacheEntries(80),
  providers: generateProviderStatuses(),
  connectionStatus: "mock",
  gatewayUptime: null,
  wsClients: 0,
  timeRange: "7d",
  sidebarOpen: true,
  activeNav: "dashboard",

  setTimeRange: (range) => set({ timeRange: range }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveNav: (nav) => set({ activeNav: nav }),

  refreshData: () => {
    // Try live API first
    get().connectToGateway();
    // Always refresh mock as baseline
    set({
      events: generateQueryEvents(300),
      alerts: generateAlerts(),
      cacheEntries: generateCacheEntries(80),
      providers: generateProviderStatuses(),
    });
  },

  connectToGateway: () => {
    // Attempt to connect to live gateway
    checkGatewayHealth().then((health) => {
      if (health) {
        set({
          connectionStatus: "connected",
          gatewayUptime: health.uptime,
          wsClients: health.wsClients,
        });

        // Update provider statuses from live data
        const liveProviders = Object.entries(health.providers).map(([id, data]) => ({
          id: id as ProviderStatus["id"],
          name: id.charAt(0).toUpperCase() + id.slice(1),
          healthy: data.live && data.healthy,
          latencyMs: data.avgLatencyMs ?? 0,
          successRate: data.successRate ?? 0,
          models: [],
          todayCost: 0,
          monthCost: 0,
          monthLimit: 30,
        }));
        if (liveProviders.length > 0) {
          set({ providers: liveProviders });
        }

        // Connect WebSocket for real-time updates
        if (!wsInstance) {
          wsInstance = new GatewayWebSocket({
            onConnect: () => set({ connectionStatus: "connected" }),
            onDisconnect: () => set({ connectionStatus: "disconnected" }),
            onEvent: (data) => {
              const event = data as QueryEvent;
              set((s) => ({
                events: [event, ...s.events].slice(0, 500),
              }));
            },
          });
          wsInstance.connect();
        }
      } else {
        set({ connectionStatus: "mock" });
      }
    });
  },

  todayCost: () => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return get()
      .events.filter((e) => e.timestamp >= todayStart)
      .reduce((sum, e) => sum + e.cost, 0);
  },

  todayQueries: () => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return get().events.filter((e) => e.timestamp >= todayStart).length;
  },

  avgResponseTime: () => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const today = get().events.filter((e) => e.timestamp >= todayStart);
    if (today.length === 0) return 0;
    return today.reduce((s, e) => s + e.responseTimeMs, 0) / today.length;
  },

  cacheHitRate: () => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const today = get().events.filter((e) => e.timestamp >= todayStart);
    if (today.length === 0) return 0;
    return (today.filter((e) => e.cacheHit).length / today.length) * 100;
  },

  filteredEvents: () => {
    const range = get().timeRange;
    const cutoff =
      range === "24h" ? now - day : range === "7d" ? now - 7 * day : now - 30 * day;
    return get().events.filter((e) => e.timestamp >= cutoff);
  },
}));
