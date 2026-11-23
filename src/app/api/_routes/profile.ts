import { zValidator } from '@hono/zod-validator';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { cleanupUploads, detectImageType } from '@/app/api/_lib/attachments';
import type { ApiEnv } from '@/app/api/_lib/types';
import { AVATAR_MAX_SIZE, avatarObjectKey } from '@/lib/profile';
import { fileCleanup, user } from '@/lib/schema';

const fields = {
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
};

export const profileRoutes = new Hono<ApiEnv>()
  .get('/', async (c) => {
    const [profile] = await c.var.db
      .select(fields)
      .from(user)
      .where(eq(user.id, c.var.user.id));
    return c.json({ user: profile });
  })
  .patch(
    '/',
    bodyLimit({
      maxSize: AVATAR_MAX_SIZE + 64 * 1024,
      onError: (c) => c.json({ error: 'アイコンは2 MiBまでです。' }, 413),
    }),
    zValidator(
      'form',
      z.object({
        name: z.string().trim().min(1).max(40),
        avatar: z.instanceof(File).optional(),
        removeAvatar: z.literal('true').optional(),
      }),
    ),
    async (c) => {
      const { name, avatar, removeAvatar } = c.req.valid('form');
      if (avatar && removeAvatar)
        throw new HTTPException(400, {
          message: '画像の変更と削除は同時に指定できません。',
        });
      if (avatar && (!avatar.size || avatar.size > AVATAR_MAX_SIZE))
        throw new HTTPException(400, {
          message: 'アイコンは空でない2 MiB以下の画像を選択してください。',
        });
      const contentType = avatar ? await detectImageType(avatar) : null;
      if (avatar && !contentType?.startsWith('image/'))
        throw new HTTPException(400, {
          message: 'PNG・JPEG・GIF・WebP・AVIF の画像を選択してください。',
        });
      const db = c.var.db;
      const [previous] = await db
        .select(fields)
        .from(user)
        .where(eq(user.id, c.var.user.id));
      if (!previous)
        throw new HTTPException(404, {
          message: 'プロフィールが見つかりません。',
        });
      const id = crypto.randomUUID();
      const newKey = avatar ? `avatars/${id}` : null;
      const image = avatar
        ? `/api/profile/avatar/${id}`
        : removeAvatar
          ? null
          : previous.image;
      const oldKey =
        image !== previous.image ? avatarObjectKey(previous.image) : null;
      const { env, ctx } = getCloudflareContext();
      try {
        if (avatar && newKey && contentType)
          await env.UPLOADS.put(newKey, avatar, {
            httpMetadata: { contentType },
          });
        const [changed] = await db.batch([
          db
            .update(user)
            .set({ name, image, updatedAt: new Date() })
            .where(
              and(
                eq(user.id, c.var.user.id),
                previous.image
                  ? eq(user.image, previous.image)
                  : isNull(user.image),
              ),
            )
            .returning(fields),
          ...(oldKey
            ? [
                db
                  .insert(fileCleanup)
                  .select(
                    db
                      .select({
                        objectKey: sql<string>`${oldKey}`.as('object_key'),
                      })
                      .from(user)
                      .where(
                        and(
                          eq(user.id, c.var.user.id),
                          image ? eq(user.image, image) : isNull(user.image),
                        ),
                      ),
                  )
                  .onConflictDoNothing(),
              ]
            : []),
        ]);
        if (!changed.length)
          throw new HTTPException(409, {
            message:
              '別の画面でプロフィールが変更されました。開き直してお試しください。',
          });
        ctx.waitUntil(
          cleanupUploads(db, env.UPLOADS).catch((error) =>
            console.error('Avatar cleanup will retry', error),
          ),
        );
        return c.json({ user: changed[0] });
      } catch (error) {
        if (newKey) {
          await env.UPLOADS.delete(newKey).catch(async () => {
            await db
              .insert(fileCleanup)
              .values({ objectKey: newKey })
              .onConflictDoNothing();
          });
        }
        throw error;
      }
    },
  )
  .get(
    '/avatar/:id',
    zValidator('param', z.object({ id: z.uuid() })),
    async (c) => {
      const image = `/api/profile/avatar/${c.req.valid('param').id}`;
      const [owner] = await c.var.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.image, image));
      if (!owner)
        throw new HTTPException(404, { message: 'アイコンが見つかりません。' });
      const { env } = getCloudflareContext();
      const object = await env.UPLOADS.get(
        `avatars/${c.req.valid('param').id}`,
      );
      if (!object)
        throw new HTTPException(404, { message: 'アイコンが見つかりません。' });
      return new Response(object.body, {
        headers: {
          'Content-Type':
            object.httpMetadata?.contentType ?? 'application/octet-stream',
          'Content-Length': String(object.size),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    },
  );
