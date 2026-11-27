import { DurableObject } from 'cloudflare:workers';
import type { RealtimeEvent } from '@/lib/realtime';

type SocketSession = { expiresAt: number };

// Only the Worker and server-side bindings can access these internal endpoints.
export class WorkspaceRealtime extends DurableObject<CloudflareEnv> {
  fetch = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (
      path === '/connect' &&
      request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
    ) {
      const userId = request.headers.get('x-user-id');
      const sessionId = request.headers.get('x-session-id');
      const expiresAt = Number(request.headers.get('x-expires-at'));
      if (
        !userId ||
        !sessionId ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
      )
        return new Response(null, { status: 401 });
      const pair = new WebSocketPair();
      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair('ping', 'pong'),
      );
      this.ctx.acceptWebSocket(pair[1], [
        `user:${userId}`,
        `session:${sessionId}`,
      ]);
      pair[1].serializeAttachment({ expiresAt } satisfies SocketSession);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (path === '/publish' && request.method === 'POST') {
      const { scope, userId } = await request.json<{
        scope: RealtimeEvent['scope'];
        userId?: string;
      }>();
      if (
        !['messages', 'workspace', 'private'].includes(scope) ||
        (scope === 'private' && !userId)
      )
        return new Response(null, { status: 400 });
      const sockets = this.ctx.getWebSockets(
        scope === 'private' ? `user:${userId}` : undefined,
      );
      for (const socket of sockets) {
        try {
          const session =
            socket.deserializeAttachment() as SocketSession | null;
          if (!session || session.expiresAt <= Date.now())
            socket.close(4001, 'Session expired');
          else
            socket.send(
              JSON.stringify({
                type: 'changed',
                scope,
              } satisfies RealtimeEvent),
            );
        } catch {
          socket.close(1011, 'Reconnect required');
        }
      }
      return new Response(null, { status: 204 });
    }
    if (path === '/disconnect' && request.method === 'POST') {
      const { sessionId, userId } = await request.json<{
        sessionId?: string;
        userId?: string;
      }>();
      if (!sessionId && !userId) return new Response(null, { status: 400 });
      const tag = userId ? `user:${userId}` : `session:${sessionId}`;
      for (const socket of this.ctx.getWebSockets(tag))
        socket.close(4001, 'Session ended');
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  };
  webSocketMessage = (socket: WebSocket, _message: string | ArrayBuffer) => {
    // Clients cannot publish events or change subscriptions.
    socket.close(1008, 'Server notifications only');
  };
  webSocketClose = (socket: WebSocket, code: number) => {
    socket.close(
      code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)
        ? code
        : 1000,
    );
  };
  webSocketError = (socket: WebSocket) => {
    socket.close(1011, 'Reconnect required');
  };
}
