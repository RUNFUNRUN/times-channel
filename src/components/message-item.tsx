'use client';

import {
  Bookmark,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { MentionTextarea } from '@/components/mention-textarea';
import { MessageAttachments } from '@/components/message-attachments';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMessageAction } from '@/hooks/use-message-action';
import { type ApiResponse, client, type Message } from '@/lib/api-client';
import { MESSAGE_LIMIT, REACTIONS } from '@/lib/constants';
import { displayMentions } from '@/lib/mentions';
import { cn } from '@/lib/utils';

const colors = [
  'bg-[#e1d4ec] text-[#69417e]',
  'bg-[#d4e9e2] text-[#326953]',
  'bg-[#dce5f5] text-[#425b84]',
  'bg-[#f2dccf] text-[#8c583e]',
];
export const UserAvatar = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => {
  const color =
    colors[
      Array.from(name).reduce(
        (sum, character) => sum + (character.codePointAt(0) ?? 0),
        0,
      ) % colors.length
    ];
  return (
    <Avatar className={cn('size-10 rounded-lg after:rounded-lg', className)}>
      <AvatarFallback className={cn('rounded-lg font-semibold', color)}>
        {Array.from(name.trim()).slice(0, 2).join('').toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
};

const MessageBody = ({
  body,
  mentions,
}: {
  body: string;
  mentions: Message['mentions'];
}) => {
  const display = displayMentions(
    body,
    mentions.map((member) => ({ id: member.userId, name: member.name })),
  );
  const tokens = [
    ...display.spans.map((span) => ({
      start: span.start,
      end: span.end,
      kind: 'mention' as const,
    })),
    ...Array.from(display.text.matchAll(/https?:\/\/[^\s<>]+/g))
      .filter(
        (match) =>
          !display.spans.some(
            (span) =>
              match.index < span.end &&
              match.index + match[0].length > span.start,
          ),
      )
      .map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        kind: 'link' as const,
      })),
  ].sort((left, right) => left.start - right.start);
  return (
    <div className='message-body'>
      {tokens.map((token, index) => (
        <Fragment key={token.start}>
          {display.text.slice(index ? tokens[index - 1].end : 0, token.start)}
          {token.kind === 'mention' ? (
            <span className='rounded bg-primary/10 px-1 font-medium text-primary'>
              {display.text.slice(token.start, token.end)}
            </span>
          ) : (
            <a
              href={display.text.slice(token.start, token.end)}
              target='_blank'
              rel='noopener noreferrer'
              className='text-link underline decoration-link/30 underline-offset-2 hover:decoration-current'
            >
              {display.text.slice(token.start, token.end)}
            </a>
          )}
        </Fragment>
      ))}
      {display.text.slice(tokens.at(-1)?.end ?? 0)}
    </div>
  );
};

