'use client';

import {
  Bookmark,
  Eye,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Quote,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { MarkdownPreview } from '@/components/markdown-preview';
import { MentionTextarea } from '@/components/mention-textarea';
import { MessageAttachments } from '@/components/message-attachments';
import { MessageMarkdown } from '@/components/message-markdown';
import { QuoteCard } from '@/components/quote-card';
import { QuoteDialog } from '@/components/quote-dialog';
import { ShareLink } from '@/components/share-link';
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
import { UserAvatar } from '@/components/user-avatar';
import { useMessageAction } from '@/hooks/use-message-action';
import { type ApiResponse, client, type Message } from '@/lib/api-client';
import { MESSAGE_LIMIT, REACTIONS } from '@/lib/constants';
import { messagePath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

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
  const [quoting, setQuoting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editPreview, setEditPreview] = useState(false);
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
      <UserAvatar name={item.author} image={item.authorImage} />
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
            {editPreview && <MarkdownPreview body={editBody} />}
            <div hidden={editPreview}>
              <MentionTextarea
                aria-label='投稿を編集'
                value={editBody}
                onValueChange={setEditBody}
                maxLength={MESSAGE_LIMIT}
                className='text-base'
              />
            </div>
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                type='button'
                variant='ghost'
                className='mr-auto'
                aria-label='Markdown プレビュー'
                aria-pressed={editPreview}
                onClick={() => setEditPreview((value) => !value)}
              >
                <Eye />
                {editPreview ? '編集に戻る' : 'プレビュー'}
              </Button>
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
                  (!editBody.trim() && !item.attachments.length && !item.quote)
                }
              >
                保存する
              </Button>
            </div>
          </form>
        ) : (
          <MessageMarkdown
            body={item.body}
            members={item.mentions.map((member) => ({
              id: member.userId,
              name: member.name,
            }))}
          />
        )}
        {item.quote && <QuoteCard quote={item.quote} />}
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
          <ShareLink path={messagePath(item.id)} label='投稿を共有' />
          <Button
            size='icon-sm'
            variant='ghost'
            aria-label='投稿を引用'
            title='投稿を引用'
            onClick={() => setQuoting(true)}
          >
            <Quote />
          </Button>
          {!inThread && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size='icon-sm'
                  variant='ghost'
                  aria-label='スレッドで返信'
                  onClick={() => onThread(item.id)}
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
                    setEditPreview(false);
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
      {quoting && (
        <QuoteDialog item={item} userId={userId} onOpenChange={setQuoting} />
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
