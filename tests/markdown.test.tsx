import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageMarkdown } from '../src/components/message-markdown';
import { getRenderedMentionIds, markdownLink } from '../src/lib/markdown';

const render = (body: string) =>
  renderToStaticMarkup(
    <MessageMarkdown
      body={body}
      members={[{ id: 'user-a', name: '太郎 **管理者**' }]}
    />,
  );

test('Markdown renders headings, lists, quotes, tables, tasks and line breaks', () => {
  const html = render(
    '# 見出し\n\n**太字** *斜体* ~~削除~~\n次の行\n\n> 引用\n\n3. 手順\n4. 次へ\n\n- [x] 完了\n- [ ] 未完了\n\n| 項目 | 状態 |\n| --- | --- |\n| API | OK |',
  );
  for (const text of [
    '<h1>見出し</h1>',
    '<strong>太字</strong>',
    '<em>斜体</em>',
    '<del>削除</del>',
    '<br/>',
    '<blockquote>',
    '<ol start="3">',
    'type="checkbox"',
    '<table>',
    '<th>項目</th>',
    '<td>OK</td>',
  ])
    expect(html).toContain(text);
  expect(render('A&copy B&copy; &notbar')).toContain(
    'A&amp;copy B© &amp;notbar',
  );
  expect(render('普通の文章\n改行 &amp; &#x1f600;')).toContain('改行 &amp; 😀');
});
test('code blocks and inline code remain literal', () => {
  const html = render(
    '```ts\nconst n = "<script>";\n<@user-a>\n```\n\n`**literal** &amp; <@user-a>`',
  );
  expect(html).toContain(
    '<pre><code>const n = &quot;&lt;script&gt;&quot;;\n&lt;@user-a&gt;</code></pre>',
  );
  expect(html).toContain('<code>**literal** &amp;amp; &lt;@user-a&gt;</code>');
  expect(html).not.toContain('@太郎');
});
test('mentions keep identities without parsing display names as Markdown', () => {
  const html = render('**<@user-a>** と <@user-a>');
  expect(html).toContain('@太郎 **管理者**');
  expect(html).not.toContain('<strong>管理者</strong>');
  expect(
    getRenderedMentionIds('**<@user-a>**\n\n- <@user-a>\n- <@user-b>'),
  ).toEqual(['user-a', 'user-b']);
  for (const body of [
    '`<@user-a>`',
    '```\n<@user-a>\n```',
    '    <@user-a>',
    '[リンク](https://example.test/<@user-a>)',
    '![<@user-a>](https://example.test/image.png)',
    '&lt;@user-a&gt;',
    '<div><@user-a></div>',
  ])
    expect(getRenderedMentionIds(body)).toEqual([]);
  expect(getRenderedMentionIds('| メンバー |\n| --- |\n| <@user-a> |')).toEqual(
    ['user-a'],
  );
});
test('untrusted HTML and URL schemes never become executable markup', () => {
  const html = render(
    '<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\n[x](javascript:alert%281%29)\n\n![x](data:image/svg+xml,evil)',
  );
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain('src="data:');
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,evil',
    'vbscript:evil',
    'javascript&#58;alert(1)',
    'https:\n//example.test',
    '//example.test',
    '\\example.test',
  ])
    expect(markdownLink(href)).toBeUndefined();
  expect(markdownLink('https://example.test/?a=1&amp;b=2')).toBe(
    'https://example.test/?a=1&b=2',
  );
  expect(render('[リンク](https://example.test)')).toContain(
    'rel="noopener noreferrer"',
  );
});
test('Markdown channel links stay in the current tab', () => {
  const local = render('[個人の times を開く](/channels/times-123)');
  expect(local).toContain('href="/channels/times-123"');
  expect(local).not.toContain('target="_blank"');
  expect(render('[外部リンク](https://example.test)')).toContain(
    'target="_blank"',
  );
});
test('external Markdown images stay links and authenticated R2 images can render', () => {
  const remote = render('![画像](https://example.test/pixel.png)');
  expect(remote).toContain('href="https://example.test/pixel.png"');
  expect(remote).not.toContain('<img');
  const local = render(
    '![添付](/api/uploads/00000000-0000-4000-8000-000000000000)',
  );
  expect(local).toContain('<img');
  expect(local).toContain(
    'src="/api/uploads/00000000-0000-4000-8000-000000000000"',
  );
});
