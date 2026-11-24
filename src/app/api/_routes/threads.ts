import { and, asc, eq, exists, inArray, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getAttachments } from '@/app/api/_lib/attachments';
import { getMessageMentions } from '@/app/api/_lib/message-events';
import { getMessageQuotes } from '@/app/api/_lib/quotes';
import type { ApiEnv } from '@/app/api/_lib/types';
import { bookmark, channel, message, reaction, user } from '@/lib/schema';

export const threadsRoutes = new Hono<ApiEnv>().get(
  '/:id/thread',
  async (c) => {
    const db = c.var.db;
    const [target] = await db
      .select()
      .from(message)
      .where(eq(message.id, c.req.param('id')));
    if (!target)
      throw new HTTPException(404, {
        message: '投稿が削除されたか、見つかりません。',
      });
    const parentId = target.parentId ?? target.id;
    const rows = await db
      .select({
        id: message.id,
        body: message.body,
        channelId: message.channelId,
        parentId: message.parentId,
        userId: message.userId,
        author: user.name,
        authorImage: user.image,
        channelName: channel.name,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        saved: exists(
          db
            .select()
            .from(bookmark)
            .where(
              and(
                eq(bookmark.messageId, message.id),
                eq(bookmark.userId, c.var.user.id),
              ),
            ),
        ),
      })
      .from(message)
      .innerJoin(user, eq(message.userId, user.id))
      .innerJoin(channel, eq(message.channelId, channel.id))
      .where(or(eq(message.id, parentId), eq(message.parentId, parentId)))
      .orderBy(asc(message.createdAt), asc(message.id));
    const quotes = await getMessageQuotes(
      db,
      rows.map((row) => row.id),
    );
    const reactions = await db
      .select()
      .from(reaction)
      .where(
        inArray(
          reaction.messageId,
          rows.map((row) => row.id),
        ),
      );
    const attachments = await getAttachments(
      db,
      rows.map((row) => row.id),
    );
    const mentions = await getMessageMentions(
      db,
      rows.map((row) => row.id),
    );
    return c.json({
      parentId,
      messages: rows.map((row) => ({
        ...row,
        saved: Boolean(row.saved),
        quote: quotes.find((item) => item.messageId === row.id) ?? null,
        mentions: mentions.filter((item) => item.messageId === row.id),
        attachments: attachments.filter((item) => item.messageId === row.id),
        replyCount: row.id === parentId ? rows.length - 1 : 0,
        reactions: reactions
          .filter((item) => item.messageId === row.id)
          .map(({ emoji, userId }) => ({ emoji, userId })),
      })),
    });
  },
);
