'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Bell,
  Bookmark,
  ChevronDown,
  Hash,
  Home,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppearanceDialog } from '@/components/appearance-dialog';
import { AuthScreen } from '@/components/auth-screen';
import { ChannelSidebarDialog } from '@/components/channel-sidebar-dialog';
import { Composer } from '@/components/composer';
import { EditChannelDialog } from '@/components/edit-channel-dialog';
import { MemberDirectoryDialog } from '@/components/member-directory-dialog';
import { MessageItem } from '@/components/message-item';
import { NotificationsPanel } from '@/components/notifications-panel';
import { ProfileDialog } from '@/components/profile-dialog';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/user-avatar';
import {
  RealtimeContext,
  useRealtime,
  useRealtimeInterval,
} from '@/hooks/use-realtime';
import {
  type Channel,
  client,
  type MessagePage,
  type NotificationItem,
  readResponse,
  type Thread,
  type Workspace,
} from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { channelPath, threadPath, type View, viewPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const dayLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

const ErrorState = ({ error, retry }: { error: Error; retry: () => void }) => (
  <div
    className='m-6 rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm'
    role='alert'
  >
    <p className='text-destructive'>{error.message}</p>
    <Button variant='outline' className='mt-3' onClick={retry}>
      再読み込み
    </Button>
  </div>
);
const Loading = () => (
  <div className='flex h-dvh items-center justify-center gap-3 bg-background text-primary'>
    <Hash className='size-7' />
    <span className='text-xl font-bold'>times</span>
    <LoaderCircle className='ml-3 size-4 animate-spin' />
    <span className='sr-only'>読み込み中</span>
  </div>
);

export const TimesApp = ({ children }: { children: ReactNode }) => {
  const session = authClient.useSession();
  const queryClient = useQueryClient();
  const activeSession = session.data?.user.disabled ? null : session.data;
  useEffect(() => {
    if (!activeSession && !session.isPending) queryClient.clear();
  }, [activeSession, session.isPending, queryClient]);
  if (session.isPending) return <Loading />;
  if (session.error)
    return (
      <main className='mx-auto max-w-lg py-20'>
        <ErrorState
          error={
            new Error(
              'ログイン状態を確認できませんでした。接続を確認してください。',
            )
          }
          retry={() => {
            void session.refetch();
          }}
        />
      </main>
    );
  return activeSession ? (
    <>
      <WorkspaceApp key={activeSession.user.id} />
      {children}
    </>
  ) : (
    <AuthScreen />
  );
};

const WorkspaceApp = () => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ channelId?: string; messageId?: string }>();
  const searchParams = useSearchParams();
  const view: View = params.channelId
    ? { kind: 'channel', id: params.channelId }
    : params.messageId
      ? { kind: 'message', id: params.messageId }
      : pathname === '/notifications'
        ? { kind: 'notifications' }
        : pathname === '/saved'
          ? { kind: 'saved' }
          : pathname === '/search'
            ? {
                kind: 'search',
                q: (searchParams.get('q') ?? '').trim().slice(0, 200),
              }
            : { kind: 'all' };
  const threadId = view.kind === 'message' ? null : searchParams.get('thread');
  const closeThread = useCallback(() => {
    router.push(threadPath(pathname, searchParams.toString()), {
      scroll: false,
    });
  }, [router, pathname, searchParams]);
  const connected = useRealtime();
  const queryClient = useQueryClient();
  const workspace = useQuery({
    queryKey: ['workspace'],
    queryFn: async () =>
      readResponse<Workspace>(await client.api.workspace.$get()),
    refetchInterval: connected ? 60000 : 30000,
  });
  const notifications = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () =>
      readResponse<{ unreadCount: number }>(
        await client.api.notifications['unread-count'].$get(),
      ),
    refetchInterval: connected ? 60000 : 10000,
  });
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [starPending, setStarPending] = useState(false);
  const [signoutPending, setSignoutPending] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const changeView = useCallback(
    (next: View) => {
      router.push(viewPath(next), { scroll: false });
      setSidebarOpen(false);
      setEditOpen(false);
    },
    [router],
  );
  useEffect(() => {
    setSearch(pathname === '/search' ? (searchParams.get('q') ?? '') : '');
    setSidebarOpen(false);
    setEditOpen(false);
  }, [pathname, searchParams]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === 'Escape' && threadId && !event.defaultPrevented)
        closeThread();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [threadId, closeThread]);

  const data = workspace.data;
  if (!data)
    return workspace.error ? (
      <main>
        <ErrorState
          error={workspace.error}
          retry={() => {
            void workspace.refetch();
          }}
        />
      </main>
    ) : (
      <Loading />
    );
  const currentChannel =
    view.kind === 'channel'
      ? data.channels.find((item) => item.id === view.id)
      : undefined;
  const ownChannel = data.channels.find(
    (item) => item.ownerId === data.user.id,
  );
  const openChannel = (id: string) => changeView({ kind: 'channel', id });
  const openThread = (id: string) => {
    router.push(threadPath(pathname, searchParams.toString(), id), {
      scroll: false,
    });
  };
  const openNotification = (item: NotificationItem) => {
    router.push(threadPath(channelPath(item.channelId), '', item.messageId), {
      scroll: false,
    });
    setSidebarOpen(false);
  };
  const title =
    currentChannel?.name ??
    (view.kind === 'message'
      ? '投稿'
      : view.kind === 'notifications'
        ? '通知'
        : view.kind === 'saved'
          ? '後で読む'
          : view.kind === 'search'
            ? `「${view.q}」の検索結果`
            : view.kind === 'channel'
              ? 'チャンネルが見つかりません'
              : 'みんなのタイムライン');
  const favoriteChannel = async () => {
    if (!currentChannel || starPending) return;
    setStarPending(true);
    setActionError('');
    try {
      await readResponse(
        await client.api.channels[':id'].favorite.$put({
          param: { id: currentChannel.id },
          json: { active: !currentChannel.starred },
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : '保存できませんでした。',
      );
    } finally {
      setStarPending(false);
    }
  };

  const channelButton = (item: Channel) => (
    <Link
      href={channelPath(item.id)}
      key={item.id}
      title={item.name}
      className={cn(
        'channel-link',
        currentChannel?.id === item.id && 'active',
        item.unread && 'unread',
      )}
      onClick={() => setSidebarOpen(false)}
    >
      <Hash className='size-4 shrink-0 opacity-60' />
      <span className='truncate'>{item.name}</span>
      {item.unread && <span className='sr-only'>未読</span>}
      {item.ownerId === data.user.id && (
        <span className='ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/65'>
          自分
        </span>
      )}
    </Link>
  );
  const visibleChannels = data.channels.filter((item) => item.sidebarVisible);
  const starredChannels = visibleChannels.filter((item) => item.starred);
  const personalChannels = visibleChannels.filter((item) => item.ownerId);
  const openChannelSettings = () => {
    setSidebarOpen(false);
    setChannelSettingsOpen(true);
  };
  const _sidebar = (
    <div className='sidebar-inner'>
      <div className='workspace-heading'>
        <div className='mb-1 text-[10px] font-semibold tracking-[0.18em] text-white/45'>
          YOUR WORKSPACE
        </div>
        <div className='flex items-center justify-between'>
          <h1 className='text-lg font-bold tracking-tight'>みんなの times</h1>
          <MessageCircle className='size-5 text-white/55' />
        </div>
      </div>
      <div className='sidebar-scroll'>
        <nav aria-label='ワークスペース' className='space-y-1 px-3 pt-4'>
          <Link
            href='/'
            className={cn('sidebar-nav', view.kind === 'all' && 'active')}
            onClick={() => setSidebarOpen(false)}
          >
            <Home className='size-4' />
            みんなのタイムライン
          </Link>
          <Link
            href='/notifications'
            className={cn(
              'sidebar-nav',
              view.kind === 'notifications' && 'active',
            )}
            onClick={() => setSidebarOpen(false)}
          >
            <Bell className='size-4' />
            通知
            {unreadCount > 0 && (
              <span className='ml-auto rounded-full bg-primary px-2 text-xs text-primary-foreground'>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
          <Link
            href='/saved'
            className={cn('sidebar-nav', view.kind === 'saved' && 'active')}
            onClick={() => setSidebarOpen(false)}
          >
            <Bookmark className='size-4' />
            後で読む
          </Link>
        </nav>
        {starredChannels.length > 0 && (
          <section className='sidebar-section'>
            <div className='sidebar-label'>
              <Star className='size-3.5' />
              スター付き
            </div>
            {starredChannels.map(channelButton)}
          </section>
        )}
        <section className='sidebar-section'>
          <div className='sidebar-label'>
            <ChevronDown className='size-3.5' />
            チャンネル
            <Button
              size='icon-xs'
              variant='ghost'
              className='ml-auto text-white/60 hover:bg-white/10 hover:text-white'
              aria-label='チャンネルを作成'
              onClick={() => setCreateOpen(true)}
            >
              <Plus />
            </Button>
          </div>
          {visibleChannels.filter((item) => !item.ownerId).map(channelButton)}
          <button
            type='button'
            className='channel-link text-white/45!'
            onClick={openChannelSettings}
          >
            <Plus className='size-4' />
            チャンネルを追加
          </button>
        </section>
        <section className='sidebar-section'>
          <div className='sidebar-label'>
            <ChevronDown className='size-3.5' />
            みんなの times
            <Button
              size='icon-xs'
              variant='ghost'
              className='ml-auto text-white/60 hover:bg-white/10 hover:text-white'
              aria-label='チャンネルの表示設定'
              onClick={openChannelSettings}
            >
              <Settings2 />
            </Button>
          </div>
          {personalChannels.map(channelButton)}
        </section>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            className='sidebar-account'
            aria-label='アカウントメニュー'
          >
            <UserAvatar
              name={data.user.name}
              image={data.user.image}
              className='size-9'
            />
            <span className='min-w-0 flex-1 text-left'>
              <span className='block truncate text-sm font-semibold'>
                {data.user.name}
              </span>
              <span className='block text-xs text-white/45'>
                あなたのアカウント
              </span>
            </span>
            <ChevronDown className='size-4 text-white/50' />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='top' align='start' className='w-64'>
          <DropdownMenuLabel className='truncate'>
            {data.user.name}
            <span className='mt-1 block truncate text-xs font-normal text-muted-foreground'>
              {data.user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <Pencil />
            プロフィールを編集
          </DropdownMenuItem>
          {ownChannel && (
            <DropdownMenuItem onSelect={() => openChannel(ownChannel.id)}>
              <Hash />
              自分の times を開く
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={signoutPending}
            onSelect={async () => {
              setSignoutPending(true);
              try {
                const result = await authClient.signOut();
                if (result.error)
                  throw new Error('ログアウトできませんでした。');
                queryClient.clear();
              } catch {
                setActionError(
                  'ログアウトできませんでした。もう一度お試しください。',
                );
              } finally {
                setSignoutPending(false);
              }
            }}
          >
            <LogOut />
            ログアウト
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <RealtimeContext value={connected}>
      <div className='app-shell'>
        <header className='topbar'>
          <div className='topbar-brand'>
            <Hash className='size-5' />
            <span className='font-bold tracking-tight'>
              times<span className='text-[#c3e8b6]'>.</span>
            </span>
          </div>
          <form
            className='global-search'
            onSubmit={(event) => {
              event.preventDefault();
              if (search.trim())
                changeView({ kind: 'search', q: search.trim() });
            }}
          >
            <Search className='size-4 shrink-0 opacity-65' />
            <input
              ref={searchInput}
              aria-label='すべての投稿を検索'
              placeholder='すべての投稿を検索'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={200}
            />
            <kbd>⌘ K</kbd>
          </form>
          <AppearanceDialog triggerClassName='ml-auto size-7 shrink-0 text-white/75 hover:bg-white/10 hover:text-white' />
        </header>
        <div className='app-body'>
          <nav className='app-rail' aria-label='アプリ'>
            <Link
              href='/'
              className={cn(
                'rail-item',
                view.kind !== 'saved' &&
                  view.kind !== 'notifications' &&
                  'active',
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <Home />
              <span>ホーム</span>
            </Link>
            <Link
              href='/notifications'
              className={cn(
                'rail-item relative',
                view.kind === 'notifications' && 'active',
              )}
              aria-label={unreadCount ? `通知 ${unreadCount}件の未読` : '通知'}
              onClick={() => setSidebarOpen(false)}
            >
              <Bell />
              <span>通知</span>
              {unreadCount > 0 && (
                <span className='absolute -right-2 -top-1 rounded-full bg-primary px-1.5 font-semibold text-primary-foreground'>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <Link
              href='/saved'
              className={cn('rail-item', view.kind === 'saved' && 'active')}
              onClick={() => setSidebarOpen(false)}
            >
              <Bookmark />
              <span>後で読む</span>
            </Link>
          </nav>
          <aside className='desktop-sidebar' aria-label='チャンネル一覧'>
            {_sidebar}
          </aside>
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side='left'
              className='w-[290px] border-0 bg-shell-sidebar p-0 text-white'
            >
              <SheetTitle className='sr-only'>チャンネル一覧</SheetTitle>
              <SheetDescription className='sr-only'>
                表示するチャンネルを選択します。
              </SheetDescription>
              {_sidebar}
            </SheetContent>
          </Sheet>
          <main className='workspace-main'>
            <header className='channel-header'>
              <Button
                variant='ghost'
                size='icon'
                aria-label='チャンネル一覧を開く'
                className='mobile-menu'
                onClick={() => setSidebarOpen(true)}
              >
                <Menu />
              </Button>
              <div className='min-w-0 flex-1'>
                <h2 className='flex items-center gap-2 truncate text-lg font-bold'>
                  {currentChannel ? (
                    <Hash className='size-5 shrink-0 text-muted-foreground' />
                  ) : view.kind === 'notifications' ? (
                    <Bell className='size-5 shrink-0 text-primary' />
                  ) : view.kind === 'saved' ? (
                    <Bookmark className='size-5 shrink-0 text-primary' />
                  ) : view.kind === 'search' ? (
                    <Search className='size-5 shrink-0 text-primary' />
                  ) : (
                    <Home className='size-5 shrink-0 text-primary' />
                  )}
                  <span className='truncate'>{title}</span>
                </h2>
                <p className='mt-1 truncate text-xs text-muted-foreground'>
                  {currentChannel
                    ? currentChannel.description
                    : view.kind === 'notifications'
                      ? 'メンション・返信・リアクション'
                      : view.kind === 'saved'
                        ? '保存した投稿は自分だけに表示されます。'
                        : view.kind === 'search'
                          ? 'すべてのチャンネルとスレッドから検索'
                          : '全チャンネルの投稿'}
                </p>
              </div>
              {currentChannel?.ownerId === data.user.id && (
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label='チャンネルを編集'
                  title='チャンネルを編集'
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className='size-4 text-muted-foreground' />
                </Button>
              )}
              {currentChannel && (
                <ShareLink
                  path={channelPath(currentChannel.id)}
                  label='チャンネルを共有'
                />
              )}
              {currentChannel && (
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={
                    currentChannel.starred ? 'スターを外す' : 'スターを付ける'
                  }
                  disabled={starPending}
                  onClick={() => {
                    void favoriteChannel();
                  }}
                >
                  <Star
                    className={cn(
                      'size-4 text-muted-foreground',
                      currentChannel.starred && 'fill-[#dca94c] text-[#dca94c]',
                    )}
                  />
                </Button>
              )}
              <Button
                variant='ghost'
                className='member-button gap-1.5'
                aria-label={`参加者一覧・${data.memberCount}人`}
                onClick={() => setMembersOpen(true)}
              >
                <Users className='size-4' />
                <span>{data.memberCount}</span>
              </Button>
            </header>
            <div className='channel-tabs'>
              <span className='channel-tab'>
                <MessageCircle className='size-3.5' />
                {view.kind === 'notifications'
                  ? '通知'
                  : view.kind === 'saved'
                    ? '保存した投稿'
                    : view.kind === 'search'
                      ? '検索結果'
                      : 'メッセージ'}
              </span>
              {currentChannel?.ownerId === data.user.id && (
                <span className='ml-auto flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <Sparkles className='size-3.5 text-primary/70' />
                  あなたの times
                </span>
              )}
            </div>
            {actionError && (
              <div
                role='alert'
                className='flex items-center justify-between border-b bg-destructive/5 px-5 py-2 text-sm text-destructive'
              >
                {actionError}
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label='エラーを閉じる'
                  onClick={() => setActionError('')}
                >
                  <X />
                </Button>
              </div>
            )}
            {view.kind === 'message' ? (
              <ThreadPanel
                key={view.id}
                id={view.id}
                focusId={view.id}
                userId={data.user.id}
                onClose={() => changeView({ kind: 'all' })}
                onChannel={openChannel}
                fullPage
              />
            ) : view.kind === 'channel' && !currentChannel ? (
              <ErrorState
                error={new Error('チャンネルが削除されたか、見つかりません。')}
                retry={() => {
                  void workspace.refetch();
                }}
              />
            ) : view.kind === 'notifications' ? (
              <NotificationsPanel
                unreadCount={unreadCount}
                onOpen={openNotification}
              />
            ) : (
              <Timeline
                key={JSON.stringify(view)}
                view={view}
                user={data.user}
                trackRead={
                  Boolean(currentChannel?.unread) && !threadId && !sidebarOpen
                }
                onThread={openThread}
                onChannel={openChannel}
                onOwnChannel={() => {
                  if (ownChannel) openChannel(ownChannel.id);
                }}
              />
            )}
            {currentChannel && !currentChannel.sidebarVisible && (
              <ChannelJoinBar
                key={`join-${currentChannel.id}`}
                channelId={currentChannel.id}
              />
            )}
            {currentChannel ? (
              <Composer
                key={currentChannel.id}
                channelId={currentChannel.id}
                channelName={currentChannel.name}
                userId={data.user.id}
              />
            ) : view.kind === 'all' && ownChannel ? (
              <div className='feed-footer'>
                <Button
                  variant='outline'
                  className='ml-auto h-9'
                  onClick={() => openChannel(ownChannel.id)}
                >
                  <PencilIcon />
                  自分の times に書く
                </Button>
              </div>
            ) : null}
          </main>
          {threadId && (
            <ThreadPanel
              key={threadId}
              id={threadId}
              focusId={threadId}
              userId={data.user.id}
              onClose={closeThread}
              onChannel={openChannel}
            />
          )}
        </div>
        {profileOpen && (
          <ProfileDialog user={data.user} onOpenChange={setProfileOpen} />
        )}
        {channelSettingsOpen && (
          <ChannelSidebarDialog
            channels={data.channels}
            onOpenChange={setChannelSettingsOpen}
          />
        )}
        {membersOpen && (
          <MemberDirectoryDialog
            userId={data.user.id}
            channel={currentChannel}
            onOpenChange={setMembersOpen}
          />
        )}
        <CreateChannelDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={openChannel}
        />
        {currentChannel?.ownerId === data.user.id && (
          <EditChannelDialog
            key={currentChannel.id}
            channel={currentChannel}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        )}
      </div>
    </RealtimeContext>
  );
};

const PencilIcon = () => <Plus className='size-4' />;

const ChannelJoinBar = ({ channelId }: { channelId: string }) => {
  const queryClient = useQueryClient();
  const join = useMutation({
    mutationFn: async () =>
      readResponse(
        await client.api.channels[':id'].join.$put({
          param: { id: channelId },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace'] }),
  });
  return (
    <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-4 py-3'>
      <div className='min-w-0 text-sm'>
        <p className='font-medium'>このチャンネルに参加していません。</p>
        <p className='text-xs text-muted-foreground'>
          参加するとサイドバーに追加されます。
        </p>
        {join.error && (
          <p role='alert' className='mt-1 text-xs text-destructive'>
            {join.error.message}
          </p>
        )}
      </div>
      <Button size='sm' disabled={join.isPending} onClick={() => join.mutate()}>
        {join.isPending ? <LoaderCircle className='animate-spin' /> : <Plus />}
        チャンネルに参加
      </Button>
    </div>
  );
};

const Timeline = ({
  view,
  user,
  trackRead,
  onThread,
  onChannel,
  onOwnChannel,
}: {
  view: View;
  user: Workspace['user'];
  trackRead: boolean;
  onThread: (id: string) => void;
  onChannel: (id: string) => void;
  onOwnChannel: () => void;
}) => {
  const refetchInterval = useRealtimeInterval();
  const isCollection = view.kind === 'saved' || view.kind === 'search';
  const list = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const previousNewest = useRef<string | undefined>(undefined);
  const content = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  useEffect(() => {
    if (isCollection) return;
    const observer = new ResizeObserver(() => {
      if (list.current && pinnedToBottom.current)
        list.current.scrollTop = list.current.scrollHeight;
    });
    if (list.current) observer.observe(list.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [isCollection]);
  const [newMessages, setNewMessages] = useState(false);
  const messages = useInfiniteQuery({
    queryKey: ['messages', view],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      readResponse<MessagePage>(
        await client.api.messages.$get({
          query: {
            channelId: view.kind === 'channel' ? view.id : undefined,
            q: view.kind === 'search' ? view.q : undefined,
            saved: view.kind === 'saved' ? 'true' : undefined,
            before: pageParam,
          },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval,
  });
  const rows = messages.data?.pages.flatMap((page) => page.messages) ?? [];
  const ordered = isCollection ? rows : [...rows].reverse();
  const newestId = rows[0]?.id;
  const channelId = view.kind === 'channel' ? view.id : undefined;
  const queryClient = useQueryClient();
  const lastRequestedRead = useRef<string>(undefined);
  const { mutate: markRead } = useMutation({
    mutationFn: async ({
      channelId,
      messageId,
    }: {
      channelId: string;
      messageId: string;
    }) =>
      readResponse(
        await client.api.channels[':id'].read.$put({
          param: { id: channelId },
          json: { messageId },
        }),
      ),
    retry: 1,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] });
    },
    onError: (_error, { messageId }) => {
      if (lastRequestedRead.current === messageId)
        lastRequestedRead.current = undefined;
    },
  });
  useEffect(() => {
    if (isCollection || !newestId || previousNewest.current === newestId)
      return;
    const container = list.current;
    if (container && (!previousNewest.current || pinnedToBottom.current)) {
      container.scrollTop = container.scrollHeight;
      setNewMessages(false);
    } else if (previousNewest.current) setNewMessages(true);
    previousNewest.current = newestId;
  }, [newestId, isCollection]);
  useEffect(() => {
    if (!channelId || !trackRead || !newestId || !list.current || !end.current)
      return;
    const visibility = { atEnd: false };
    const markVisible = () => {
      if (
        !visibility.atEnd ||
        document.visibilityState !== 'visible' ||
        lastRequestedRead.current === newestId
      )
        return;
      lastRequestedRead.current = newestId;
      markRead({ channelId, messageId: newestId });
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibility.atEnd = entry.isIntersecting;
        markVisible();
      },
      { root: list.current },
    );
    observer.observe(end.current);
    document.addEventListener('visibilitychange', markVisible);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', markVisible);
    };
  }, [channelId, trackRead, newestId, markRead]);
  const loadOlder = async () => {
    const container = list.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const previousTop = container?.scrollTop ?? 0;
    await messages.fetchNextPage();
    requestAnimationFrame(() => {
      if (container && !isCollection)
        container.scrollTop =
          container.scrollHeight - previousHeight + previousTop;
    });
  };
  const olderButton = messages.hasNextPage && (
    <div className='flex justify-center py-4'>
      <Button
        variant='outline'
        disabled={messages.isFetchingNextPage}
        onClick={() => {
          void loadOlder();
        }}
      >
        {messages.isFetchingNextPage && (
          <LoaderCircle className='animate-spin' />
        )}
        さらに読み込む
      </Button>
    </div>
  );
  return (
    <div className='timeline-container'>
      <div
        className='timeline'
        ref={list}
        onScroll={() => {
          const container = list.current;
          if (container) {
            pinnedToBottom.current =
              container.scrollHeight -
                container.scrollTop -
                container.clientHeight <
              80;
            if (pinnedToBottom.current) setNewMessages(false);
          }
        }}
      >
        <div ref={content} className='flow-root'>
          {messages.isPending && (
            <div className='space-y-7 px-6 py-8'>
              {['a', 'b', 'c'].map((key) => (
                <div key={key} className='flex gap-3'>
                  <Skeleton className='size-10 rounded-lg' />
                  <div className='flex-1 space-y-3'>
                    <Skeleton className='h-4 w-24' />
                    <Skeleton className='h-4 w-2/3' />
                  </div>
                </div>
              ))}
            </div>
          )}
          {messages.error && (
            <ErrorState
              error={messages.error}
              retry={() => {
                void messages.refetch();
              }}
            />
          )}
          {!isCollection && olderButton}
          {!messages.isPending && !messages.error && !rows.length && (
            <div className='empty-state'>
              <div className='empty-icon'>
                {view.kind === 'saved' ? (
                  <Bookmark />
                ) : view.kind === 'search' ? (
                  <Search />
                ) : (
                  <MessageCircle />
                )}
              </div>
              <h3>
                {view.kind === 'saved'
                  ? '保存した投稿はありません'
                  : view.kind === 'search'
                    ? '投稿が見つかりませんでした'
                    : '投稿はありません'}
              </h3>
              <p>
                {view.kind === 'saved'
                  ? '投稿のブックマークを押すと、ここに保存されます。'
                  : view.kind === 'search'
                    ? '別のキーワードで検索してみてください。'
                    : 'メッセージやファイルを送信すると、ここに表示されます。'}
              </p>
              {view.kind === 'all' && (
                <Button
                  variant='outline'
                  className='mt-5'
                  onClick={onOwnChannel}
                >
                  <Plus />
                  自分の times を開く
                </Button>
              )}
            </div>
          )}
          {ordered.map((item, index) => (
            <div key={item.id}>
              {(index === 0 ||
                dayLabel(ordered[index - 1].createdAt) !==
                  dayLabel(item.createdAt)) && (
                <div className='date-divider'>
                  <span>{dayLabel(item.createdAt)}</span>
                </div>
              )}
              <MessageItem
                item={item}
                userId={user.id}
                onThread={onThread}
                onChannel={onChannel}
                showChannel={view.kind !== 'channel'}
              />
            </div>
          ))}
          {isCollection && olderButton}
          {channelId && <div ref={end} className='h-px' aria-hidden='true' />}
        </div>
      </div>
      {newMessages && (
        <Button
          className='new-messages'
          onClick={() => {
            if (list.current)
              list.current.scrollTo({
                top: list.current.scrollHeight,
                behavior: 'smooth',
              });
            setNewMessages(false);
          }}
        >
          新しい投稿があります
          <ChevronDown />
        </Button>
      )}
    </div>
  );
};

const ThreadPanel = ({
  id,
  userId,
  focusId,
  onClose,
  onChannel,
  fullPage = false,
}: {
  id: string;
  userId: string;
  focusId?: string;
  fullPage?: boolean;
  onClose: () => void;
  onChannel: (id: string) => void;
}) => {
  const refetchInterval = useRealtimeInterval();
  const thread = useQuery({
    queryKey: ['thread', id],
    queryFn: async () =>
      readResponse<Thread>(
        await client.api.messages[':id'].thread.$get({ param: { id } }),
      ),
    refetchInterval,
    retry: false,
  });
  const parent = thread.data?.messages.find(
    (item) => item.id === thread.data?.parentId,
  );
  const replies =
    thread.data?.messages.filter((item) => item.id !== thread.data?.parentId) ??
    [];
  const end = useRef<HTMLDivElement>(null);
  const threadList = useRef<HTMLDivElement>(null);
  const focused = useRef<string | undefined>(undefined);
  const parentId = parent?.id;
  const lastReplyAuthor = replies.at(-1)?.userId;
  useEffect(() => {
    if (!parentId) return;
    if (focusId && focused.current !== focusId) {
      const target = threadList.current?.querySelector(
        `[data-message-id="${CSS.escape(focusId)}"]`,
      );
      if (target) {
        target.scrollIntoView({ block: 'center' });
        focused.current = focusId;
        return;
      }
    }
    if (replies.length && (!focusId || lastReplyAuthor === userId))
      end.current?.scrollIntoView({ block: 'nearest' });
  }, [replies.length, parentId, focusId, lastReplyAuthor, userId]);
  return (
    <aside
      className={cn('thread-panel', fullPage && 'thread-page')}
      aria-label='スレッド'
    >
      <header className='thread-header'>
        <h2 className='text-lg font-bold'>スレッド</h2>
        <Button
          variant='ghost'
          size='icon'
          aria-label='スレッドを閉じる'
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div ref={threadList} className='min-h-0 flex-1 overflow-y-auto py-3'>
        {thread.isPending && (
          <div className='flex justify-center p-8'>
            <LoaderCircle className='size-5 animate-spin text-muted-foreground' />
          </div>
        )}
        {thread.error && (
          <ErrorState
            error={thread.error}
            retry={() => {
              void thread.refetch();
            }}
          />
        )}
        {parent && (
          <MessageItem
            item={parent}
            highlighted={parent.id === focusId}
            userId={userId}
            onThread={() => {}}
            onChannel={onChannel}
            inThread
            showChannel
          />
        )}
        {parent && (
          <div className='mx-5 my-4 flex items-center gap-3 text-xs text-muted-foreground'>
            <span>{replies.length} 件の返信</span>
            <span className='h-px flex-1 bg-border' />
          </div>
        )}
        {replies.map((item) => (
          <MessageItem
            key={item.id}
            item={item}
            highlighted={item.id === focusId}
            userId={userId}
            onThread={() => {}}
            onChannel={onChannel}
            inThread
          />
        ))}
        {parent && !replies.length && (
          <p className='px-6 py-8 text-center text-sm leading-6 text-muted-foreground'>
            返信はありません。
          </p>
        )}
        <div ref={end} />
      </div>
      {parent && (
        <Composer
          key={parent.id}
          channelId={parent.channelId}
          channelName={parent.channelName}
          parentId={parent.id}
          userId={userId}
        />
      )}
    </aside>
  );
};

const CreateChannelDialog = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        setError('');
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <div className='mb-2 flex size-11 items-center justify-center rounded-xl bg-brand-soft text-primary'>
            <Hash />
          </div>
          <DialogTitle>チャンネルを作成</DialogTitle>
          <DialogDescription>
            作成したチャンネルは全員が閲覧・投稿できます。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError('');
            const form = new FormData(event.currentTarget);
            try {
              const result = await readResponse<{ channel: Channel }>(
                await client.api.channels.$post({
                  json: {
                    name: String(form.get('name')).trim(),
                    description: String(form.get('description')).trim(),
                  },
                }),
              );
              await queryClient.invalidateQueries({ queryKey: ['workspace'] });
              onOpenChange(false);
              onCreated(result.channel.id);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : '作成できませんでした。',
              );
            } finally {
              setPending(false);
            }
          }}
          className='space-y-5'
        >
          <div className='space-y-2'>
            <label htmlFor='channel-name' className='text-sm font-medium'>
              チャンネル名
            </label>
            <Input
              id='channel-name'
              name='name'
              placeholder='例: random、book-club'
              required
              pattern='[a-z0-9][a-z0-9_-]*'
              maxLength={64}
              disabled={pending}
              className='h-10'
            />
            <p className='text-xs text-muted-foreground'>
              半角小文字・数字・ハイフン・アンダースコア、64文字まで。
            </p>
          </div>
          <div className='space-y-2'>
            <label
              htmlFor='channel-description'
              className='text-sm font-medium'
            >
              説明{' '}
              <span className='font-normal text-muted-foreground'>
                （任意）
              </span>
            </label>
            <Textarea
              id='channel-description'
              name='description'
              placeholder='どんなことを話すチャンネルですか？'
              maxLength={200}
              disabled={pending}
            />
          </div>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type='submit' disabled={pending}>
              {pending && <LoaderCircle className='animate-spin' />}
              チャンネルを作成
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
