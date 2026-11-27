'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { Copy, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { ChannelMemberAdder } from '@/components/channel-member-adder';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { type Channel, client, readResponse } from '@/lib/api-client';

type Directory = InferResponseType<
  typeof client.api.members.directory.$get,
  200
>;
type Invitation = InferResponseType<
  typeof client.api.members.invitations.$post,
  201
>;

export const MemberDirectoryDialog = ({
  userId,
  channel,
  onOpenChange,
}: {
  userId: string;
  channel?: Pick<Channel, 'id' | 'name'>;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [addition, setAddition] = useState<'channel' | 'invite' | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [disableTarget, setDisableTarget] =
    useState<Directory['members'][number]>();
  const directory = useQuery({
    queryKey: ['members', 'directory'],
    queryFn: async () =>
      readResponse<Directory>(await client.api.members.directory.$get()),
  });
  const invite = useMutation({
    mutationFn: async (email: string) =>
      readResponse<Invitation>(
        await client.api.members.invitations.$post({ json: { email } }),
      ),
    onSuccess: ({ token }) => {
      setInviteUrl(
        new URL(
          `/?${new URLSearchParams({ invite: token })}`,
          window.location.origin,
        ).href,
      );
      setCopyStatus('');
    },
  });
  const status = useMutation({
    mutationFn: async ({ id, disabled }: { id: string; disabled: boolean }) =>
      readResponse(
        await client.api.members[':id'].status.$put({
          param: { id },
          json: { disabled },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['members'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace'] }),
      ]);
      setDisableTarget(undefined);
    },
  });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>参加者</DialogTitle>
          <DialogDescription>
            メンバーの招待と利用状況を管理できます。
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-wrap gap-2'>
          {channel && (
            <Button
              variant='outline'
              aria-expanded={addition === 'channel'}
              onClick={() =>
                setAddition((value) => (value === 'channel' ? null : 'channel'))
              }
            >
              <UserPlus /> チャンネルにメンバーを追加
            </Button>
          )}
          <Button
            variant='outline'
            aria-expanded={addition === 'invite'}
            onClick={() =>
              setAddition((value) => (value === 'invite' ? null : 'invite'))
            }
          >
            {!channel && <UserPlus />}
            {channel ? 'ワークスペースに招待' : 'メンバーを追加'}
          </Button>
        </div>
        {channel && addition === 'channel' && (
          <ChannelMemberAdder key={channel.id} channel={channel} />
        )}
        {addition === 'invite' && (
          <section className='space-y-3 rounded-lg border p-3'>
            <form
              className='space-y-2'
              onSubmit={(event) => {
                event.preventDefault();
                if (invite.isPending) return;
                setInviteUrl('');
                invite.mutate(
                  String(new FormData(event.currentTarget).get('email') ?? ''),
                );
              }}
            >
              <label htmlFor='invite-email' className='text-sm font-medium'>
                招待するメールアドレス
              </label>
              <div className='flex gap-2'>
                <Input
                  id='invite-email'
                  name='email'
                  type='email'
                  maxLength={254}
                  required
                  disabled={invite.isPending}
                />
                <Button type='submit' disabled={invite.isPending}>
                  リンクを作成
                </Button>
              </div>
            </form>
            {invite.error && (
              <p role='alert' className='text-sm text-destructive'>
                {invite.error.message}
              </p>
            )}
            {inviteUrl && (
              <div className='space-y-2'>
                <p className='text-sm text-muted-foreground'>
                  招待リンクを相手に共有してください。有効期限は7日間です。
                </p>
                <div className='flex gap-2'>
                  <Input
                    aria-label='招待リンク'
                    value={inviteUrl}
                    readOnly
                    onFocus={(event) => event.target.select()}
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    aria-label='招待リンクをコピー'
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                        setCopyStatus('コピーしました。');
                      } catch {
                        setCopyStatus('リンクを選択してコピーしてください。');
                      }
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
                {copyStatus && (
                  <p role='status' className='text-xs'>
                    {copyStatus}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
        {directory.isPending && (
          <p role='status' className='text-sm text-muted-foreground'>
            読み込み中…
          </p>
        )}
        {directory.error && (
          <p role='alert' className='text-sm text-destructive'>
            {directory.error.message}
          </p>
        )}
        {status.error && !disableTarget && (
          <p role='alert' className='text-sm text-destructive'>
            {status.error.message}
          </p>
        )}
        <ul className='divide-y'>
          {directory.data?.members.map((member) => (
            <li
              key={member.id}
              className='flex min-w-0 items-center gap-3 py-3'
            >
              <UserAvatar
                name={member.name}
                image={member.image}
                className='size-8 shrink-0'
              />
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-medium'>{member.name}</p>
                <p className='truncate text-xs text-muted-foreground'>
                  {member.email}
                </p>
              </div>
              {member.id === userId ? (
                <span className='shrink-0 text-xs text-muted-foreground'>
                  自分
                </span>
              ) : member.disabled ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={status.isPending}
                  onClick={() =>
                    status.mutate({ id: member.id, disabled: false })
                  }
                >
                  利用を再開
                </Button>
              ) : (
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={status.isPending}
                  onClick={() => {
                    status.reset();
                    setDisableTarget(member);
                  }}
                >
                  利用を停止
                </Button>
              )}
            </li>
          ))}
        </ul>
        <AlertDialog
          open={Boolean(disableTarget)}
          onOpenChange={(open) => {
            if (!open && !status.isPending) setDisableTarget(undefined);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {disableTarget?.name} さんの利用を停止しますか？
              </AlertDialogTitle>
              <AlertDialogDescription>
                このメンバーはログアウトされます。過去の投稿は残り、参加者一覧から利用を再開できます。
              </AlertDialogDescription>
            </AlertDialogHeader>
            {status.error && (
              <p role='alert' className='text-sm text-destructive'>
                {status.error.message}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={status.isPending}>
                キャンセル
              </AlertDialogCancel>
              <Button
                variant='destructive'
                disabled={status.isPending}
                onClick={() => {
                  if (disableTarget)
                    status.mutate({ id: disableTarget.id, disabled: true });
                }}
              >
                利用を停止
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};
