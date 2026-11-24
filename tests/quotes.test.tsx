import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuoteCard } from '../src/components/quote-card';
import type { Message } from '../src/lib/api-client';

test('quote cards link to the exact source reply, escape content, and remove deleted content', () => {
  const quote: NonNullable<Message['quote']> = {
    messageId: 'quote-post',
    source: {
      id: 'source-reply',
      body: '<script>alert(1)</script> <@user-1>',
      channelId: 'channel-1',
      channelName: 'times-test',
      author: '<b>Alice</b>',
      authorImage: null,
      createdAt: 1234567890,
      mentions: [{ messageId: 'source-reply', userId: 'user-1', name: 'Bob' }],
      attachmentNames: ['memo.txt'],
    },
  };
  const html = renderToStaticMarkup(<QuoteCard quote={quote} />);
  expect(html).toContain('href="/messages/source-reply"');
  expect(html).toContain('@Bob');
  expect(html).toContain('memo.txt');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<b>Alice</b>');
  const removed = renderToStaticMarkup(
    <QuoteCard quote={{ messageId: quote.messageId, source: null }} />,
  );
  expect(removed).toContain('引用元の投稿は削除されました。');
  expect(removed).not.toContain('source-reply');
  expect(removed).not.toContain('Bob');
});
