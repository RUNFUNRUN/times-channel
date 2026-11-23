'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageMarkdown } from '@/components/message-markdown';
import { client, type Members, readResponse } from '@/lib/api-client';

export const MarkdownPreview = ({ body }: { body: string }) => {
  const members = useQuery({
    queryKey: ['members'],
    queryFn: async () => readResponse<Members>(await client.api.members.$get()),
    staleTime: 30000,
  });
  return (
    <section
      aria-label='Markdown プレビュー'
      className='max-h-72 min-h-24 overflow-y-auto px-4 py-3'
    >
      {body.trim() ? (
        <MessageMarkdown body={body} members={members.data?.members} />
      ) : (
        <p className='text-sm text-muted-foreground'>
          プレビューする内容がありません。
        </p>
      )}
    </section>
  );
};
