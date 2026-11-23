import { getCloudflareContext } from '@opennextjs/cloudflare';
import { and, asc, count, eq, exists } from 'drizzle-orm';
import { Hono } from 'hono';
import { cleanupUploads } from '@/app/api/_lib/attachments';
import { publishChange } from '@/app/api/_lib/realtime';
import type { ApiEnv } from '@/app/api/_lib/types';
import { channel, favorite, user } from '@/lib/schema';

export const workspaceRoutes = new Hono<ApiEnv>().get('/', async (c) => {
  const db = c.var.db;
  const me = c.var.user;
  const { env, ctx } = getCloudflareContext();
  ctx.waitUntil(
    cleanupUploads(db, env.UPLOADS).catch((error) =>
      console.error('R2 cleanup will retry', error),
    ),
  );
  const slug =
    me.email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 30) || 'member';
  const [generalCreated, personalCreated] = await db.batch([
    db
      .insert(channel)
      .values({
        id: 'general',
        name: 'general',
        description: '全員が利用する共有チャンネル',
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning({ id: channel.id }),
    db
      .insert(channel)
      .values({
        id: `times-${me.id}`,
        name: `times-${slug}`,
        description: `${me.name} の times チャンネル`,
        ownerId: me.id,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning({ id: channel.id }),
  ]);
  const [ownChannel] = await db
    .select({ id: channel.id })
    .from(channel)
    .where(eq(channel.ownerId, me.id));
  // Different email domains can have the same local part. Keep ordinary names short.
  if (!ownChannel) {
    await db
      .insert(channel)
      .values({
        id: `times-${me.id}`,
        name: `times-${slug.slice(0, 21)}-${crypto.randomUUID()}`,
        description: `${me.name} の times チャンネル`,
        ownerId: me.id,
        createdAt: Date.now(),
      })
      .onConflictDoNothing();
  }
  if (generalCreated.length || personalCreated.length || !ownChannel)
    publishChange('workspace');
  const channels = await db
    .select({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      ownerId: channel.ownerId,
      starred: exists(
        db
          .select()
          .from(favorite)
          .where(
            and(eq(favorite.channelId, channel.id), eq(favorite.userId, me.id)),
          ),
      ),
    })
    .from(channel)
    .orderBy(asc(channel.createdAt));
  const [members] = await db.select({ count: count() }).from(user);
  return c.json({
    user: me,
    channels: channels.map((item) => ({
      ...item,
      starred: Boolean(item.starred),
    })),
    memberCount: members.count,
  });
});
