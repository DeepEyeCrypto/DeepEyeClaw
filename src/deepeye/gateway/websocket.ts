/**
 * DeepEyeClaw — WebSocket Hub
 *
 * Broadcasts real-time analytics events and provider health updates
 * to connected dashboard clients. Supports channel subscriptions
 * and ping/pong heartbeats.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
import { childLogger } from "../utils/logger.js";
import { uid } from "../utils/helpers.js";

const log = childLogger("websocket");

type Channel = "events" | "health" | "budget" | "cache";

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  channels: Set<Channel>;
  connectedAt: number;
}

export class WebSocketHub {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ConnectedClient>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Attach WebSocket server to an existing HTTP server.
   */
  attach(httpServer: HttpServer, path: string = "/ws"): void {
    this.wss = new WebSocketServer({ server: httpServer, path });

    this.wss.on("connection", (ws, req) => {
      const clientId = uid().slice(0, 8);
      const client: ConnectedClient = {
        id: clientId,
        ws,
        channels: new Set(["events", "health", "budget", "cache"]),
        connectedAt: Date.now(),
      };

      this.clients.set(clientId, client);
      log.info("client connected", { clientId, totalClients: this.clients.size });

      // Send welcome
      this.send(ws, {
        type: "connected",
        clientId,
        channels: Array.from(client.channels),
        timestamp: Date.now(),
      });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(client, msg);
        } catch {
          this.send(ws, { type: "error", message: "invalid JSON" });
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        log.info("client disconnected", { clientId, totalClients: this.clients.size });
      });

      ws.on("error", (err) => {
        log.error("ws error", { clientId, error: err.message });
      });

      // Pong handler for heartbeat
      ws.on("pong", () => {
        // Client is alive
      });
    });

    // Heartbeat every 30s
    this.heartbeatInterval = setInterval(() => {
      for (const [id, client] of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        } else {
          this.clients.delete(id);
        }
      }
    }, 30_000);

    log.info("WebSocket hub attached", { path });
  }

  private handleMessage(client: ConnectedClient, msg: any): void {
    switch (msg.type) {
      case "subscribe":
        if (msg.channel) {
          client.channels.add(msg.channel);
          this.send(client.ws, { type: "subscribed", channel: msg.channel });
        }
        break;

      case "unsubscribe":
        if (msg.channel) {
          client.channels.delete(msg.channel);
          this.send(client.ws, { type: "unsubscribed", channel: msg.channel });
        }
        break;

      case "ping":
        this.send(client.ws, { type: "pong", timestamp: Date.now() });
        break;

      default:
        this.send(client.ws, { type: "error", message: `unknown type: ${msg.type}` });
    }
  }

  // ── Broadcast methods ─────────────────────────────────────────────────

  /** Broadcast to all clients subscribed to a channel. */
  broadcast(channel: Channel, payload: Record<string, unknown>): void {
    const message = { type: channel, ...payload, timestamp: Date.now() };

    for (const client of this.clients.values()) {
      if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        this.send(client.ws, message);
      }
    }
  }

  /** Send an analytics event to all "events" subscribers. */
  broadcastEvent(event: Record<string, unknown>): void {
    this.broadcast("events", { event });
  }

  /** Send a provider health update. */
  broadcastHealth(provider: string, health: Record<string, unknown>): void {
    this.broadcast("health", { provider, health });
  }

  /** Send a budget status update. */
  broadcastBudget(status: Record<string, unknown>): void {
    this.broadcast("budget", { status });
  }

  /** Send cache stats update. */
  broadcastCache(stats: Record<string, unknown>): void {
    this.broadcast("cache", { stats });
  }

  // ── Utilities ─────────────────────────────────────────────────────────

  getConnectedClients(): number {
    return this.clients.size;
  }

  private send(ws: WebSocket, data: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  shutdown(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    for (const client of this.clients.values()) {
      client.ws.close(1000, "server shutting down");
    }
    this.clients.clear();

    this.wss?.close();
    log.info("WebSocket hub shut down");
  }
}
