import { useEffect, useState, useRef } from 'react';

export interface WebSocketUpdatePayload {
  type: string;
  taskId: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'AWAITING_HUMAN';
  title: string;
  graphState: {
    messages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }[];
    variables: Record<string, any>;
    tokenLogs?: { promptTokens: number; completionTokens: number; totalTokens: number; timestamp: string }[];
  };
  interruptionPrompt?: string;
}

export function useAgentWebSocket(onTaskUpdate: (data: WebSocketUpdatePayload) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Determine WebSocket host URL
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';
    console.log(`[WS] Initializing connection to ${wsUrl}...`);
    
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connection established successfully.');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'task_update') {
          onTaskUpdate(payload as WebSocketUpdatePayload);
        } else {
          console.log('[WS] Received server payload:', payload);
        }
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
  }, [onTaskUpdate]);

  return { isConnected };
}
