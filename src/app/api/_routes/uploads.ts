import { zValidator } from '@hono/zod-validator';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  detectImageType,
  fileDisposition,
  normalizeFileName,
  validateMessageTarget,
} from '@/app/api/_lib/attachments';
import {
  messageEventWrites,
  resolveMentions,
} from '@/app/api/_lib/message-events';
import { quoteWrites, validateQuote } from '@/app/api/_lib/quotes';
import type { ApiEnv } from '@/app/api/_lib/types';
import {
  MAX_ATTACHMENTS,
  MAX_UPLOAD_TOTAL,
  MESSAGE_LIMIT,
} from '@/lib/constants';
import { validateFiles } from '@/lib/files';
import { attachment, fileCleanup, message } from '@/lib/schema';

export const uploadsRoutes = new Hono<ApiEnv>()
  .post(
    '/',
    bodyLimit({
      maxSize: MAX_UPLOAD_TOTAL + 64 * 1024,
      onError: (c) =>
        c.json({ error: '添付ファイルの合計は20 MiBまでです。' }, 413),
    }),
    zValidator(
      'form',
      z.object({
        channelId: z.string().min(1),
        parentId: z.string().optional(),
        alsoPostToChannel: z
          .enum(['true', 'false'])
          .transform((value) => value === 'true')
          .optional(),
        quoteId: z.string().min(1).max(128).optional(),
        body: z.string().trim().max(MESSAGE_LIMIT).default(''),
        files: z
          .union([z.instanceof(File), z.array(z.instanceof(File))])
          .transform((files) => (Array.isArray(files) ? files : [files]))
          .pipe(z.array(z.instanceof(File)).min(1).max(MAX_ATTACHMENTS)),
      }),
    ),
    async (c) => {
      const { files, quoteId, ...input } = c.req.valid('form');
      await validateQuote(c.var.db, quoteId);
      const invalid = validateFiles(files);
      if (invalid) throw new HTTPException(400, { message: invalid });
      const parent = await validateMessageTarget(c.var.db, input);
      const mentionIds = await resolveMentions(c.var.db, input.body);
      const { env } = getCloudflareContext();
      const messageId = crypto.randomUUID();
      const createdAt = Date.now();
      const attachments = await Promise.all(
        files.map(async (file) => {
          const id = crypto.randomUUID();
          return {
            id,
            messageId,
            objectKey: `attachments/${messageId}/${id}`,
            name: normalizeFileName(file.name),
            size: file.size,
            contentType: await detectImageType(file),
          };
        }),
      );
      try {
        // Upload only when sending the message, so abandoned drafts create no R2 objects.
        for (const [index, item] of attachments.entries()) {
          await env.UPLOADS.put(item.objectKey, files[index], {
            httpMetadata: { contentType: item.contentType },
            customMetadata: { messageId },
          });
        }
        const [created] = await c.var.db.batch([
          c.var.db
            .insert(message)
            .values({
              ...input,
              id: messageId,
              userId: c.var.user.id,
              createdAt,
            })
            .returning(),
          c.var.db.insert(attachment).values(attachments),
          ...quoteWrites(c.var.db, messageId, quoteId),
          ...messageEventWrites(c.var.db, {
            messageId,
            actorId: c.var.user.id,
            mentionIds,
            parentAuthorId: parent?.userId,
            createdAt,
          }),
        ]);
        return c.json({ message: created[0] }, 201);
      } catch (error) {
        await env.UPLOADS.delete(
          attachments.map((item) => item.objectKey),
        ).catch(async (cleanupError) => {
          console.error('R2 upload rollback will retry', cleanupError);
          await c.var.db
            .insert(fileCleanup)
            .values(attachments.map(({ objectKey }) => ({ objectKey })))
            .onConflictDoNothing();
        });
        throw error;
      }
    },
  )
  .get('/:id', async (c) => {
    const [file] = await c.var.db
      .select()
      .from(attachment)
      .where(eq(attachment.id, c.req.param('id')));
    if (!file)
      throw new HTTPException(404, {
        message: 'ファイルが削除されたか、見つかりません。',
      });
    const { env } = getCloudflareContext();
    const object = await env.UPLOADS.get(file.objectKey);
    if (!object)
      throw new HTTPException(404, { message: 'ファイルが見つかりません。' });
    const inline =
      file.contentType.startsWith('image/') && c.req.query('download') !== '1';
    return new Response(object.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(object.size),
        'Content-Disposition': fileDisposition(file.name, inline),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  });
