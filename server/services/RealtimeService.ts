import { Response } from 'express';
import type { WebSocket } from 'ws';

export interface RealtimeClient {
  id: string;
  userId?: string;
  res: Response;
  connectedAt: Date;
}

export interface RealtimeWsClient {
  id: string;
  userId?: string;
  ws: WebSocket;
  connectedAt: Date;
}

export class RealtimeService {
  private static clients: Map<string, RealtimeClient> = new Map();
  private static wsClients: Map<string, RealtimeWsClient> = new Map();
  private static pingInterval: NodeJS.Timeout | null = null;

  public static initialize(): void {
    if (this.pingInterval) return;
    // Send keepalive comments every 20 seconds to keep streams alive through nginx proxies
    this.pingInterval = setInterval(() => {
      // SSE Keepalive
      this.clients.forEach((client, id) => {
        try {
          client.res.write(': keep-alive\n\n');
        } catch {
          this.removeClient(id);
        }
      });

      // WS Ping
      this.wsClients.forEach((client, id) => {
        try {
          if (client.ws.readyState === 1) { // OPEN
            client.ws.ping();
          } else {
            this.removeWsClient(id);
          }
        } catch {
          this.removeWsClient(id);
        }
      });
    }, 20000);
  }

  public static addClient(id: string, res: Response, userId?: string): void {
    this.initialize();
    this.clients.set(id, {
      id,
      userId,
      res,
      connectedAt: new Date()
    });
  }

  public static removeClient(id: string): void {
    this.clients.delete(id);
  }

  public static addWsClient(id: string, ws: WebSocket, userId?: string): void {
    this.initialize();
    this.wsClients.set(id, {
      id,
      userId,
      ws,
      connectedAt: new Date()
    });
  }

  public static removeWsClient(id: string): void {
    this.wsClients.delete(id);
  }

  public static broadcast(event: { type: string; [key: string]: any }, targetUserIds?: string[]): void {
    const jsonString = JSON.stringify(event);
    const ssePayload = `data: ${jsonString}\n\n`;

    // Broadcast to SSE clients
    this.clients.forEach((client, id) => {
      if (targetUserIds && client.userId && !targetUserIds.includes(client.userId)) {
        return;
      }
      try {
        client.res.write(ssePayload);
      } catch {
        this.removeClient(id);
      }
    });

    // Broadcast to WebSocket clients
    this.wsClients.forEach((client, id) => {
      if (targetUserIds && client.userId && !targetUserIds.includes(client.userId)) {
        return;
      }
      try {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          client.ws.send(jsonString);
        }
      } catch {
        this.removeWsClient(id);
      }
    });
  }

  public static getConnectedCount(): number {
    return this.clients.size + this.wsClients.size;
  }

  public static isUserConnected(userId: string): boolean {
    for (const client of this.clients.values()) {
      if (client.userId === userId) return true;
    }
    for (const client of this.wsClients.values()) {
      if (client.userId === userId) return true;
    }
    return false;
  }
}
