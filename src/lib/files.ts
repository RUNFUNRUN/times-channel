import {
  MAX_ATTACHMENTS,
  MAX_FILE_SIZE,
  MAX_UPLOAD_TOTAL,
} from '@/lib/constants';

export const formatFileSize = (size: number) =>
  size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.max(1, Math.ceil(size / 1024))} KiB`;

export const validateFiles = (files: { size: number }[]) => {
  if (!files.length) return '添付ファイルを選択してください。';
  if (files.length > MAX_ATTACHMENTS)
    return `1投稿に添付できるファイルは${MAX_ATTACHMENTS}個までです。`;
  if (files.some((file) => file.size === 0))
    return '空のファイルは添付できません。';
  if (files.some((file) => file.size > MAX_FILE_SIZE))
    return '1ファイルの上限は10 MiBです。';
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_UPLOAD_TOTAL)
    return '添付ファイルの合計は20 MiBまでです。';
  return null;
};
