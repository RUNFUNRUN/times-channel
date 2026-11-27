import { zValidator } from '@hono/zod-validator';
import { and, eq, ne, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { isChannelTimelinePost } from '@/app/api/_lib/channel-timeline';
import type { ApiEnv } from '@/app/api/_lib/types';
import {
  channel,
  channelRead,
  favorite,
  message,
  sidebarPreference,
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
    const [target] = await db
      .select({ id: channel.id })
      .from(channel)
      .where(eq(channel.id, channelId));
    if (!target)
      throw new HTTPException(404, { message: 'チャンネルが見つかりません。' });
    const entry = { channelId, visible: true };
    // Update an existing entry in place or append it without touching other preferences.
    const slot = sql`coalesce((
      select '$[' || key || ']'
      from json_each(${sidebarPreference.channels})
      where json_extract(value, '$.channelId') = ${channelId}
    ), '$[#]')`;
    await db
      .insert(sidebarPreference)
      .values({ userId: c.var.user.id, channels: [entry] })
      .onConflictDoUpdate({
        target: sidebarPreference.userId,
        set: {
          channels: sql`json_set(${sidebarPreference.channels}, ${slot}, json(${JSON.stringify(entry)}))`,
        },
      });
    return c.json({ ok: true });
  })
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
