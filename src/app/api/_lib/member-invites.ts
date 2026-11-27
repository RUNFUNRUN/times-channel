import { and, eq, gt } from 'drizzle-orm';
import type { getDB } from '@/lib/db';
import { memberInvite } from '@/lib/schema';

export const inviteTokenHash = async (token: string) => {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};

export const findMemberInvite = async (
  db: ReturnType<typeof getDB>,
  token: string,
) => {
  const [invite] = await db
    .select()
    .from(memberInvite)
    .where(
      and(
        eq(memberInvite.tokenHash, await inviteTokenHash(token)),
        gt(memberInvite.expiresAt, Date.now()),
      ),
    );
  return invite;
};
