'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Composer } from '@/components/composer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  client,
  type Message,
  readResponse,
  type Workspace,
} from '@/lib/api-client';

import { channelPath } from '@/lib/navigation';

export const QuoteDialog = ({
  item,
  userId,
  onOpenChange,
}: {
  item: Message;
  userId: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const router = useRouter();
  const workspace = useQuery({
    queryKey: ['workspace'],
    queryFn: async () =>
      readResponse<Workspace>(await client.api.workspace.$get()),
  });
  const [selectedId, setSelectedId] = useState<string>();
  const channels = workspace.data?.channels ?? [];
  const target =
    channels.find((channel) => channel.id === selectedId) ??
    channels.find((channel) => channel.ownerId === userId) ??
    channels.find((channel) => channel.id === item.channelId);
  const quote = {
    messageId: '',
    source: {
      ...item,
      attachmentNames: item.attachments.map((file) => file.name),
    },
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>投稿を引用</DialogTitle>
          <DialogDescription>
            投稿先を選択し、コメントを添えて送信できます。
          </DialogDescription>
        </DialogHeader>
        <label htmlFor='quote-channel' className='text-sm font-medium'>
          投稿先
        </label>
        <select
          id='quote-channel'
          className='h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm'
          value={target?.id ?? ''}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={!channels.length}
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              # {channel.name}
            </option>
          ))}
        </select>
        {workspace.error && (
          <p role='alert' className='text-sm text-destructive'>
            {workspace.error.message}
          </p>
        )}
        {target && (
          <Composer
            key={target.id}
            channelId={target.id}
            channelName={target.name}
            userId={userId}
            quote={quote}
            onSent={() => {
              onOpenChange(false);
              router.push(channelPath(target.id), { scroll: false });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
