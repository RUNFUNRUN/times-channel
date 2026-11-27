import { expect, test } from 'bun:test';
import { parseRealtimeEvent, realtimeQueryKeys } from '../src/lib/realtime';

test('realtime protocol ignores malformed and unsupported events', () => {
  for (const input of [
    null,
    {},
    'broken',
    'null',
    '[]',
    '{}',
    '{"type":"changed","scope":"unknown"}',
    '{"type":"publish","scope":"messages"}',
  ])
    expect(parseRealtimeEvent(input)).toBeNull();
  expect(parseRealtimeEvent('{"type":"changed","scope":"messages"}')).toEqual({
    type: 'changed',
    scope: 'messages',
  });
  expect(realtimeQueryKeys('messages')).toEqual([
    'workspace',
    'messages',
    'thread',
    'notifications',
  ]);
  expect(realtimeQueryKeys()).toContain('members');
});
