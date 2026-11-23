import { expect, test } from 'bun:test';
import {
  displayMentions,
  editMentionText,
  findMentionQuery,
  getMentionIds,
  insertMention,
} from '../src/lib/mentions';

const members = [
  { id: 'a', name: '田中 太郎' },
  { id: 'b', name: '田中 太郎' },
];
test('mentions retain unique identities even for duplicate display names', () => {
  expect(getMentionIds('mail@example.com <@a> <@b> <@a>')).toEqual(['a', 'b']);
  const display = displayMentions('😀 <@a> と <@b>', members);
  expect(display.text).toBe('😀 @田中 太郎 と @田中 太郎');
  expect(editMentionText(display, display.text)).toBe('😀 <@a> と <@b>');
  expect(editMentionText(display, `前 ${display.text}`)).toBe(
    '前 😀 <@a> と <@b>',
  );
  expect(editMentionText(display, `${display.text} 後`)).toBe(
    '😀 <@a> と <@b> 後',
  );
  expect(
    editMentionText(display, display.text.replace('@田中 太郎', '@田中 次郎')),
  ).toBe('😀 @田中 次郎 と <@b>');
  expect(
    editMentionText(display, display.text.slice(display.spans[0].end + 1)),
  ).toBe('と <@b>');
});
test('mention query detects typing and ignores email addresses', () => {
  expect(findMentionQuery('@', 1)).toEqual({ start: 0, end: 1, query: '' });
  expect(findMentionQuery('こんにちは @田中', 9)?.query).toBe('田中');
  expect(findMentionQuery('mail@example.com', 16)).toBeNull();
  expect(findMentionQuery('@田中 ', 4)).toBeNull();
  expect(findMentionQuery('@', -1)).toBeNull();
});
test('candidate insertion preserves preceding mentions and hides storage tokens', () => {
  const display = displayMentions('<@a> 😀 @田', members);
  const query = findMentionQuery(display.text, display.text.length);
  expect(query).not.toBeNull();
  if (!query) throw new Error('Mention query is missing');
  const inserted = insertMention(display, query.start, query.end, members[1]);
  expect(inserted.value).toBe('<@a> 😀 <@b> ');
  const result = displayMentions(inserted.value, members);
  expect(result.text).toBe('@田中 太郎 😀 @田中 太郎 ');
  expect(inserted.caret).toBe(result.text.length);
  expect(displayMentions('<@missing>', []).text).toBe('@削除されたユーザー');
});
