import { decodeHTMLStrict as decodeHTML } from 'entities';
import { Lexer, type MarkedToken, type Token } from 'marked';
import { getMentionIds } from '@/lib/mentions';

export const parseMarkdown = (body: string) =>
  Lexer.lex(body, { gfm: true, breaks: true });

export const markdownLink = (value: string, literal = false) => {
  const href = (literal ? value : decodeHTML(value)).trim();
  return /[\p{Cc}\\]/u.test(href) ||
    !/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href)
    ? undefined
    : href;
};

const mentionText = (tokens: Token[]): string[] =>
  tokens.flatMap((value) => {
    const token = value as MarkedToken;
    switch (token.type) {
      case 'code':
      case 'codespan':
      case 'image':
      case 'html':
      case 'escape':
        return [];
      case 'text':
        return token.tokens ? mentionText(token.tokens) : [token.text];
      case 'list':
        return token.items.flatMap((item) => mentionText(item.tokens));
      case 'table':
        return [...token.header, ...token.rows.flat()].flatMap((cell) =>
          mentionText(cell.tokens),
        );
      default:
        return 'tokens' in token && token.tokens
          ? mentionText(token.tokens)
          : [];
    }
  });

// Only visible mention text sends a notification; code and link destinations are literal.
export const getRenderedMentionIds = (body: string) =>
  body.includes('<@')
    ? [...new Set(mentionText(parseMarkdown(body)).flatMap(getMentionIds))]
    : [];
