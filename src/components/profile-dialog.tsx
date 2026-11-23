'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Camera, LoaderCircle, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { client, readResponse, type Workspace } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { AVATAR_MAX_SIZE } from '@/lib/profile';
import { realtimeQueryKeys } from '@/lib/realtime';

export const ProfileDialog = ({
  user,
  onOpenChange,
}: {
  user: Workspace['user'];
  onOpenChange: (open: boolean) => void;
}) => {
  const [name, setName] = useState(user.name);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : null;
    setPreview(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!pending) onOpenChange(open);
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>プロフィールを編集</DialogTitle>
          <DialogDescription>
            表示名とアイコンはワークスペース全員に表示されます。
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-5'
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError('');
            try {
              await readResponse(
                await client.api.profile.$patch({
                  form: {
                    name: name.trim(),
                    avatar: file ?? undefined,
                    removeAvatar: removed ? 'true' : undefined,
                  },
                }),
              );
              await Promise.all(
                realtimeQueryKeys().map((key) =>
                  queryClient.invalidateQueries({ queryKey: [key] }),
                ),
              );
              await authClient.getSession({
                query: { disableCookieCache: true },
              });
              onOpenChange(false);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : '保存できませんでした。',
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <div className='flex items-center gap-4'>
            <UserAvatar
              name={name || user.name}
              image={removed ? null : (preview ?? user.image)}
              className='size-20 text-2xl'
            />
            <div className='space-y-2'>
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={pending}
                  onClick={() => input.current?.click()}
                >
                  <Camera />
                  画像を変更
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label='アイコンを削除'
                  disabled={pending || (!file && (!user.image || removed))}
                  onClick={() => {
                    setFile(null);
                    setRemoved(true);
                    setError('');
                    if (input.current) input.current.value = '';
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
              <p className='text-xs leading-5 text-muted-foreground'>
                PNG・JPEG・GIF・WebP・AVIF
                <br />2 MiBまで
              </p>
            </div>
            <input
              ref={input}
              type='file'
              accept='image/png,image/jpeg,image/gif,image/webp,image/avif'
              aria-label='プロフィール画像を選択'
              className='sr-only'
              tabIndex={-1}
              disabled={pending}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                event.target.value = '';
                if (!selected) return;
                if (!selected.size || selected.size > AVATAR_MAX_SIZE) {
                  setError(
                    'アイコンは空でない2 MiB以下の画像を選択してください。',
                  );
                  return;
                }
                if (
                  ![
                    'image/png',
                    'image/jpeg',
                    'image/gif',
                    'image/webp',
                    'image/avif',
                  ].includes(selected.type)
                ) {
                  setError(
                    'PNG・JPEG・GIF・WebP・AVIF の画像を選択してください。',
                  );
                  return;
                }
                setFile(selected);
                setRemoved(false);
                setError('');
              }}
            />
          </div>
          <div className='space-y-2'>
            <label htmlFor='profile-name' className='text-sm font-medium'>
              表示名
            </label>
            <Input
              id='profile-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete='nickname'
              required
              maxLength={40}
              disabled={pending}
            />
          </div>
          <div className='space-y-1'>
            <p className='text-sm font-medium'>メールアドレス</p>
            <p className='break-all text-sm text-muted-foreground'>
              {user.email}
            </p>
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
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type='submit' disabled={pending || !name.trim()}>
              {pending && <LoaderCircle className='animate-spin' />}保存する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
