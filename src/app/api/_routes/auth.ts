import { zValidator } from '@hono/zod-validator';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { ensureMemberChannels } from '@/app/api/_lib/member-channels';
import { findMemberInvite } from '@/app/api/_lib/member-invites';
import { disconnectSession } from '@/app/api/_lib/realtime';
import type { ApiEnv } from '@/app/api/_lib/types';
import { getAuth } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { memberInvite } from '@/lib/schema';

const invalidInvite = () =>
  new HTTPException(404, {
    message: '招待リンクが無効か、期限切れです。',
  });

export const authRoutes = new Hono<ApiEnv>()
  .get(
    '/invitations/:token',
    zValidator('param', z.object({ token: z.uuid() })),
    async (c) => {
      const { env } = getCloudflareContext();
      c.header('Cache-Control', 'private, no-store');
      const invite = await findMemberInvite(
        getDB(env.DB),
        c.req.valid('param').token,
      );
      if (!invite) throw invalidInvite();
      return c.json({ email: invite.email });
    },
  )
  .on(['GET', 'POST'], '/*', async (c) => {
    const { env } = getCloudflareContext();
    const auth = getAuth(env, new URL(c.req.url).origin);
    const db = getDB(env.DB);
    const signingUp =
      c.req.method === 'POST' && c.req.path === '/api/auth/sign-up/email';
    const signingOut =
      c.req.method === 'POST' && c.req.path === '/api/auth/sign-out';
    const token = c.req.header('x-times-invite');
    if (signingUp && token !== undefined) {
      if (!z.uuid().safeParse(token).success) throw invalidInvite();
      const invite = await findMemberInvite(db, token);
      const body = await c.req.raw
        .clone()
        .json()
        .catch(() => null);
      const email = z.object({ email: z.string() }).safeParse(body);
      if (
        !invite ||
        !email.success ||
        email.data.email.trim().toLowerCase() !== invite.email
      )
        throw invalidInvite();
    }
    const session = signingOut
      ? await auth.api.getSession({ headers: c.req.raw.headers })
      : null;
    const response = await auth.handler(c.req.raw);
    if (response.ok && session) disconnectSession(session.session.id);
    if (response.ok && signingUp) {
      const { user } = (await response.clone().json()) as {
        user: { id: string; name: string; email: string };
      };
      await Promise.all([
        ensureMemberChannels(db, user),
        db.delete(memberInvite).where(eq(memberInvite.email, user.email)),
      ]).catch((error) =>
        console.error('Workspace setup will retry on entry', error),
      );
    }
    return response;
  });
