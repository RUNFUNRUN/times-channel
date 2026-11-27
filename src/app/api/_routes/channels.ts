import { zValidator } from '@hono/zod-validator';
import { and, asc, count, eq, ne, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  defaultSidebarVisibility,
  getSidebarChannel,
  sidebarJoin,
} from '@/app/api/_lib/channel-sidebar';
import { isChannelTimelinePost } from '@/app/api/_lib/channel-timeline';
import type { ApiEnv } from '@/app/api/_lib/types';
import { CHANNEL_MEMBER_BATCH_LIMIT } from '@/lib/constants';
import {
  channel,
  channelRead,
  favorite,
  message,
  sidebarPreference,
  user,
} from '@/lib/schema';

const channelFields = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      '半角小文字・数字・ハイフン・アンダースコアを使ってください。',
    ),
  description: z.string().trim().max(200),
};

export const channelsRoutes = new Hono<ApiEnv>()
  .post(
    '/',
    zValidator(
      'json',
      z.object({
        ...channelFields,
        description: channelFields.description.default(''),
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
  .patch(
    '/:id',
    zValidator(
      'json',
      z
        .object(channelFields)
        .partial()
        .refine(
          (input) =>
            input.name !== undefined || input.description !== undefined,
        ),
    ),
    async (c) => {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      const db = c.var.db;
      const [target] = await db
        .select()
        .from(channel)
        .where(eq(channel.id, id));
      if (!target)
        throw new HTTPException(404, {
          message: 'チャンネルが見つかりません。',
        });
      if (target.ownerId !== c.var.user.id)
        throw new HTTPException(403, {
          message: '自分の times チャンネルのみ編集できます。',
        });
      const duplicate = alias(channel, 'duplicate_channel');
      const [changed] = await db
        .update(channel)
        .set(input)
        .where(
          and(
            eq(channel.id, id),
            eq(channel.ownerId, c.var.user.id),
            input.name
              ? notExists(
                  db
                    .select({ id: duplicate.id })
                    .from(duplicate)
                    .where(
                      and(eq(duplicate.name, input.name), ne(duplicate.id, id)),
                    ),
                )
              : undefined,
          ),
        )
        .returning();
      if (!changed)
        return c.json({ error: 'そのチャンネル名は使われています。' }, 409);
      return c.json({ channel: changed });
    },
  )
  .put(
    '/sidebar',
    zValidator(
      'json',
      z.object({
        channels: z
          .array(
            z.object({
              channelId: z.string().min(1).max(128),
              visible: z.boolean(),
            }),
          )
          .max(5000)
          .refine(
            (items) =>
              new Set(items.map((item) => item.channelId)).size ===
              items.length,
          ),
      }),
    ),
    async (c) => {
      const { channels } = c.req.valid('json');
      await c.var.db
        .insert(sidebarPreference)
        .values({ userId: c.var.user.id, channels })
        .onConflictDoUpdate({
          target: sidebarPreference.userId,
          set: { channels },
        });
      return c.json({ ok: true });
    },
  )
  .put('/:id/join', async (c) => {
    const db = c.var.db;
    const channelId = c.req.param('id');
    await getSidebarChannel(db, channelId);
    const { entry, update } = sidebarJoin(channelId);
    await db
      .insert(sidebarPreference)
      .values({ userId: c.var.user.id, channels: [entry] })
      .onConflictDoUpdate({
        target: sidebarPreference.userId,
        set: { channels: update },
      });
    return c.json({ ok: true });
  })
  .get('/:id/member-candidates', async (c) => {
    const db = c.var.db;
    const target = await getSidebarChannel(db, c.req.param('id'));
    const personal = alias(channel, 'personal');
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        newMember: personal.hiddenByDefault,
        preferences: sidebarPreference.channels,
      })
      .from(user)
      .leftJoin(personal, eq(personal.ownerId, user.id))
      .leftJoin(sidebarPreference, eq(sidebarPreference.userId, user.id))
      .where(and(eq(user.disabled, false), ne(user.id, c.var.user.id)))
      .orderBy(asc(user.name), asc(user.email));
    return c.json({
      members: rows.flatMap(({ preferences, newMember, ...member }) => {
        const visible =
          preferences?.find((item) => item.channelId === target.id)?.visible ??
          defaultSidebarVisibility(target, member.id, Boolean(newMember));
        return visible ? [] : [member];
      }),
    });
  })
  .post(
    '/:id/members',
    zValidator(
      'json',
      z.object({
        userIds: z
          .array(z.string().min(1).max(128))
          .min(1)
          .max(CHANNEL_MEMBER_BATCH_LIMIT)
          .refine((ids) => new Set(ids).size === ids.length),
      }),
    ),
    async (c) => {
      const db = c.var.db;
      const channelId = c.req.param('id');
      await getSidebarChannel(db, channelId);
      const { userIds } = c.req.valid('json');
      const eligible = and(
        eq(user.disabled, false),
        ne(user.id, c.var.user.id),
        sql`${user.id} in (select value from json_each(${JSON.stringify(userIds)}))`,
      );
      const eligibleCount = db
        .select({ count: count() })
        .from(user)
        .where(eligible);
      const { entry, update } = sidebarJoin(channelId);
      // A single write keeps the entire selection unchanged if a member becomes unavailable.
      const added = await db
        .insert(sidebarPreference)
        .select(
          db
            .select({
              userId: user.id,
              channels: sql`json(${JSON.stringify([entry])})`.as('channels'),
            })
            .from(user)
            .where(and(eligible, sql`(${eligibleCount}) = ${userIds.length}`)),
        )
        .onConflictDoUpdate({
          target: sidebarPreference.userId,
          set: { channels: update },
        })
        .returning({ id: sidebarPreference.userId });
      if (!added.length)
        throw new HTTPException(409, {
          message:
            '追加できないメンバーが含まれています。候補を更新してください。',
        });
      return c.json({ count: added.length });
    },
  )
  .put(
    '/:id/read',
    zValidator('json', z.object({ messageId: z.string().min(1).max(128) })),
    async (c) => {
      const db = c.var.db;
      const channelId = c.req.param('id');
      const { messageId } = c.req.valid('json');
      const [target] = await db
        .select({ id: message.id, createdAt: message.createdAt })
        .from(message)
        .where(
          and(
            eq(message.id, messageId),
            eq(message.channelId, channelId),
            isChannelTimelinePost(),
          ),
        );
      if (!target)
        throw new HTTPException(404, {
          message: 'チャンネルの投稿が見つかりません。',
        });
      const position = { lastReadAt: target.createdAt, lastReadId: target.id };
      await db
        .insert(channelRead)
        .values({ userId: c.var.user.id, channelId, ...position })
        .onConflictDoUpdate({
          target: [channelRead.userId, channelRead.channelId],
          set: position,
          setWhere: sql`(${channelRead.lastReadAt}, ${channelRead.lastReadId}) < (${target.createdAt}, ${target.id})`,
        });
      return c.json({ ok: true });
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