export const MessageItem = ({
  item,
  userId,
  onThread,
  onChannel,
  showChannel = false,
  inThread = false,
  highlighted = false,
}: {
  item: Message;
  userId: string;
  onThread: (id: string) => void;
  onChannel: (id: string) => void;
  showChannel?: boolean;
  inThread?: boolean;
  highlighted?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(item.body);
  const [deleting, setDeleting] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const action = useMessageAction();
  const run = (request: () => Promise<ApiResponse>) => action.mutate(request);
  const time = new Date(item.createdAt);
  const toggleReaction = (emoji: (typeof REACTIONS)[number]) => {
    run(() =>
      client.api.messages[':id'].reaction.$put({
        param: { id: item.id },
        json: {
          emoji,
          active: !item.reactions.some(
            (reaction) =>
              reaction.emoji === emoji && reaction.userId === userId,
          ),
        },
      }),
    );
    setEmojiOpen(false);
  };
  return (
    <article
      className={cn(
        'message-item group',
        highlighted && 'bg-brand-soft ring-1 ring-inset ring-primary/25',
      )}
      data-message-id={item.id}
      aria-label={`${item.author} の投稿`}
    >
      <UserAvatar name={item.author} />
      <div className='min-w-0 flex-1'>
        {showChannel && (
          <button
            type='button'
            className='mb-1 text-xs text-muted-foreground hover:text-primary hover:underline'
            onClick={() => onChannel(item.channelId)}
          >
            # {item.channelName}
            {item.parentId && ' · スレッドの返信'}
          </button>
        )}
        <div className='flex flex-wrap items-baseline gap-x-2'>
          <span className='text-[15px] font-bold'>{item.author}</span>
          <time
            dateTime={time.toISOString()}
            title={time.toLocaleString('ja-JP')}
            className='text-xs text-muted-foreground'
          >
            {time.toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          {item.updatedAt && (
            <span className='text-xs text-muted-foreground'>編集済み</span>
          )}
        </div>
        {editing ? (
          <form
            className='mt-2 space-y-2'
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await action.mutateAsync(() =>
                  client.api.messages[':id'].$patch({
                    param: { id: item.id },
                    json: { body: editBody },
                  }),
                );
                setEditing(false);
              } catch {
                /* Displayed below. */
              }
            }}
          >
            <MentionTextarea
              aria-label='投稿を編集'
              value={editBody}
              onValueChange={setEditBody}
              maxLength={MESSAGE_LIMIT}
              className='text-base'
            />
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                type='button'
                onClick={() => setEditing(false)}
              >
                キャンセル
              </Button>
              <Button
                type='submit'
                disabled={
                  action.isPending ||
                  (!editBody.trim() && !item.attachments.length)
                }
              >
                保存する
              </Button>
            </div>
          </form>
        ) : (
          <MessageBody body={item.body} mentions={item.mentions} />
        )}
        <MessageAttachments files={item.attachments} />
        {item.reactions.length > 0 && (
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {REACTIONS.filter((emoji) =>
              item.reactions.some((reaction) => reaction.emoji === emoji),
            ).map((emoji) => {
              const selected = item.reactions.some(
                (reaction) =>
                  reaction.emoji === emoji && reaction.userId === userId,
              );
              return (
                <button
                  type='button'
                  key={emoji}
                  disabled={action.isPending}
                  aria-pressed={selected}
                  aria-label={`${emoji} ${item.reactions.filter((reaction) => reaction.emoji === emoji).length} 件`}
                  onClick={() => toggleReaction(emoji)}
                  className={cn('reaction-chip', selected && 'selected')}
                >
                  <span>{emoji}</span>
                  <span>
                    {
                      item.reactions.filter(
                        (reaction) => reaction.emoji === emoji,
                      ).length
                    }
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!inThread && item.replyCount > 0 && (
          <button
            type='button'
            className='mt-2 flex items-center gap-2 text-sm font-medium text-link hover:underline'
            onClick={() => onThread(item.id)}
          >
            <MessageSquare className='size-3.5' />
            {item.replyCount} 件の返信
            <span className='ml-1 text-xs font-normal text-muted-foreground'>
              スレッドを表示
            </span>
          </button>
        )}
        {action.error && (
          <p role='alert' className='mt-2 text-sm text-destructive'>
            {action.error.message}
          </p>
        )}
      </div>
      {!editing && (
        <div className='message-actions'>
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <Button
                size='icon-sm'
                variant='ghost'
                aria-label='リアクションを追加'
                disabled={action.isPending}
              >
                <SmilePlus />
              </Button>
            </PopoverTrigger>
            <PopoverContent className='flex w-auto max-w-[calc(100vw-2rem)] flex-row flex-nowrap gap-1 overflow-x-auto p-2'>
              {REACTIONS.map((emoji) => (
                <button
                  type='button'
                  key={emoji}
                  aria-label={`${emoji} でリアクション`}
                  disabled={action.isPending}
                  onClick={() => toggleReaction(emoji)}
                  className='shrink-0 rounded p-2 text-xl hover:bg-muted'
                >
                  {emoji}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          {!inThread && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size='icon-sm'
                  variant='ghost'
                  aria-label='スレッドで返信'
                  onClick={() => onThread(item.parentId ?? item.id)}
                >
                  <MessageSquare />
                </Button>
              </TooltipTrigger>
              <TooltipContent>スレッドで返信</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size='icon-sm'
                variant='ghost'
                disabled={action.isPending}
                aria-label={item.saved ? '保存を解除' : '後で読むに保存'}
                onClick={() =>
                  run(() =>
                    client.api.messages[':id'].bookmark.$put({
                      param: { id: item.id },
                      json: { active: !item.saved },
                    }),
                  )
                }
              >
                <Bookmark
                  className={cn(item.saved && 'fill-primary text-primary')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {item.saved ? '保存を解除' : '後で読むに保存'}
            </TooltipContent>
          </Tooltip>
          {item.userId === userId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size='icon-sm'
                  variant='ghost'
                  aria-label='投稿メニュー'
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  onSelect={() => {
                    setEditBody(item.body);
                    setEditing(true);
                  }}
                >
                  <Pencil />
                  投稿を編集
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='text-destructive'
                  onSelect={() => setDeleting(true)}
                >
                  <Trash2 />
                  投稿を削除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>投稿を削除しますか？</DialogTitle>
            <DialogDescription>
              この投稿{!item.parentId && 'とスレッドの返信'}
              が削除されます。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <p className='max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm'>
            {item.body}
            {item.attachments.length > 0 && (
              <span className='mt-2 block text-muted-foreground'>
                添付: {item.attachments.map((file) => file.name).join('、')}
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeleting(false)}>
              キャンセル
            </Button>
            <Button
              variant='destructive'
              disabled={action.isPending}
              onClick={async () => {
                try {
                  await action.mutateAsync(() =>
                    client.api.messages[':id'].$delete({
                      param: { id: item.id },
                    }),
                  );
                  setDeleting(false);
                } catch {
                  /* Displayed in the dialog. */
                }
              }}
            >
              {action.isPending && <LoaderCircle className='animate-spin' />}
              削除する
            </Button>
          </DialogFooter>
          {action.error && (
            <p role='alert' className='text-sm text-destructive'>
              {action.error.message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
};
