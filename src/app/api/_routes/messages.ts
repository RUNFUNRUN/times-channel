import { zValidator } from '@hono/zod-validator';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  and,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  cleanupUploads,
  getAttachments,
  validateMessageTarget,
} from '@/app/api/_lib/attachments';
import {
  getMessageMentions,
  messageEventWrites,
  notificationRecord,
  resolveMentions,
} from '@/app/api/_lib/message-events';
import type { ApiEnv } from '@/app/api/_lib/types';
import { MESSAGE_LIMIT, REACTIONS } from '@/lib/constants';
import {
  attachment,
  bookmark,
  channel,
  fileCleanup,
  message,
  messageMention,
  notification,
  reaction,
  user,
} from '@/lib/schema';

const bodySchema = z.object({
  body: z.string().trim().min(1).max(MESSAGE_LIMIT),
});
const mentionedUser = alias(user, 'mentioned_user');

export const messagesRoutes = new Hono<ApiEnv>()
  .get(
    '/',
    zValidator(
      'query',
      z.object({
        channelId: z.string().optional(),
        q: z.string().trim().max(200).optional(),
        saved: z.enum(['true']).optional(),
        before: z.string().optional(),
      }),
    ),
    async (c) => {
      const db = c.var.db;
      const me = c.var.user.id;
      const { channelId, q, saved, before } = c.req.valid('query');
      const [cursor] = before
        ? await db.select().from(message).where(eq(message.id, before))
        : [];
      const escaped = q?.replace(/[!%_]/g, '!$&');
      const mentionSearch = escaped?.replace(/^@/, '');
      const rows = await db
        .select({
          id: message.id,
          body: message.body,
          channelId: message.channelId,
          parentId: message.parentId,
          userId: message.userId,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
          author: user.name,
          channelName: channel.name,
          replyCount: sql<number>`(select count(*) from message reply where reply.parent_id = ${message.id})`,
          saved: exists(
            db
              .select()
              .from(bookmark)
              .where(
                and(
                  eq(bookmark.messageId, message.id),
                  eq(bookmark.userId, me),
                ),
              ),
          ),
        })
        .from(message)
        .innerJoin(user, eq(message.userId, user.id))
        .innerJoin(channel, eq(message.channelId, channel.id))
        .where(
          and(
            // Search and saved views also include replies; normal timelines contain root posts only.
            !q && !saved ? isNull(message.parentId) : undefined,
            channelId ? eq(message.channelId, channelId) : undefined,
            escaped
              ? or(
                  sql`${message.body} like ${`%${escaped}%`} escape '!'`,
                  mentionSearch
                    ? exists(
                        db
                          .select()
                          .from(messageMention)
                          .innerJoin(
                            mentionedUser,
                            eq(messageMention.userId, mentionedUser.id),
                          )
                          .where(
                            and(
                              eq(messageMention.messageId, message.id),
                              or(
                                sql`${mentionedUser.name} like ${`%${mentionSearch}%`} escape '!'`,
                                sql`${mentionedUser.email} like ${`%${mentionSearch}%`} escape '!'`,
                              ),
                            ),
                          ),
                      )
                    : undefined,
                )
              : undefined,
            saved
              ? exists(
                  db
                    .select()
                    .from(bookmark)
                    .where(
                      and(
                        eq(bookmark.messageId, message.id),
                        eq(bookmark.userId, me),
                      ),
                    ),
                )
              : undefined,
            cursor
              ? or(
                  lt(message.createdAt, cursor.createdAt),
                  and(
                    eq(message.createdAt, cursor.createdAt),
                    lt(message.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(message.createdAt), desc(message.id))
        .limit(51);
      const selected = rows.slice(0, 50);
      const mentions = await getMessageMentions(
        db,
        selected.map((row) => row.id),
      );
      const attachments = await getAttachments(
        db,
        selected.map((row) => row.id),
      );
      const reactions = selected.length
        ? await db
            .select()
            .from(reaction)
            .where(
              inArray(
                reaction.messageId,
                selected.map((row) => row.id),
              ),
            )
        : [];
      return c.json({
        messages: selected.map((row) => ({
          ...row,
          saved: Boolean(row.saved),
          mentions: mentions.filter((item) => item.messageId === row.id),
          attachments: attachments.filter((item) => item.messageId === row.id),
          reactions: reactions
            .filter((item) => item.messageId === row.id)
            .map(({ emoji, userId }) => ({ emoji, userId })),
        })),
        nextCursor: rows.length > 50 ? (selected.at(-1)?.id ?? null) : null,
      });
    },
  )
  .post(
    '/',
    zValidator(
      'json',
      bodySchema.extend({
        channelId: z.string().min(1),
        parentId: z.string().optional(),
      }),
    ),
    async (c) => {
      const input = c.req.valid('json');
      const parent = await validateMessageTarget(c.var.db, input);
      const mentionIds = await resolveMentions(c.var.db, input.body);
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      const [created] = await c.var.db.batch([
        c.var.db
          .insert(message)
          .values({ ...input, id, userId: c.var.user.id, createdAt })
          .returning(),
        ...messageEventWrites(c.var.db, {
          messageId: id,
          actorId: c.var.user.id,
          mentionIds,
          parentAuthorId: parent?.userId,
          createdAt,
        }),
      ]);
      return c.json({ message: created[0] }, 201);
    },
  )
  .patch(
    '/:id',
    zValidator(
      'json',
      z.object({ body: z.string().trim().max(MESSAGE_LIMIT) }),
    ),
    async (c) => {
      const [target] = await c.var.db
        .select()
        .from(message)
        .where(
          and(
            eq(message.id, c.req.param('id')),
            eq(message.userId, c.var.user.id),
          ),
        );
      if (!target)
        throw new HTTPException(404, {
          message: '自分の投稿のみ編集できます。',
        });
      if (
        !c.req.valid('json').body &&
        !(await getAttachments(c.var.db, [target.id])).length
      )
        throw new HTTPException(400, { message: '本文を入力してください。' });
      const body = c.req.valid('json').body;
      const mentionIds = await resolveMentions(c.var.db, body);
      const now = Date.now();
      const [changed] = await c.var.db.batch([
        c.var.db
          .update(message)
          .set({ body, updatedAt: now })
          .where(
            and(eq(message.id, target.id), eq(message.userId, c.var.user.id)),
          )
          .returning(),
        c.var.db
          .delete(messageMention)
          .where(eq(messageMention.messageId, target.id)),
        c.var.db
          .delete(notification)
          .where(
            and(
              eq(notification.messageId, target.id),
              eq(notification.kind, 'mention'),
              mentionIds.length
                ? sql`${notification.userId} not in (select value from json_each(${JSON.stringify(mentionIds)}))`
                : undefined,
            ),
          ),
        ...messageEventWrites(c.var.db, {
          messageId: target.id,
          actorId: c.var.user.id,
          mentionIds,
          createdAt: now,
        }),
      ]);
      if (!changed.length)
        throw new HTTPException(404, {
          message: '自分の投稿のみ編集できます。',
        });
      return c.json({ ok: true });
    },
  )
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const [target] = await c.var.db
      .select()
      .from(message)
      .where(and(eq(message.id, id), eq(message.userId, c.var.user.id)));
    if (!target)
      throw new HTTPException(404, { message: '自分の投稿のみ削除できます。' });
    // Enqueue keys and delete posts in one D1 batch, including concurrent replies.
    const [, deleted] = await c.var.db.batch([
      c.var.db
        .insert(fileCleanup)
        .select(
          c.var.db
            .select({ objectKey: attachment.objectKey })
            .from(attachment)
            .innerJoin(message, eq(attachment.messageId, message.id))
            .where(or(eq(message.id, id), eq(message.parentId, id))),
        )
        .onConflictDoNothing(),
      c.var.db
        .delete(message)
        .where(and(eq(message.id, id), eq(message.userId, c.var.user.id)))
        .returning(),
    ]);
    if (!deleted.length)
      throw new HTTPException(404, { message: '自分の投稿のみ削除できます。' });
    const { env } = getCloudflareContext();
    await cleanupUploads(c.var.db, env.UPLOADS).catch((error) =>
      console.error('R2 cleanup will retry', error),
    );
    return c.json({ ok: true });
  })
  .put(
    '/:id/reaction',
    zValidator(
      'json',
      z.object({ emoji: z.enum(REACTIONS), active: z.boolean() }),
    ),
    async (c) => {
      const { emoji, active } = c.req.valid('json');
      const messageId = c.req.param('id');
      const [target] = await c.var.db
        .select()
        .from(message)
        .where(eq(message.id, messageId));
      if (!target)
        throw new HTTPException(404, { message: '投稿が見つかりません。' });
      if (active)
        await c.var.db.batch([
          c.var.db
            .insert(reaction)
            .values({ messageId, userId: c.var.user.id, emoji })
            .onConflictDoNothing(),
          ...(target.userId !== c.var.user.id
            ? [
                c.var.db
                  .insert(notification)
                  .values(
                    notificationRecord({
                      userId: target.userId,
                      actorId: c.var.user.id,
                      messageId,
                      kind: 'reaction',
                      emoji,
                      createdAt: Date.now(),
                    }),
                  )
                  .onConflictDoNothing(),
              ]
            : []),
        ]);
      else
        await c.var.db.batch([
          c.var.db
            .delete(reaction)
            .where(
              and(
                eq(reaction.messageId, messageId),
                eq(reaction.userId, c.var.user.id),
                eq(reaction.emoji, emoji),
              ),
            ),
          c.var.db
            .delete(notification)
            .where(
              and(
                eq(notification.messageId, messageId),
                eq(notification.userId, target.userId),
                eq(notification.actorId, c.var.user.id),
                eq(notification.kind, 'reaction'),
                eq(notification.emoji, emoji),
              ),
            ),
        ]);
      return c.json({ ok: true });
    },
  )
  .put(
    '/:id/bookmark',
    zValidator('json', z.object({ active: z.boolean() })),
    async (c) => {
      const messageId = c.req.param('id');
      const [target] = await c.var.db
        .select()
        .from(message)
        .where(eq(message.id, messageId));
      if (!target)
        throw new HTTPException(404, { message: '投稿が見つかりません。' });
      if (c.req.valid('json').active)
        await c.var.db
          .insert(bookmark)
          .values({ messageId, userId: c.var.user.id })
          .onConflictDoNothing();
      else
        await c.var.db
          .delete(bookmark)
          .where(
            and(
              eq(bookmark.messageId, messageId),
              eq(bookmark.userId, c.var.user.id),
            ),
          );
      return c.json({ ok: true });
    },
  );
