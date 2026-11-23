'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  parseRealtimeEvent,
  REALTIME_PATH,
  realtimeQueryKeys,
} from '@/lib/realtime';

export const RealtimeContext = createContext(false);
// Periodic reconciliation also recovers a missed server-side publish.
export const useRealtimeInterval = (fallback = 10000) =>
  useContext(RealtimeContext) ? 60000 : fallback;

export const useRealtime = () => {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const connection = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;
    const state = {
      stopped: false,
      attempts: 0,
      reconnect: undefined as ReturnType<typeof setTimeout> | undefined,
      heartbeat: undefined as ReturnType<typeof setInterval> | undefined,
      pongDeadline: 0,
      refresh: undefined as ReturnType<typeof setTimeout> | undefined,
      keys: new Set<string>(),
    };
    const refresh = (scope?: Parameters<typeof realtimeQueryKeys>[0]) => {
      for (const key of realtimeQueryKeys(scope)) state.keys.add(key);
      if (state.refresh) return;
      state.refresh = setTimeout(() => {
        state.refresh = undefined;
        for (const key of state.keys)
          void queryClient.invalidateQueries({ queryKey: [key] });
        state.keys.clear();
      }, 75);
    };
    const connect = () => {
      if (
        state.stopped ||
        !navigator.onLine ||
        (connection.current &&
          connection.current.readyState !== WebSocket.CLOSED)
      )
        return;
      const url = new URL(REALTIME_PATH, window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url);
      connection.current = socket;
      socket.onopen = () => {
        if (state.stopped) {
          socket.close();
          return;
        }
        state.attempts = 0;
        state.pongDeadline = 0;
        setConnected(true);
        // Catch up after initial connection, offline time, or deployment.
        refresh();
        state.heartbeat = setInterval(() => {
          if (state.pongDeadline && Date.now() > state.pongDeadline) {
            socket.close();
            return;
          }
          if (socket.readyState === WebSocket.OPEN && !state.pongDeadline) {
            state.pongDeadline = Date.now() + 45000;
            socket.send('ping');
          }
        }, 20000);
      };
      socket.onmessage = (event) => {
        if (event.data === 'pong') {
          state.pongDeadline = 0;
          return;
        }
        const message = parseRealtimeEvent(event.data);
        if (message) refresh(message.scope);
      };
      socket.onerror = () => {
        socket.close();
      };
      socket.onclose = (event) => {
        clearInterval(state.heartbeat);
        setConnected(false);
        if (state.stopped) return;
        if (event.code === 4001) {
          window.location.reload();
          return;
        }
        state.attempts += 1;
        state.reconnect = setTimeout(
          connect,
          Math.min(30000, 1000 * 2 ** Math.min(state.attempts - 1, 5)) +
            Math.random() * 500,
        );
      };
    };
    const resume = () => {
      if (
        state.stopped ||
        (connection.current &&
          connection.current.readyState !== WebSocket.CLOSED)
      )
        return;
      clearTimeout(state.reconnect);
      connect();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') resume();
    };
    connect();
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      state.stopped = true;
      clearTimeout(state.reconnect);
      clearTimeout(state.refresh);
      clearInterval(state.heartbeat);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', visibility);
      const socket = connection.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
      connection.current = null;
    };
  }, [queryClient]);
  return connected;
};
