import { asc } from 'drizzle-orm';
import { Hono } from 'hono';
import type { ApiEnv } from '@/app/api/_lib/types';
import { user } from '@/lib/schema';

export const membersRoutes = new Hono<ApiEnv>().get('/', async (c) =>
  c.json({
    members: await c.var.db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .orderBy(asc(user.name), asc(user.email)),
  }),
);
