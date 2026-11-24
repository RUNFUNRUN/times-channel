import { expect, test } from 'bun:test';
import {
  channelPath,
  messagePath,
  threadPath,
  viewPath,
} from '../src/lib/navigation';

test('URLs preserve search queries and exact reply targets without accepting external destinations', () => {
  const query = '日本語 & #<@someone> + ?';
  const search = new URL(
    viewPath({ kind: 'search', q: query }),
    'http://localhost',
  );
  expect(search.pathname).toBe('/search');
  expect(search.searchParams.get('q')).toBe(query);
  const thread = new URL(
    threadPath(search.pathname, search.search, 'reply-id'),
    search.origin,
  );
  expect(thread.searchParams.get('q')).toBe(query);
  expect(thread.searchParams.get('thread')).toBe('reply-id');
  expect(threadPath(thread.pathname, thread.search)).toBe(
    viewPath({ kind: 'search', q: query }),
  );
  expect(channelPath('../a?b#c')).toBe('/channels/..%2Fa%3Fb%23c');
  expect(messagePath('https://example.com')).toBe(
    '/messages/https%3A%2F%2Fexample.com',
  );
  expect(viewPath({ kind: 'notifications' })).toBe('/notifications');
  expect(viewPath({ kind: 'saved' })).toBe('/saved');
});
