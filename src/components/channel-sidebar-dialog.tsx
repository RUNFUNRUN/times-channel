'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Hash } from 'lucide-react';
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
import { type Channel, client, readResponse } from '@/lib/api-client';

export const ChannelSidebarDialog = ({
  channels,
  onOpenChange,
}: {
  channels: Channel[];
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [items, setItems] = useState(channels);
  const save = useMutation({
    mutationFn: async () =>
      readResponse(
        await client.api.channels.sidebar.$put({
          json: {
            channels: items.map(({ id, sidebarVisible }) => ({
              channelId: id,
              visible: sidebarVisible,
            })),
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
      onOpenChange(false);
    },
  });
  const move = (id: string, neighborId: string) =>
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const neighbor = current.findIndex((item) => item.id === neighborId);
      const updated = [...current];
      [updated[index], updated[neighbor]] = [updated[neighbor], updated[index]];
      return updated;
    });
  const groups = [
    { title: 'チャンネル', rows: items.filter((item) => !item.ownerId) },
    { title: 'みんなの times', rows: items.filter((item) => item.ownerId) },
  ];
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>チャンネルの表示設定</DialogTitle>
          <DialogDescription>
            自分のサイドバーに表示するチャンネルと順番を変更できます。
          </DialogDescription>
        </DialogHeader>
        <form
          className='min-w-0 space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending) save.mutate();
          }}
        >
          {groups.map(
            ({ title, rows }) =>
              rows.length > 0 && (
                <section key={title}>
                  <h3 className='mb-2 text-sm font-semibold'>{title}</h3>
                  <ul className='divide-y rounded-lg border'>
                    {rows.map((item, index) => (
                      <li
                        key={item.id}
                        className='flex items-center gap-1 px-2'
                      >
                        <label className='flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-3 text-sm'>
                          <input
                            type='checkbox'
                            checked={item.sidebarVisible}
                            disabled={save.isPending}
                            className='size-4 shrink-0 accent-primary'
                            onChange={(event) => {
                              const sidebarVisible = event.target.checked;
                              setItems((current) =>
                                current.map((value) =>
                                  value.id === item.id
                                    ? { ...value, sidebarVisible }
                                    : value,
                                ),
                              );
                            }}
                          />
                          <Hash
                            className='size-3.5 shrink-0 text-muted-foreground'
                            aria-hidden='true'
                          />
                          <span className='wrap-anywhere'>{item.name}</span>
                        </label>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-lg'
                          aria-label={`${item.name} を上へ`}
                          disabled={save.isPending || index === 0}
                          onClick={() => move(item.id, rows[index - 1].id)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-lg'
                          aria-label={`${item.name} を下へ`}
                          disabled={save.isPending || index === rows.length - 1}
                          onClick={() => move(item.id, rows[index + 1].id)}
                        >
                          <ArrowDown />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
          {save.error && (
            <p role='alert' className='text-sm text-destructive'>
              {save.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type='submit' disabled={save.isPending}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
