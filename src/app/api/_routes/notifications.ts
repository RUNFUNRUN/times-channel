import { zValidator } from '@hono/zod-validator';
import { and, count, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { getMessageMentions } from '@/app/api/_lib/message-events';
import type { ApiEnv } from '@/app/api/_lib/types';
import { displayMentions } from '@/lib/mentions';
import { channel, message, notification, user } from '@/lib/schema';

export const notificationsRoutes = new Hono<ApiEnv>()
  .get('/unread-count', async (c) => {
    const [result] = await c.var.db
      .select({ unreadCount: count() })
      .from(notification)
      .where(
        and(
          eq(notification.userId, c.var.user.id),
          isNull(notification.readAt),
        ),
      );
    return c.json(result);
  })
  .get(
    '/',
    zValidator(
      'query',
      z.object({
        unread: z.enum(['true']).optional(),
        before: z
          .string()
          .regex(/^\d{1,15}:[a-f0-9-]{36}$/)
          .optional(),
      }),
    ),
    async (c) => {
      const { before, unread } = c.req.valid('query');
      const [timestamp, cursorId] = before?.split(':') ?? [];
      const rows = await c.var.db
        .select({
          id: notification.id,
          kind: notification.kind,
          emoji: notification.emoji,
          createdAt: notification.createdAt,
          readAt: notification.readAt,
          actorName: user.name,
          actorImage: user.image,
          messageId: message.id,
          parentId: message.parentId,
          body: message.body,
          channelId: channel.id,
          channelName: channel.name,
        })
        .from(notification)
        .innerJoin(user, eq(notification.actorId, user.id))
        .innerJoin(message, eq(notification.messageId, message.id))
        .innerJoin(channel, eq(message.channelId, channel.id))
        .where(
          and(
            eq(notification.userId, c.var.user.id),
            unread ? isNull(notification.readAt) : undefined,
            before
              ? or(
                  lt(notification.createdAt, Number(timestamp)),
                  and(
                    eq(notification.createdAt, Number(timestamp)),
                    lt(notification.id, cursorId),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(notification.createdAt), desc(notification.id))
        .limit(51);
      const selected = rows.slice(0, 50);
      const mentions = await getMessageMentions(
        c.var.db,
        selected.map((row) => row.messageId),
      );
      const last = selected.at(-1);
      return c.json({
        notifications: selected.map((row) => ({
          ...row,
          body: displayMentions(
            row.body,
            mentions
              .filter((item) => item.messageId === row.messageId)
              .map((item) => ({ id: item.userId, name: item.name })),
          ).text,
          threadId: row.parentId ?? row.messageId,
        })),
        nextCursor:
          rows.length > 50 && last ? `${last.createdAt}:${last.id}` : null,
      });
    },
  )
  .put('/read-all', async (c) => {
    await c.var.db
      .update(notification)
      .set({ readAt: Date.now() })
      .where(
        and(
          eq(notification.userId, c.var.user.id),
          isNull(notification.readAt),
        ),
      );
    return c.json({ ok: true });
  })
  .put(
    '/:id/read',
    zValidator('json', z.object({ read: z.boolean() })),
    async (c) => {
      const changed = await c.var.db
        .update(notification)
        .set({
          readAt: c.req.valid('json').read
            ? sql`coalesce(${notification.readAt}, ${Date.now()})`
            : null,
        })
        .where(
          and(
            eq(notification.id, c.req.param('id')),
            eq(notification.userId, c.var.user.id),
          ),
        )
        .returning({ id: notification.id });
      if (!changed.length)
        throw new HTTPException(404, { message: '通知が見つかりません。' });
      return c.json({ ok: true });
    },
  );
