import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createMiddleware } from 'hono/factory';
import { publishChange } from '@/app/api/_lib/realtime';
import type { ApiEnv } from '@/app/api/_lib/types';
import { getAuth } from '@/lib/auth';
import { getDB } from '@/lib/db';
export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  const origin = c.req.header('origin');
  if (
    !['GET', 'HEAD'].includes(c.req.method) &&
    origin &&
    origin !== new URL(c.req.url).origin
  ) {
    return c.json({ error: 'この送信元からは操作できません。' }, 403);
  }
  const { env } = getCloudflareContext();
  const session = await getAuth(env, new URL(c.req.url).origin).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) return c.json({ error: 'ログインしてください。' }, 401);
  c.set('db', getDB(env.DB));
  c.set('user', session.user);
  await next();
  if (!['GET', 'HEAD'].includes(c.req.method) && c.res.status < 400) {
    const path = c.req.path;
    if (
      path.startsWith('/api/notifications') ||
      path.endsWith('/bookmark') ||
      path.endsWith('/favorite') ||
      (path.startsWith('/api/channels/') && path.endsWith('/read'))
    )
      publishChange('private', session.user.id);
    else if (path.startsWith('/api/channels') || path === '/api/profile')
      publishChange('workspace');
    else if (path.startsWith('/api/messages') || path === '/api/uploads')
      publishChange('messages');
  }
});
