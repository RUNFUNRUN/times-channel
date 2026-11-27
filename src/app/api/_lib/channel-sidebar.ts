import { eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { getDB } from '@/lib/db';
import { channel, sidebarPreference } from '@/lib/schema';

export const defaultSidebarVisibility = (
  item: { id: string; ownerId: string | null; hiddenByDefault: boolean },
  userId: string,
  newMember: boolean,
) =>
  item.id === 'general' ||
  item.ownerId === userId ||
  (!newMember && !item.hiddenByDefault);

export const getSidebarChannel = async (
  db: ReturnType<typeof getDB>,
  id: string,
) => {
  const [target] = await db
    .select({
      id: channel.id,
      ownerId: channel.ownerId,
      hiddenByDefault: channel.hiddenByDefault,
    })
    .from(channel)
    .where(eq(channel.id, id));
  if (!target)
    throw new HTTPException(404, { message: 'チャンネルが見つかりません。' });
  return target;
};

export const sidebarJoin = (channelId: string) => {
  const entry = { channelId, visible: true };
  // Update an existing entry in place or append it without touching other preferences.
  const slot = sql`coalesce((
    select '$[' || key || ']'
    from json_each(${sidebarPreference.channels})
    where json_extract(value, '$.channelId') = ${channelId}
  ), '$[#]')`;
  return {
    entry,
    update: sql`json_set(${sidebarPreference.channels}, ${slot}, json(${JSON.stringify(entry)}))`,
  };
};
