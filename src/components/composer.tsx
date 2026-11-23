'use client';

import {
  Eye,
  FileText,
  LoaderCircle,
  Paperclip,
  Send,
  Smile,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MarkdownPreview } from '@/components/markdown-preview';
import { MentionTextarea } from '@/components/mention-textarea';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useMessageAction } from '@/hooks/use-message-action';
import { client } from '@/lib/api-client';
import { MESSAGE_LIMIT, REACTIONS } from '@/lib/constants';
import { formatFileSize, validateFiles } from '@/lib/files';

export const Composer = ({
  channelId,
  channelName,
  userId,
  parentId,
}: {
  channelId: string;
  channelName: string;
  userId: string;
  parentId?: string;
}) => {
  const storageKey = `times:draft:${userId}:${channelId}:${parentId ?? 'root'}`;
  const [draft, setDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const action = useMessageAction();
  useEffect(() => {
    try {
      setDraft(localStorage.getItem(storageKey) ?? '');
    } catch {
      setDraft('');
    }
  }, [storageKey]);
  useEffect(() => {
    if (draft === null) return;
    try {
      if (draft) localStorage.setItem(storageKey, draft);
      else localStorage.removeItem(storageKey);
    } catch {
      /* Drafts still work when browser storage is unavailable. */
    }
  }, [draft, storageKey]);
  const send = async () => {
    if ((!draft?.trim() && !files.length) || action.isPending) return;
    setFileError('');
    try {
      await action.mutateAsync(() =>
        files.length
          ? client.api.uploads.$post({
              form: {
                body: draft?.trim() ?? '',
                channelId,
                parentId,
                files: files.map((item) => item.file),
              },
            })
          : client.api.messages.$post({
              json: { body: draft?.trim() ?? '', channelId, parentId },
            }),
      );
      setDraft('');
      setFiles([]);
      setPreview(false);
      requestAnimationFrame(() => input.current?.focus());
    } catch {
      /* The mutation error is displayed below the editor. */
    }
  };

  return (
    <div className='composer-wrap'>
      <form
        className='composer'
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {preview && <MarkdownPreview body={draft ?? ''} />}
        <div hidden={preview}>
          <MentionTextarea
            inputRef={input}
            aria-label={parentId ? 'スレッドに返信' : `#${channelName} に投稿`}
            placeholder={
              parentId
                ? 'スレッドに返信する…'
                : `# ${channelName} にメッセージを入力`
            }
            value={draft ?? ''}
            disabled={draft === null || action.isPending}
            maxLength={MESSAGE_LIMIT}
            onValueChange={setDraft}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                event.shiftKey &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                void send();
              }
            }}
            className='min-h-24 resize-none border-0 bg-transparent px-4 pt-4 text-base shadow-none focus-visible:ring-0'
          />
        </div>
        {files.length > 0 && (
          <ul
            className='flex flex-wrap gap-2 px-3 pb-3'
            aria-label='選択中の添付ファイル'
          >
            {files.map(({ id, file }) => (
              <li
                key={id}
                className='flex max-w-full items-center gap-2 rounded-lg border bg-muted/40 py-2 pl-3 pr-1'
              >
                <FileText className='size-5 shrink-0 text-primary' />
                <div className='min-w-0'>
                  <p
                    className='max-w-48 truncate text-xs font-medium'
                    title={file.name}
                  >
                    {file.name}
                  </p>
                  <p className='mt-0.5 text-[11px] text-muted-foreground'>
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  aria-label={`${file.name} の添付を取り消す`}
                  disabled={action.isPending}
                  onClick={() =>
                    setFiles((selected) =>
                      selected.filter((item) => item.id !== id),
                    )
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileInput}
          type='file'
          multiple
          className='sr-only'
          tabIndex={-1}
          aria-label='添付ファイルを選択'
          disabled={action.isPending}
          onChange={(event) => {
            const selected = [
              ...files,
              ...Array.from(event.target.files ?? []).map((file) => ({
                id: crypto.randomUUID(),
                file,
              })),
            ];
            event.target.value = '';
            const invalid = validateFiles(selected.map((item) => item.file));
            setFileError(invalid ?? '');
            if (!invalid) setFiles(selected);
          }}
        />
        <div className='flex items-center justify-between px-3 pb-2'>
          <div className='flex items-center gap-1'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              aria-label='Markdown プレビュー'
              aria-pressed={preview}
              disabled={draft === null || action.isPending}
              onClick={() => {
                setPreview((value) => !value);
                if (preview)
                  requestAnimationFrame(() => input.current?.focus());
              }}
            >
              <Eye className='size-4' />
              <span className='text-xs'>
                {preview ? '編集に戻る' : 'プレビュー'}
              </span>
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='ファイルを添付'
              title='最大5個・1ファイル10 MiB・合計20 MiB'
              disabled={draft === null || action.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip className='size-4 text-muted-foreground' />
            </Button>
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label='絵文字を挿入'
                  disabled={action.isPending}
                >
                  <Smile className='size-4 text-muted-foreground' />
                </Button>
              </PopoverTrigger>
              <PopoverContent className='flex w-auto max-w-[calc(100vw-2rem)] flex-row flex-nowrap gap-1 overflow-x-auto p-2'>
                {[...REACTIONS, '☕', '💭', '✨', '💻', '🌱', '📝'].map(
                  (emoji) => (
                    <button
                      type='button'
                      key={emoji}
                      className='shrink-0 rounded p-1.5 text-xl hover:bg-muted'
                      aria-label={`${emoji} を挿入`}
                      onClick={() => {
                        setDraft((value) =>
                          `${value ?? ''}${emoji}`.slice(0, MESSAGE_LIMIT),
                        );
                        setEmojiOpen(false);
                        input.current?.focus();
                      }}
                    >
                      {emoji}
                    </button>
                  ),
                )}
              </PopoverContent>
            </Popover>
          </div>
          <div className='flex items-center gap-3'>
            <span className='text-xs text-muted-foreground'>
              {(draft?.length ?? 0) > MESSAGE_LIMIT - 500 &&
                `${draft?.length} / ${MESSAGE_LIMIT}`}
            </span>
            <Button
              type='submit'
              disabled={
                draft === null ||
                (!draft?.trim() && !files.length) ||
                action.isPending
              }
              className='bg-primary px-3 text-primary-foreground hover:bg-primary/85'
              aria-label={parentId ? '返信を送信' : '投稿を送信'}
            >
              {action.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Send className='size-4' />
              )}
              <span className='text-sm'>
                {action.isPending && files.length ? 'アップロード中…' : '送信'}
              </span>
            </Button>
          </div>
        </div>
      </form>
      {fileError ? (
        <p role='alert' className='mt-2 text-sm text-destructive'>
          {fileError}
        </p>
      ) : action.error ? (
        <p role='alert' className='mt-2 text-sm text-destructive'>
          {action.error.message}
        </p>
      ) : (
        <p className='composer-hint'>
          <strong>Enter</strong> で改行、<strong>Shift + Enter</strong> で送信
          <span className='ml-2'>@ でメンション・Markdown 対応</span>
          {files.length > 0 && (
            <span className='ml-2'>
              添付ファイルは送信時にアップロードされます
            </span>
          )}
        </p>
      )}
    </div>
  );
};
