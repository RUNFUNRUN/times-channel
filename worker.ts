import handler from './.open-next/worker.js';
import { getAuth } from './src/lib/auth';
import { REALTIME_PATH, REALTIME_ROOM } from './src/lib/realtime';

export { WorkspaceRealtime } from './src/app/api/_lib/realtime-room';

export default {
  fetch: async (request, env, ctx) => {
    const url = new URL(request.url);
    if (url.pathname !== REALTIME_PATH) return handler.fetch(request, env, ctx);
    const headers = { 'Cache-Control': 'private, no-store' };
    if (request.method !== 'GET')
      return new Response(null, {
        status: 405,
        headers: { ...headers, Allow: 'GET' },
      });
    // A browser always supplies Origin for WebSocket handshakes.
    if (request.headers.get('Origin') !== url.origin)
      return new Response(null, { status: 403, headers });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response(null, { status: 426, headers });
    try {
      const session = await getAuth(env, url.origin).api.getSession({
        headers: request.headers,
      });
      if (!session) return new Response(null, { status: 401, headers });
      return env.REALTIME.getByName(REALTIME_ROOM).fetch(
        'https://realtime.internal/connect',
        {
          headers: {
            Upgrade: 'websocket',
            'x-user-id': session.user.id,
            'x-session-id': session.session.id,
            'x-expires-at': String(session.session.expiresAt.getTime()),
          },
        },
      );
    } catch (error) {
      console.error('Realtime connection failed', error);
      return new Response(null, { status: 503, headers });
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;
