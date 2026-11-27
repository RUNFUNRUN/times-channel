'use client';

import { decodeHTMLStrict as decodeHTML } from 'entities';
import type { MarkedToken, Token } from 'marked';
import Image from 'next/image';
import Link from 'next/link';
import { Fragment, type ReactNode, useMemo } from 'react';
import { markdownLink, parseMarkdown } from '@/lib/markdown';
import { displayMentions, type MentionMember } from '@/lib/mentions';

const mentionText = (text: string, members: MentionMember[]) => {
  const display = displayMentions(text, members);
  return (
    <>
      {display.spans.map((span, index) => (
        <Fragment key={span.start}>
          {decodeHTML(
            display.text.slice(
              index ? display.spans[index - 1].end : 0,
              span.start,
            ),
          )}
          <span className='rounded bg-primary/10 px-1 font-medium text-primary'>
            {display.text.slice(span.start, span.end)}
          </span>
        </Fragment>
      ))}
      {decodeHTML(display.text.slice(display.spans.at(-1)?.end ?? 0))}
    </>
  );
};

// Source offsets distinguish repeated, stateless syntax nodes.
const keyed = <T,>(items: T[], source: (item: T) => string) => {
  const position = { offset: 0 };
  return items.map((value) => {
    const key = position.offset;
    position.offset += source(value).length + 1;
    return { value, key };
  });
};

const renderTokens = (tokens: Token[], members: MentionMember[]): ReactNode =>
  keyed(tokens, (token) => token.raw).map(({ value: token, key }) => (
    <Fragment key={key}>{renderToken(token as MarkedToken, members)}</Fragment>
  ));

const renderToken = (
  token: MarkedToken,
  members: MentionMember[],
): ReactNode => {
  switch (token.type) {
    case 'space':
    case 'def':
      return null;
    case 'text':
      return token.tokens
        ? renderTokens(token.tokens, members)
        : mentionText(token.text, members);
    case 'escape':
      return token.text;
    case 'html':
      return token.text; // Raw HTML stays escaped text, never executable markup.
    case 'paragraph':
      return <p>{renderTokens(token.tokens, members)}</p>;
    case 'heading': {
      const Heading = `h${token.depth}` as
        | 'h1'
        | 'h2'
        | 'h3'
        | 'h4'
        | 'h5'
        | 'h6';
      return <Heading>{renderTokens(token.tokens, members)}</Heading>;
    }
    case 'strong':
      return <strong>{renderTokens(token.tokens, members)}</strong>;
    case 'em':
      return <em>{renderTokens(token.tokens, members)}</em>;
    case 'del':
      return <del>{renderTokens(token.tokens, members)}</del>;
    case 'br':
      return <br />;
    case 'hr':
      return <hr />;
    case 'codespan':
      return <code>{token.text}</code>;
    case 'code':
      return (
        <pre>
          <code>{token.text}</code>
        </pre>
      );
    case 'blockquote':
      return <blockquote>{renderTokens(token.tokens, members)}</blockquote>;
    case 'list': {
      const List = token.ordered ? 'ol' : 'ul';
      return (
        <List start={token.ordered && token.start ? token.start : undefined}>
          {keyed(token.items, (item) => item.raw).map(
            ({ value: item, key }) => (
              <li
                key={key}
                className={item.task ? 'task-list-item' : undefined}
              >
                {renderTokens(item.tokens, members)}
              </li>
            ),
          )}
        </List>
      );
    }
    case 'list_item':
      return <li>{renderTokens(token.tokens, members)}</li>;
    case 'checkbox':
      return (
        <input
          type='checkbox'
          checked={token.checked}
          disabled
          aria-label={token.checked ? '完了' : '未完了'}
        />
      );
    case 'link': {
      const href = markdownLink(token.href, token.autolink);
      const label = token.autolink
        ? token.text
        : renderTokens(token.tokens, members);
      if (href?.startsWith('/channels/')) {
        return (
          <Link href={href} title={token.title ?? undefined} prefetch={false}>
            {label}
          </Link>
        );
      }
      return href ? (
        <a
          href={href}
          title={token.title ?? undefined}
          target='_blank'
          rel='noopener noreferrer'
        >
          {label}
        </a>
      ) : (
        label
      );
    }
    case 'image': {
      const href = markdownLink(token.href);
      const label = decodeHTML(token.text) || '画像';
      return href && /^\/api\/uploads\/[a-f0-9-]{36}$/.test(href) ? (
        <Image
          unoptimized
          width={840}
          height={630}
          src={href}
          alt={label}
          className='my-2 max-h-64 w-auto max-w-full rounded-lg border object-contain'
        />
      ) : href ? (
        <a href={href} target='_blank' rel='noopener noreferrer'>
          画像: {label}
        </a>
      ) : (
        label
      );
    }
    case 'table':
      return (
        <div className='markdown-table'>
          <table>
            <thead>
              <tr>
                {keyed(token.header, (cell) => cell.text).map(
                  ({ value: cell, key }) => (
                    <th
                      key={key}
                      style={{ textAlign: cell.align ?? undefined }}
                    >
                      {renderTokens(cell.tokens, members)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {keyed(token.rows, (row) =>
                row.map((cell) => cell.text).join('|'),
              ).map(({ value: row, key }) => (
                <tr key={key}>
                  {keyed(row, (cell) => cell.text).map(
                    ({ value: cell, key }) => (
                      <td
                        key={key}
                        style={{ textAlign: cell.align ?? undefined }}
                      >
                        {renderTokens(cell.tokens, members)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
};

export const MessageMarkdown = ({
  body,
  members = [],
}: {
  body: string;
  members?: MentionMember[];
}) => {
  const tokens = useMemo(() => parseMarkdown(body), [body]);
  return (
    <div className='message-body markdown-body'>
      {renderTokens(tokens, members)}
    </div>
  );
};
