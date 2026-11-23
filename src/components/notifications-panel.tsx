'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  AtSign,
  Bell,
  Check,
  CheckCheck,
  Circle,
  LoaderCircle,
  MessageSquare,
  Smile,
} from 'lucide-react';
import { useState } from 'react';
import { UserAvatar } from '@/components/message-item';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtimeInterval } from '@/hooks/use-realtime';
import {
  type ApiResponse,
  client,
  type NotificationItem,
  type NotificationPage,
  readResponse,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';

export const NotificationsPanel = ({
  unreadCount,
  onOpen,
}: {
  unreadCount: number;
  onOpen: (item: NotificationItem) => void;
}) => {
  const refetchInterval = useRealtimeInterval();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const queryClient = useQueryClient();
  const notifications = useInfiniteQuery({
    queryKey: ['notifications', 'list', unreadOnly],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      readResponse<NotificationPage>(
        await client.api.notifications.$get({
          query: { unread: unreadOnly ? 'true' : undefined, before: pageParam },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval,
  });
  const action = useMutation({
    mutationFn: async (request: () => Promise<ApiResponse>) =>
      readResponse(await request()),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const rows =
    notifications.data?.pages.flatMap((page) => page.notifications) ?? [];
  return (
    <section aria-label='通知一覧' className='flex min-h-0 flex-1 flex-col'>
      <div className='flex flex-wrap items-center gap-2 border-b px-5 py-3'>
        <Button
          variant={unreadOnly ? 'ghost' : 'secondary'}
          aria-pressed={!unreadOnly}
          onClick={() => setUnreadOnly(false)}
        >
          すべて
        </Button>
        <Button
          variant={unreadOnly ? 'secondary' : 'ghost'}
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly(true)}
        >
          未読
        </Button>
        <Button
          className='ml-auto'
          variant='ghost'
          disabled={!unreadCount || action.isPending}
          onClick={() =>
            action.mutate(() => client.api.notifications['read-all'].$put())
          }
        >
          <CheckCheck />
          すべて既読にする
        </Button>
      </div>
      {action.error && (
        <p
          role='alert'
          className='border-b bg-destructive/5 px-5 py-3 text-sm text-destructive'
        >
          {action.error.message}
        </p>
      )}
      <div className='min-h-0 flex-1 overflow-y-auto'>
        {notifications.isPending && (
          <div className='space-y-5 p-6'>
            {['first', 'second', 'third'].map((key) => (
              <Skeleton key={key} className='h-24 w-full' />
            ))}
          </div>
        )}
        {notifications.error && (
          <div role='alert' className='m-5 rounded-lg border p-4'>
            <p className='text-sm text-destructive'>
              {notifications.error.message}
            </p>
            <Button
              variant='outline'
              className='mt-3'
              onClick={() => {
                void notifications.refetch();
              }}
            >
              再読み込み
            </Button>
          </div>
        )}
        {!notifications.isPending && !notifications.error && !rows.length && (
          <div className='empty-state'>
            <Bell className='mb-4 size-7 text-muted-foreground' />
            <h3>
              {unreadOnly ? '未読の通知はありません' : '通知はありません'}
            </h3>
            <p>メンション、投稿への返信、リアクションがここに表示されます。</p>
          </div>
        )}
        {rows.map((item) => {
          const Icon =
            item.kind === 'mention'
              ? AtSign
              : item.kind === 'reply'
                ? MessageSquare
                : Smile;
          const label =
            item.kind === 'mention'
              ? 'あなたにメンションしました'
              : item.kind === 'reply'
                ? 'あなたの投稿に返信しました'
                : `あなたの投稿に ${item.emoji} でリアクションしました`;
          return (
            <article
              key={item.id}
              aria-label={`${item.actorName} の通知`}
              className={cn(
                'flex items-start border-b transition-colors hover:bg-muted/40',
                !item.readAt && 'bg-brand-soft/40',
              )}
            >
              <button
                type='button'
                className='flex min-w-0 flex-1 items-start gap-3 p-5 text-left'
                disabled={action.isPending}
                onClick={async () => {
                  try {
                    await action.mutateAsync(() =>
                      client.api.notifications[':id'].read.$put({
                        param: { id: item.id },
                        json: { read: true },
                      }),
                    );
                    onOpen(item);
                  } catch {
                    /* The error is displayed above the list. */
                  }
                }}
              >
                <div className='relative shrink-0'>
                  <UserAvatar name={item.actorName} />
                  <span className='absolute -right-1 -bottom-1 rounded-full bg-background p-1 text-primary ring-1 ring-border'>
                    <Icon className='size-3' />
                  </span>
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='text-sm leading-6'>
                    <strong>{item.actorName}</strong> が{label}
                  </p>
                  <p className='mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground'>
                    {item.body || '添付ファイル'}
                  </p>
                  <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                    <span className='max-w-full truncate'>
                      # {item.channelName}
                    </span>
                    <time dateTime={new Date(item.createdAt).toISOString()}>
                      {new Date(item.createdAt).toLocaleString('ja-JP', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    {!item.readAt && (
                      <span className='font-medium text-primary'>未読</span>
                    )}
                  </div>
                </div>
              </button>
              <Button
                className='mr-3 mt-4 shrink-0'
                variant='ghost'
                size='icon'
                title={item.readAt ? '未読に戻す' : '既読にする'}
                aria-label={item.readAt ? '未読に戻す' : '既読にする'}
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(() =>
                    client.api.notifications[':id'].read.$put({
                      param: { id: item.id },
                      json: { read: !item.readAt },
                    }),
                  )
                }
              >
                {item.readAt ? (
                  <Circle className='text-muted-foreground' />
                ) : (
                  <Check className='text-primary' />
                )}
              </Button>
            </article>
          );
        })}
        {notifications.hasNextPage && (
          <div className='flex justify-center p-5'>
            <Button
              variant='outline'
              disabled={notifications.isFetchingNextPage}
              onClick={() => {
                void notifications.fetchNextPage();
              }}
            >
              {notifications.isFetchingNextPage && (
                <LoaderCircle className='animate-spin' />
              )}
              さらに読み込む
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};
