import { eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { getAttachments } from '@/app/api/_lib/attachments';
import { getMessageMentions } from '@/app/api/_lib/message-events';
import type { getDB } from '@/lib/db';
import { channel, message, messageQuote, user } from '@/lib/schema';

type DB = ReturnType<typeof getDB>;

export const validateQuote = async (db: DB, sourceId?: string) => {
  if (!sourceId) return;
  const [source] = await db
    .select({ id: message.id })
    .from(message)
    .where(eq(message.id, sourceId));
  if (!source)
    throw new HTTPException(404, {
      message: '引用元の投稿が削除されたか、見つかりません。',
    });
};

export const quoteWrites = (db: DB, messageId: string, sourceId?: string) =>
  sourceId ? [db.insert(messageQuote).values({ messageId, sourceId })] : [];

export const getMessageQuotes = async (db: DB, messageIds: string[]) => {
  if (!messageIds.length) return [];
  const rows = await db
    .select({
      messageId: messageQuote.messageId,
      id: message.id,
      body: message.body,
      channelId: message.channelId,
      channelName: channel.name,
      author: user.name,
      authorImage: user.image,
      createdAt: message.createdAt,
    })
    .from(messageQuote)
    .leftJoin(message, eq(messageQuote.sourceId, message.id))
    .leftJoin(user, eq(message.userId, user.id))
    .leftJoin(channel, eq(message.channelId, channel.id))
    .where(
      sql`${messageQuote.messageId} in (select value from json_each(${JSON.stringify(messageIds)}))`,
    );
  const sourceIds = [
    ...new Set(rows.flatMap((row) => (row.id ? [row.id] : []))),
  ];
  const mentions = await getMessageMentions(db, sourceIds);
  const attachments = await getAttachments(db, sourceIds);
  return rows.map((row) => ({
    messageId: row.messageId,
    source:
      row.id &&
      row.author &&
      row.channelId &&
      row.channelName &&
      row.createdAt !== null
        ? {
            id: row.id,
            body: row.body ?? '',
            channelId: row.channelId,
            channelName: row.channelName,
            author: row.author,
            authorImage: row.authorImage,
            createdAt: row.createdAt,
            mentions: mentions.filter((item) => item.messageId === row.id),
            attachmentNames: attachments
              .filter((item) => item.messageId === row.id)
              .map((item) => item.name),
          }
        : null,
  }));
};
