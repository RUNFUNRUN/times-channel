'use client';

import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/user-avatar';
import { useRealtimeInterval } from '@/hooks/use-realtime';
import { client, type Members, readResponse } from '@/lib/api-client';
import {
  displayMentions,
  editMentionText,
  findMentionQuery,
  insertMention,
} from '@/lib/mentions';
import { cn } from '@/lib/utils';

type Props = Omit<
  React.ComponentProps<typeof Textarea>,
  'value' | 'onChange' | 'ref'
> & {
  value: string;
  onValueChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export const MentionTextarea = ({
  value,
  onValueChange,
  inputRef,
  maxLength,
  disabled,
  onKeyDown,
  ...props
}: Props) => {
  const refetchInterval = useRealtimeInterval(30000);
  const members = useQuery({
    queryKey: ['members'],
    queryFn: async () => readResponse<Members>(await client.api.members.$get()),
    staleTime: 30000,
    refetchInterval,
  });
  const input = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const [caret, setCaret] = useState(-1);
  const [composing, setComposing] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const [error, setError] = useState('');
  const display = displayMentions(value, members.data?.members ?? []);
  const query = findMentionQuery(display.text, caret);
  const queryKey = `${value}:${caret}`;
  const matches = (members.data?.members ?? [])
    .filter(
      (member) =>
        !query?.query ||
        `${member.name} ${member.email}`
          .toLocaleLowerCase()
          .includes(query.query.toLocaleLowerCase()),
    )
    .slice(0, 8);
  const open = Boolean(
    query &&
      !composing &&
      !disabled &&
      !members.isPending &&
      dismissed !== queryKey,
  );
  const selected = Math.min(active, Math.max(0, matches.length - 1));

  const choose = (member: Members['members'][number]) => {
    if (!query) return;
    const next = insertMention(display, query.start, query.end, member);
    if (maxLength !== undefined && next.value.length > maxLength) {
      setError('メンションを追加すると文字数の上限を超えます。');
      return;
    }
    onValueChange(next.value);
    setError('');
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setDismissed(queryKey);
      }}
    >
      <PopoverAnchor asChild>
        <Textarea
          {...props}
          ref={(node) => {
            input.current = node;
            if (inputRef) inputRef.current = node;
          }}
          value={display.text}
          maxLength={
            maxLength === undefined
              ? undefined
              : Math.max(0, maxLength - (value.length - display.text.length))
          }
          disabled={disabled || members.isPending}
          aria-autocomplete='list'
          aria-controls={open ? `${id}-list` : undefined}
          aria-activedescendant={
            open && matches.length ? `${id}-${selected}` : undefined
          }
          onChange={(event) => {
            const next = editMentionText(display, event.target.value);
            if (maxLength === undefined || next.length <= maxLength)
              onValueChange(next);
            setCaret(event.target.selectionStart);
            setActive(0);
            setError('');
          }}
          onSelect={(event) =>
            setCaret(
              event.currentTarget.selectionStart ===
                event.currentTarget.selectionEnd
                ? event.currentTarget.selectionStart
                : -1,
            )
          }
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event) => {
            setComposing(false);
            setCaret(event.currentTarget.selectionStart);
          }}
          onKeyDown={(event) => {
            if (
              !composing &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229 &&
              open
            ) {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setDismissed(queryKey);
                return;
              }
              if (
                matches.length &&
                ['ArrowDown', 'ArrowUp'].includes(event.key)
              ) {
                event.preventDefault();
                setActive(
                  (selected +
                    (event.key === 'ArrowDown' ? 1 : matches.length - 1)) %
                    matches.length,
                );
                return;
              }
              if (
                matches.length &&
                ((event.key === 'Enter' && !event.shiftKey) ||
                  (event.key === 'Tab' && !event.shiftKey))
              ) {
                event.preventDefault();
                choose(matches[selected]);
                return;
              }
            }
            onKeyDown?.(event);
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        side='top'
        align='start'
        className='w-80 max-w-[calc(100vw-2rem)] gap-0 p-1'
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div
          id={`${id}-list`}
          role='listbox'
          aria-label='メンションするユーザー'
          className='max-h-64 overflow-y-auto'
        >
          {matches.map((member, index) => (
            <button
              id={`${id}-${index}`}
              key={member.id}
              type='button'
              role='option'
              aria-selected={index === selected}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(member)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left',
                index === selected && 'bg-accent text-accent-foreground',
              )}
            >
              <UserAvatar
                name={member.name}
                image={member.image}
                className='size-8'
              />
              <span className='min-w-0'>
                <span className='block truncate text-sm font-semibold'>
                  {member.name}
                </span>
                <span className='block truncate text-xs text-muted-foreground'>
                  {member.email}
                </span>
              </span>
            </button>
          ))}
          {!matches.length && (
            <p className='px-3 py-3 text-sm text-muted-foreground'>
              {members.error
                ? 'ユーザー候補を取得できませんでした。'
                : '該当するユーザーはいません。'}
            </p>
          )}
        </div>
        {error && (
          <p role='alert' className='px-3 py-2 text-xs text-destructive'>
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};
