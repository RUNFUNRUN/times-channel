'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { type Channel, client, readResponse } from '@/lib/api-client';

export const EditChannelDialog = ({
  channel,
  open,
  onOpenChange,
}: {
  channel: Channel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
          <DialogTitle>チャンネルを編集</DialogTitle>
          <DialogDescription>
            自分の times チャンネルの名前と説明を変更します。
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-5'
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError('');
            const form = new FormData(event.currentTarget);
            try {
              await readResponse(
                await client.api.channels[':id'].$patch({
                  param: { id: channel.id },
                  json: {
                    name: String(form.get('name')).trim(),
                    description: String(form.get('description')).trim(),
                  },
                }),
              );
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['workspace'] }),
                queryClient.invalidateQueries({ queryKey: ['messages'] }),
                queryClient.invalidateQueries({ queryKey: ['thread'] }),
              ]);
              onOpenChange(false);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : '変更できませんでした。',
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <div className='space-y-2'>
            <label htmlFor='edit-channel-name' className='text-sm font-medium'>
              チャンネル名
            </label>
            <Input
              id='edit-channel-name'
              name='name'
              defaultValue={channel.name}
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
              htmlFor='edit-channel-description'
              className='text-sm font-medium'
            >
              説明
            </label>
            <Textarea
              id='edit-channel-description'
              name='description'
              defaultValue={channel.description}
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
              {pending && <LoaderCircle className='animate-spin' />}変更を保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
