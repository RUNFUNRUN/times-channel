import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, exists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { inviteTokenHash } from '@/app/api/_lib/member-invites';
import { disconnectMember } from '@/app/api/_lib/realtime';
import type { ApiEnv } from '@/app/api/_lib/types';
import { memberInvite, session, user } from '@/lib/schema';

const memberFields = {
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
};

export const membersRoutes = new Hono<ApiEnv>()
  .get('/', async (c) =>
    c.json({
      members: await c.var.db
        .select(memberFields)
        .from(user)
        .where(eq(user.disabled, false))
        .orderBy(asc(user.name), asc(user.email)),
    }),
  )
  .get('/directory', async (c) =>
    c.json({
      members: await c.var.db
        .select({ ...memberFields, disabled: user.disabled })
        .from(user)
        .orderBy(asc(user.disabled), asc(user.name), asc(user.email)),
    }),
  )
  .post(
    '/invitations',
    zValidator(
      'json',
      z.object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((email) => email.toLowerCase()),
      }),
    ),
    async (c) => {
      const { email } = c.req.valid('json');
      const db = c.var.db;
      const [member] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email));
      if (member)
        throw new HTTPException(409, {
          message: 'このメールアドレスのアカウントは登録済みです。',
        });
      const token = crypto.randomUUID();
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const tokenHash = await inviteTokenHash(token);
      await db
        .insert(memberInvite)
        .values({ email, tokenHash, expiresAt })
        .onConflictDoUpdate({
          target: memberInvite.email,
          set: { tokenHash, expiresAt },
        });
      return c.json({ token, expiresAt }, 201);
    },
  )
  .put(
    '/:id/status',
    zValidator('json', z.object({ disabled: z.boolean() })),
    async (c) => {
      const id = c.req.param('id');
      if (id === c.var.user.id)
        throw new HTTPException(400, {
          message: '自分の利用を停止することはできません。',
        });
      const db = c.var.db;
      const { disabled } = c.req.valid('json');
      const actor = alias(user, 'actor');
      const actorIsActive = exists(
        db
          .select({ id: actor.id })
          .from(actor)
          .where(and(eq(actor.id, c.var.user.id), eq(actor.disabled, false))),
      );
      const update = db
        .update(user)
        .set({ disabled })
        .where(and(eq(user.id, id), actorIsActive))
        .returning({ id: user.id });
      const [changed] = disabled
        ? await db.batch([
            update,
            db
              .delete(session)
              .where(and(eq(session.userId, id), actorIsActive)),
          ])
        : [await update];
      if (!changed.length)
        throw new HTTPException(404, {
          message: 'メンバーを更新できませんでした。',
        });
      if (disabled) disconnectMember(id);
      return c.json({ ok: true });
    },
  );
