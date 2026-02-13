/**
 * DeepEyeClaw Dashboard — Gateway API Client
 *
 * Connects to the DeepEyeClaw gateway's REST + WebSocket APIs.
 * Falls back to mock data when the gateway is unreachable.
 */

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:3100";
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3100/ws";

export type GatewayHealth = {
  status: string;
  providers: Record<
    string,
    { live: boolean; healthy: boolean; successRate: number; avgLatencyMs: number }
  >;
  wsClients: number;
  uptime: number;
  timestamp: number;
};

export type GatewayAnalytics = {
  totalQueries: number;
  totalCost: number;
  cacheHitRate: number;
  avgResponseTimeMs: number;
  costByProvider: Record<string, number>;
  costByModel: Record<string, number>;
  queriesByComplexity: Record<string, number>;
  recentErrors: number;
};

export type GatewayBudget = {
  statuses: Array<{
    period: string;
    limit: number;
    spent: number;
    remaining: number;
    percentUsed: number;
  }>;
  emergencyMode: boolean;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
};

export type GatewayCacheStats = {
  stats: {
    totalEntries: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
    totalCostSaved: number;
    avgResponseTimeMs: number;
  };
  entries: Array<{
    queryHash: string;
    queryText: string;
    provider: string;
    model: string;
    hitCount: number;
    cost: number;
    createdAt: number;
    expiresAt: number;
  }>;
};

// ── HTTP Client ───────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

export async function checkGatewayHealth(): Promise<GatewayHealth | null> {
  return fetchJson<GatewayHealth>("/api/health");
}

export async function fetchAnalytics(): Promise<GatewayAnalytics | null> {
  return fetchJson<GatewayAnalytics>("/api/analytics");
}

export async function fetchBudget(): Promise<GatewayBudget | null> {
  return fetchJson<GatewayBudget>("/api/budget");
}

export async function fetchCacheStats(): Promise<GatewayCacheStats | null> {
  return fetchJson<GatewayCacheStats>("/api/cache");
}

export async function clearCache(): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/cache/clear`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchConfig(): Promise<Record<string, unknown> | null> {
  return fetchJson("/api/config");
}

export async function fetchRecentEvents(limit = 50): Promise<unknown[] | null> {
  const data = await fetchJson<{ events: unknown[] }>(`/api/analytics/events?limit=${limit}`);
  return data?.events ?? null;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

type WsMessage = {
  type: "event" | "health" | "budget" | "error";
  data: unknown;
};

type WsCallbacks = {
  onEvent?: (data: unknown) => void;
  onHealth?: (data: unknown) => void;
  onBudget?: (data: unknown) => void;
  onError?: (data: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export class GatewayWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: WsCallbacks;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private disposed = false;

  constructor(callbacks: WsCallbacks) {
    this.callbacks = callbacks;
  }

  connect() {
    if (this.disposed) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.reconnectDelay = 1000;
        this.callbacks.onConnect?.();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WsMessage = JSON.parse(event.data as string);
          switch (msg.type) {
            case "event":
              this.callbacks.onEvent?.(msg.data);
              break;
            case "health":
              this.callbacks.onHealth?.(msg.data);
              break;
            case "budget":
              this.callbacks.onBudget?.(msg.data);
              break;
            case "error":
              this.callbacks.onError?.(msg.data);
              break;
          }
        } catch {
          /* ignore parse errors */
        }
      };

      this.ws.onclose = () => {
        this.callbacks.onDisconnect?.();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.disposed) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }
}
