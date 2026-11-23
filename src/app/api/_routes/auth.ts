import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Hono } from 'hono';
import { disconnectSession } from '@/app/api/_lib/realtime';
import type { ApiEnv } from '@/app/api/_lib/types';
import { getAuth } from '@/lib/auth';
export const authRoutes = new Hono<ApiEnv>().on(
  ['GET', 'POST'],
  '/*',
  async (c) => {
    const { env } = getCloudflareContext();
    const auth = getAuth(env, new URL(c.req.url).origin);
    const signingOut =
      c.req.method === 'POST' && c.req.path === '/api/auth/sign-out';
    const session = signingOut
      ? await auth.api.getSession({ headers: c.req.raw.headers })
      : null;
    const response = await auth.handler(c.req.raw);
    if (response.ok && session) disconnectSession(session.session.id);
    return response;
  },
);
