import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

const clients = new Set<WebSocket>();
let wss: WebSocketServer | null = null;

/**
 * Initializes the WebSocket server attached to our Express HTTP server.
 */
export function initWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('[WS] Client connected.');

    ws.on('close', () => {
      clients.delete(ws);
      console.log('[WS] Client disconnected.');
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err);
      clients.delete(ws);
    });

    // Send a welcome handshake
    ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to Jarvis AI Assistant Server' }));
  });
}

/**
 * Broadcasts a text token streamed from Ollama to all clients.
 */
export function broadcastToken(sessionId: string, token: string): void {
  const message = JSON.stringify({
    type: 'chat_token',
    sessionId,
    token,
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Broadcasts tool execution status (running/completed/failed) to all clients.
 */
export function broadcastToolStatus(
  sessionId: string,
  toolName: string,
  status: 'running' | 'completed' | 'failed',
  result?: string
): void {
  const message = JSON.stringify({
    type: 'tool_status',
    sessionId,
    toolName,
    status,
    result,
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Broadcasts session updates (like title updates or chat completion).
 */
export function broadcastSessionUpdate(sessionId: string, eventType: 'chat_done' | 'session_created' | 'session_deleted'): void {
  const message = JSON.stringify({
    type: 'session_update',
    sessionId,
    eventType,
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
