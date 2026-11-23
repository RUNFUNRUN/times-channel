import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Hono } from 'hono';
import type { ApiEnv } from '@/app/api/_lib/types';
import { getAuth } from '@/lib/auth';
export const authRoutes = new Hono<ApiEnv>().on(['GET', 'POST'], '/*', (c) => {
  const { env } = getCloudflareContext();
  return getAuth(env, new URL(c.req.url).origin).handler(c.req.raw);
});
