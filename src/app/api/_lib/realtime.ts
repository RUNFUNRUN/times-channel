import { getCloudflareContext } from '@opennextjs/cloudflare';
import { REALTIME_ROOM, type RealtimeScope } from '@/lib/realtime';

const notify = (path: string, body: object) => {
  // next dev runs in Node; the custom WebSocket Worker runs in preview/production.
  if (process.env.NODE_ENV === 'development') return;
  const { env, ctx } = getCloudflareContext();
  ctx.waitUntil(
    (async () => {
      const response = await env.REALTIME.getByName(REALTIME_ROOM).fetch(
        `https://realtime.internal${path}`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      if (!response.ok)
        throw new Error(`Realtime publish failed: ${response.status}`);
    })().catch((error) =>
      console.error(
        'Realtime notification failed; periodic refresh will recover',
        error,
      ),
    ),
  );
};
export const publishChange = (scope: RealtimeScope, userId?: string) =>
  notify('/publish', { scope, userId });
export const disconnectSession = (sessionId: string) =>
  notify('/disconnect', { sessionId });
export const disconnectMember = (userId: string) =>
  notify('/disconnect', { userId });
