'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';
import { LoaderCircle, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { type Channel, client, readResponse } from '@/lib/api-client';
import { CHANNEL_MEMBER_BATCH_LIMIT } from '@/lib/constants';
import { cn } from '@/lib/utils';

type ChannelRoutes = (typeof client.api.channels)[':id'];
type Candidates = InferResponseType<
  ChannelRoutes['member-candidates']['$get'],
  200
>;
type Member = Candidates['members'][number];
type UpdatedMembers = InferResponseType<ChannelRoutes['members']['$post'], 200>;

export const ChannelMemberAdder = ({
  channel,
}: {
  channel: Pick<Channel, 'id' | 'name'>;
}) => {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Member[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const candidates = useQuery({
    queryKey: ['members', 'channel-candidates', channel.id],
    queryFn: async () =>
      readResponse<Candidates>(
        await client.api.channels[':id']['member-candidates'].$get({
          param: { id: channel.id },
        }),
      ),
  });
  const add = useMutation({
    mutationFn: async () =>
      readResponse<UpdatedMembers>(
        await client.api.channels[':id'].members.$post({
          param: { id: channel.id },
          json: { userIds: selected.map((member) => member.id) },
        }),
      ),
    onSuccess: ({ count }) => {
      setSelected([]);
      setSearch('');
      setOpen(false);
      setNotice(`${count}人を #${channel.name} に追加しました。`);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['members', 'channel-candidates', channel.id],
      });
    },
  });
  const query = search.trim().toLocaleLowerCase();
  const selectedIds = new Set(selected.map((member) => member.id));
  const matches = (candidates.data?.members ?? [])
    .filter(
      (member) =>
        !selectedIds.has(member.id) &&
        `${member.name} ${member.email}`.toLocaleLowerCase().includes(query),
    )
    .slice(0, 8);
  const full = selected.length >= CHANNEL_MEMBER_BATCH_LIMIT;
  const showSuggestions = open && !full && !add.isPending;
  const highlightedIndex = Math.min(activeIndex, matches.length - 1);
  const choose = (member: Member) => {
    if (full || selectedIds.has(member.id)) return;
    setSelected((items) => [...items, member]);
    setSearch('');
    setActiveIndex(0);
    setNotice('');
    add.reset();
    input.current?.focus();
  };
  return (
    <section
      className='space-y-3 rounded-lg border p-3'
      aria-label={`#${channel.name} にメンバーを追加`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id} className='block wrap-anywhere text-sm font-medium'>
        #{channel.name} にメンバーを追加
      </label>
      {selected.length > 0 && (
        <ul className='flex flex-wrap gap-1.5' aria-label='追加するメンバー'>
          {selected.map((member) => (
            <li
              className='flex max-w-full items-center gap-1 rounded-full bg-muted pl-2'
              key={member.id}
            >
              <span className='truncate text-sm' title={member.email}>
                {member.name}
              </span>
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label={`${member.name} を選択解除`}
                disabled={add.isPending}
                onClick={() =>
                  setSelected((items) =>
                    items.filter((item) => item.id !== member.id),
                  )
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className='flex items-center gap-2'>
        <Input
          id={id}
          ref={input}
          role='combobox'
          aria-autocomplete='list'
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? `${id}-list` : undefined}
          aria-activedescendant={
            showSuggestions && highlightedIndex >= 0
              ? `${id}-${highlightedIndex}`
              : undefined
          }
          placeholder='名前またはメールアドレスで検索'
          value={search}
          disabled={add.isPending || full}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === 'Escape' && showSuggestions) {
              event.stopPropagation();
              event.preventDefault();
              setOpen(false);
            }
            if (
              matches.length &&
              (event.key === 'ArrowDown' || event.key === 'ArrowUp')
            ) {
              event.preventDefault();
              setOpen(true);
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActiveIndex(
                open
                  ? (highlightedIndex + step + matches.length) % matches.length
                  : 0,
              );
            }
            if (
              event.key === 'Enter' &&
              showSuggestions &&
              highlightedIndex >= 0
            ) {
              event.preventDefault();
              choose(matches[highlightedIndex]);
            }
          }}
        />
        <Button
          type='button'
          disabled={!selected.length || add.isPending}
          onMouseDown={(event) => {
            if (showSuggestions) event.preventDefault();
          }}
          onClick={() => add.mutate()}
        >
          {add.isPending && <LoaderCircle className='animate-spin' />}
          {selected.length ? `${selected.length}人を追加` : 'メンバーを追加'}
        </Button>
      </div>
      {showSuggestions && (
        <div className='rounded-lg border bg-popover p-1'>
          <div
            id={`${id}-list`}
            role='listbox'
            aria-label='追加できるメンバー'
            className='max-h-56 overflow-y-auto'
          >
            {matches.map((member, index) => (
              <button
                key={member.id}
                id={`${id}-${index}`}
                type='button'
                role='option'
                aria-selected={index === highlightedIndex}
                tabIndex={-1}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent',
                  index === highlightedIndex && 'bg-accent',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(member)}
              >
                <UserAvatar
                  name={member.name}
                  image={member.image}
                  className='size-7'
                />
                <span className='min-w-0'>
                  <span className='block truncate text-sm font-medium'>
                    {member.name}
                  </span>
                  <span className='block truncate text-xs text-muted-foreground'>
                    {member.email}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {!matches.length && (
            <p role='status' className='p-2 text-sm text-muted-foreground'>
              {candidates.isPending
                ? '読み込み中…'
                : candidates.error
                  ? '候補を取得できませんでした。'
                  : '追加できるメンバーが見つかりません。'}
            </p>
          )}
        </div>
      )}
      {full && (
        <p className='text-xs text-muted-foreground'>
          一度に{CHANNEL_MEMBER_BATCH_LIMIT}人まで追加できます。
        </p>
      )}
      {add.error && (
        <p role='alert' className='text-sm text-destructive'>
          {add.error.message}
        </p>
      )}
      {notice && (
        <p role='status' className='text-sm'>
          {notice}
        </p>
      )}
    </section>
  );
};
