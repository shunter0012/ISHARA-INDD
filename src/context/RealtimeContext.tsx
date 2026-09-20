import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export interface RealtimeEvent {
  type: string;
  [key: string]: any;
}

type EventHandler = (event: RealtimeEvent) => void;

interface RealtimeContextType {
  connected: boolean;
  subscribe: (eventType: string, handler: EventHandler) => () => void;
  latestEvent: RealtimeEvent | null;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, logout } = useAuth();
  const [connected, setConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<RealtimeEvent | null>(null);
  const listenersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);

  const subscribe = (eventType: string, handler: EventHandler) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(handler);

    return () => {
      listenersRef.current.get(eventType)?.delete(handler);
    };
  };

  useEffect(() => {
    // Connect to SSE stream
    const streamUrl = token ? `/api/realtime/stream?token=${encodeURIComponent(token)}` : '/api/realtime/stream';
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data: RealtimeEvent = JSON.parse(event.data);
        setLatestEvent(data);

        // Security check: If current user was banned, force immediate session termination
        if (data.type === 'USER_BANNED' && user && data.userId === user.id) {
          console.warn(`[Realtime] User was banned by administration: ${data.banInfo?.reason || 'Violation of terms'}`);
          logout();
          return;
        }

        // Notify specific listeners
        if (data.type && listenersRef.current.has(data.type)) {
          listenersRef.current.get(data.type)!.forEach(fn => fn(data));
        }

        // Notify wildcard listeners
        if (listenersRef.current.has('*')) {
          listenersRef.current.get('*')!.forEach(fn => fn(data));
        }
      } catch {
        // Ignore unparseable frames (like keep-alive comments)
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [token, user?.id]);

  return (
    <RealtimeContext.Provider value={{ connected, subscribe, latestEvent }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used within a RealtimeProvider');
  return context;
};
