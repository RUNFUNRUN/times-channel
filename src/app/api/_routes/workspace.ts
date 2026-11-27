import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  and,
  asc,
  count,
  eq,
  exists,
  gte,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { cleanupUploads } from '@/app/api/_lib/attachments';
import { defaultSidebarVisibility } from '@/app/api/_lib/channel-sidebar';
import { isChannelTimelinePost } from '@/app/api/_lib/channel-timeline';
import { ensureMemberChannels } from '@/app/api/_lib/member-channels';
import type { ApiEnv } from '@/app/api/_lib/types';
import {
  channel,
  channelRead,
  favorite,
  message,
  sidebarPreference,
  user,
} from '@/lib/schema';

export const workspaceRoutes = new Hono<ApiEnv>().get('/', async (c) => {
  const db = c.var.db;
  const me = c.var.user;
  const { env, ctx } = getCloudflareContext();
  ctx.waitUntil(
    cleanupUploads(db, env.UPLOADS).catch((error) =>
      console.error('R2 cleanup will retry', error),
    ),
  );
  await ensureMemberChannels(db, me);
  const [preference] = await db
    .select()
    .from(sidebarPreference)
    .where(eq(sidebarPreference.userId, me.id));
  const order = new Map(
    preference?.channels.map((item, index) => [
      item.channelId,
      { ...item, index },
    ]),
  );
  const channels = await db
    .select({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      ownerId: channel.ownerId,
      hiddenByDefault: channel.hiddenByDefault,
      unread: exists(
        db
          .select({ id: message.id })
          .from(message)
          .where(
            and(
              eq(message.channelId, channel.id),
              ne(message.userId, me.id),
              isChannelTimelinePost(),
              gte(
                message.createdAt,
                sql<number>`max(${channel.unreadSince}, ${me.createdAt.getTime()}, coalesce(${channelRead.lastReadAt}, 0))`,
              ),
              or(
                isNull(channelRead.lastReadAt),
                sql`(${message.createdAt}, ${message.id}) > (${channelRead.lastReadAt}, ${channelRead.lastReadId})`,
              ),
            ),
          ),
      ),
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
    .leftJoin(
      channelRead,
      and(eq(channelRead.channelId, channel.id), eq(channelRead.userId, me.id)),
    )
    .orderBy(asc(channel.createdAt));
  // Personal channels created for new members carry the onboarding flag.
  const newMember = channels.some(
    (item) => item.ownerId === me.id && item.hiddenByDefault,
  );
  const [members] = await db
    .select({ count: count() })
    .from(user)
    .where(eq(user.disabled, false));
  return c.json({
    user: me,
    channels: channels
      .sort((a, b) => {
        const aOrder = order.get(a.id)?.index ?? Infinity;
        const bOrder = order.get(b.id)?.index ?? Infinity;
        if (aOrder !== bOrder) return aOrder - bOrder;
        if (a.ownerId && b.ownerId)
          return (
            Number(b.ownerId === me.id) - Number(a.ownerId === me.id) ||
            a.name.localeCompare(b.name)
          );
        return Number(Boolean(a.ownerId)) - Number(Boolean(b.ownerId));
      })
      .map(({ hiddenByDefault, ...item }) => ({
        ...item,
        sidebarVisible:
          order.get(item.id)?.visible ??
          defaultSidebarVisibility(
            { ...item, hiddenByDefault },
            me.id,
            newMember,
          ),
        starred: Boolean(item.starred),
        unread: Boolean(item.unread),
      })),
    memberCount: members.count,
  });
});
