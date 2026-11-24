'use client';

import { FileText, Quote } from 'lucide-react';
import Link from 'next/link';
import { UserAvatar } from '@/components/user-avatar';
import type { Message } from '@/lib/api-client';
import { displayMentions } from '@/lib/mentions';
import { messagePath } from '@/lib/navigation';

export const QuoteCard = ({
  quote,
}: {
  quote: NonNullable<Message['quote']>;
}) => {
  const source = quote.source;
  if (!source)
    return (
      <div className='my-2 rounded-lg border border-l-4 p-3 text-sm text-muted-foreground'>
        <Quote className='mr-2 inline size-4' />
        引用元の投稿は削除されました。
      </div>
    );
  return (
    <Link
      href={messagePath(source.id)}
      className='my-2 block min-w-0 rounded-lg border border-l-4 border-l-primary/50 bg-muted/20 p-3 transition-colors hover:bg-muted/50'
      aria-label={`${source.author} の引用元を開く`}
    >
      <div className='mb-1 flex min-w-0 items-center gap-2 text-xs'>
        <UserAvatar
          name={source.author}
          image={source.authorImage}
          className='size-5 shrink-0'
        />
        <span className='truncate font-semibold'>{source.author}</span>
        <Quote className='ml-auto size-3 shrink-0 text-muted-foreground' />
      </div>
      <p className='line-clamp-4 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]'>
        {displayMentions(
          source.body,
          source.mentions.map((member) => ({
            id: member.userId,
            name: member.name,
          })),
        ).text ||
          (source.attachmentNames.length ? '添付ファイル' : '引用された投稿')}
      </p>
      {source.attachmentNames.length > 0 && (
        <p className='mt-1 truncate text-xs text-muted-foreground'>
          <FileText className='mr-1 inline size-3' />
          {source.attachmentNames.join('、')}
        </p>
      )}
      <p className='mt-2 truncate text-xs text-muted-foreground'>
        # {source.channelName} ·{' '}
        {new Date(source.createdAt).toLocaleString('ja-JP')}
      </p>
    </Link>
  );
};
