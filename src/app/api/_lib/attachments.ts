import { eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { getDB } from '@/lib/db';
import { attachment, channel, fileCleanup, message } from '@/lib/schema';

type DB = ReturnType<typeof getDB>;

export const cleanupUploads = async (db: DB, bucket: R2Bucket) => {
  const pending = await db.select().from(fileCleanup).limit(1000);
  if (!pending.length) return;
  const keys = pending.map((item) => item.objectKey);
  await bucket.delete(keys);
  await db.delete(fileCleanup).where(inArray(fileCleanup.objectKey, keys));
};

export const validateMessageTarget = async (
  db: DB,
  input: { channelId: string; parentId?: string; alsoPostToChannel?: boolean },
) => {
  if (input.alsoPostToChannel && !input.parentId)
    throw new HTTPException(400, {
      message: 'チャンネルへの同時投稿はスレッドの返信でのみ指定できます。',
    });
  const [target] = await db
    .select({ id: channel.id })
    .from(channel)
    .where(eq(channel.id, input.channelId));
  if (!target)
    throw new HTTPException(404, { message: 'チャンネルが見つかりません。' });
  const [parent] = input.parentId
    ? await db.select().from(message).where(eq(message.id, input.parentId))
    : [];
  if (input.parentId) {
    if (!parent || parent.parentId || parent.channelId !== input.channelId)
      throw new HTTPException(400, { message: '返信先が見つかりません。' });
  }
  return parent;
};

export const getAttachments = async (db: DB, messageIds: string[]) =>
  messageIds.length
    ? db
        .select({
          id: attachment.id,
          messageId: attachment.messageId,
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
        })
        .from(attachment)
        .where(inArray(attachment.messageId, messageIds))
        .orderBy(attachment.id)
    : [];

export const normalizeFileName = (name: string) =>
  name
    .replace(/[\p{Cc}/\\]/gu, '_')
    .trim()
    .slice(0, 200) || 'file';

export const fileDisposition = (name: string, inline: boolean) => {
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encoded}`;
};

// Detect raster images from bytes. HTML, SVG and other uploads are always downloads.
export const detectImageType = async (file: Blob) => {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (startsWith([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (startsWith([255, 216, 255])) return 'image/jpeg';
  const ascii = new TextDecoder('ascii').decode(bytes);
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a'))
    return 'image/gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')
    return 'image/webp';
  if (
    ascii.slice(4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(ascii.slice(8, 12))
  )
    return 'image/avif';
  return 'application/octet-stream';
};
