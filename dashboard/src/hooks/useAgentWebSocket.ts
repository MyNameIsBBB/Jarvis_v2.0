import { useEffect, useState, useRef } from 'react';

export interface WebSocketPayload {
  type: 'chat_token' | 'tool_status' | 'session_update' | 'welcome' | 'session_redirect';
  sessionId?: string;
  token?: string;
  toolName?: string;
  status?: 'running' | 'completed' | 'failed';
  result?: string;
  eventType?: 'chat_done' | 'session_created' | 'session_deleted';
  targetSessionId?: string;
}

export function useAgentWebSocket(onMessageReceived: (payload: WebSocketPayload) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Determine WebSocket host URL
    let wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }
    console.log(`[WS] Connecting to ${wsUrl}...`);
    
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connection established successfully.');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as WebSocketPayload;
        onMessageReceived(payload);
      } catch (err) {
        console.error('[WS] Error parsing incoming socket stream payload:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Connection closed by remote host.');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('[WS] Connection error occurred:', error);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [onMessageReceived]);

  return { isConnected };
}
