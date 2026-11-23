import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { ApiEnv } from '@/app/api/_lib/types';
import { channel, favorite } from '@/lib/schema';

export const channelsRoutes = new Hono<ApiEnv>()
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .regex(
            /^[a-z0-9][a-z0-9_-]*$/,
            '半角英数字・ハイフン・アンダースコアを使ってください。',
          ),
        description: z.string().trim().max(200).default(''),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json');
      const id = crypto.randomUUID();
      const created = await c.var.db
        .insert(channel)
        .values({ ...input, id, createdAt: Date.now() })
        .onConflictDoNothing()
        .returning();
      if (!created.length)
        return c.json({ error: 'そのチャンネル名は使われています。' }, 409);
      return c.json({ channel: created[0] }, 201);
    },
  )
  .put(
    '/:id/favorite',
    zValidator('json', z.object({ active: z.boolean() })),
    async (c) => {
      const channelId = c.req.param('id');
      const [target] = await c.var.db
        .select()
        .from(channel)
        .where(eq(channel.id, channelId));
      if (!target)
        throw new HTTPException(404, {
          message: 'チャンネルが見つかりません。',
        });
      const values = { channelId, userId: c.var.user.id };
      if (c.req.valid('json').active)
        await c.var.db.insert(favorite).values(values).onConflictDoNothing();
      else
        await c.var.db
          .delete(favorite)
          .where(
            and(
              eq(favorite.channelId, channelId),
              eq(favorite.userId, c.var.user.id),
            ),
          );
      return c.json({ ok: true });
    },
  );
