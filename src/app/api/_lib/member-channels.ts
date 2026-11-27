import { and, eq, sql } from 'drizzle-orm';
import { publishChange } from '@/app/api/_lib/realtime';
import type { getDB } from '@/lib/db';
import { channelPath } from '@/lib/navigation';
import { channel, message, user } from '@/lib/schema';

export const ensureMemberChannels = async (
  db: ReturnType<typeof getDB>,
  member: { id: string; name: string; email: string },
) => {
  const [status] = await db
    .select({ announced: user.joinAnnounced })
    .from(user)
    .where(eq(user.id, member.id));
  if (!status) return;
  const now = Date.now();
  const slug =
    member.email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 30) || 'member';
  const personal = {
    id: `times-${member.id}`,
    description: `${member.name} の times チャンネル`,
    ownerId: member.id,
    createdAt: now,
    hiddenByDefault: !status.announced,
  };
  const [knownChannel] = await db
    .select({ id: channel.id })
    .from(channel)
    .where(eq(channel.ownerId, member.id));
  if (knownChannel && status.announced) return;
  const [generalCreated, personalCreated] = await db.batch([
    db
      .insert(channel)
      .values({
        id: 'general',
        name: 'general',
        description: '全員が利用する共有チャンネル',
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: channel.id }),
    db
      .insert(channel)
      .values({ ...personal, name: `times-${slug}` })
      .onConflictDoNothing()
      .returning({ id: channel.id }),
  ]);
  const [ownChannel] = await db
    .select({ id: channel.id })
    .from(channel)
    .where(eq(channel.ownerId, member.id));
  if (!ownChannel) {
    await db
      .insert(channel)
      .values({
        ...personal,
        name: `times-${slug.slice(0, 21)}-${crypto.randomUUID()}`,
      })
      .onConflictDoNothing();
  }
  if (!status.announced) {
    const channelId = ownChannel?.id ?? personal.id;
    const noticeId = `member-joined-${member.id}`;
    const body = `ワークスペースに参加しました。\n[個人の times を開く](${channelPath(channelId)})`;
    const [notices] = await db.batch([
      db
        .insert(message)
        .select(
          db
            .select({
              id: sql<string>`${noticeId}`.as('id'),
              channelId: sql<string>`'general'`.as('channelId'),
              userId: user.id,
              parentId: sql`null`.as('parentId'),
              alsoPostToChannel: sql`0`.as('alsoPostToChannel'),
              body: sql<string>`${body}`.as('body'),
              createdAt: sql<number>`${now}`.as('createdAt'),
              updatedAt: sql`null`.as('updatedAt'),
            })
            .from(user)
            .where(and(eq(user.id, member.id), eq(user.joinAnnounced, false))),
        )
        .onConflictDoNothing()
        .returning({ id: message.id }),
      db
        .update(user)
        .set({ joinAnnounced: true })
        .where(eq(user.id, member.id)),
      db
        .update(channel)
        .set({ hiddenByDefault: true })
        .where(eq(channel.ownerId, member.id)),
    ]);
    if (notices.length) publishChange('workspace');
  } else if (generalCreated.length || personalCreated.length || !ownChannel) {
    publishChange('workspace');
  }
};
