import { eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { getDB } from '@/lib/db';
import { getRenderedMentionIds } from '@/lib/markdown';
import { messageMention, notification, user } from '@/lib/schema';

type DB = ReturnType<typeof getDB>;
const chunks = <T>(rows: T[], size: number) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );

export const resolveMentions = async (db: DB, body: string) => {
  const ids = getRenderedMentionIds(body);
  if (!ids.length) return [];
  const members = (
    await Promise.all(
      chunks(ids, 50).map((group) =>
        db.select({ id: user.id }).from(user).where(inArray(user.id, group)),
      ),
    )
  ).flat();
  if (members.length !== ids.length)
    throw new HTTPException(400, {
      message:
        'メンション先のユーザーが見つかりません。候補から選択し直してください。',
    });
  return ids;
};

export const getMessageMentions = async (db: DB, messageIds: string[]) =>
  (
    await Promise.all(
      chunks([...new Set(messageIds)], 50).map((group) =>
        db
          .select({
            messageId: messageMention.messageId,
            userId: user.id,
            name: user.name,
          })
          .from(messageMention)
          .innerJoin(user, eq(messageMention.userId, user.id))
          .where(inArray(messageMention.messageId, group)),
      ),
    )
  ).flat();

export const notificationRecord = (input: {
  userId: string;
  actorId: string;
  messageId: string;
  kind: 'mention' | 'reply' | 'reaction';
  emoji?: string;
  createdAt: number;
}) => ({
  ...input,
  id: crypto.randomUUID(),
  eventKey: `${input.kind}:${input.messageId}:${input.userId}:${input.actorId}:${input.emoji ?? ''}`,
});

export const messageEventWrites = (
  db: DB,
  input: {
    messageId: string;
    actorId: string;
    mentionIds: string[];
    parentAuthorId?: string;
    createdAt: number;
  },
) => {
  const mentions = input.mentionIds
    .filter((id) => id !== input.actorId)
    .map((userId) =>
      notificationRecord({
        userId,
        actorId: input.actorId,
        messageId: input.messageId,
        kind: 'mention',
        createdAt: input.createdAt,
      }),
    );
  const replies =
    input.parentAuthorId &&
    input.parentAuthorId !== input.actorId &&
    !input.mentionIds.includes(input.parentAuthorId)
      ? [
          notificationRecord({
            userId: input.parentAuthorId,
            actorId: input.actorId,
            messageId: input.messageId,
            kind: 'reply',
            createdAt: input.createdAt,
          }),
        ]
      : [];
  const notifications = [...mentions, ...replies];
  return [
    ...chunks(input.mentionIds, 40).map((group) =>
      db.insert(messageMention).values(
        group.map((userId) => ({
          messageId: input.messageId,
          userId,
        })),
      ),
    ),
    // Keep each statement small enough for D1's bound-parameter limit.
    ...chunks(notifications, 10).map((group) =>
      db.insert(notification).values(group).onConflictDoNothing(),
    ),
  ];
};
