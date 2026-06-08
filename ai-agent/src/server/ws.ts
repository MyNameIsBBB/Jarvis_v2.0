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
    ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to Durable Agent Server' }));
  });
}

/**
 * Broadcasts status updates or interruptions to all connected UI clients.
 */
export function broadcastTaskUpdate(payload: {
  taskId: string;
  status: string;
  title: string;
  graphState: any;
  interruptionPrompt?: string;
}): void {
  const message = JSON.stringify({
    type: 'task_update',
    ...payload,
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
