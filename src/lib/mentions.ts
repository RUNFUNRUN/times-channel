export type MentionMember = { id: string; name: string };
export type MentionSpan = {
  start: number;
  end: number;
  raw: string;
  userId: string;
};
export type MentionDisplay = { text: string; spans: MentionSpan[] };

const mentionPattern = /<@([a-zA-Z0-9_-]{1,128})>/g;
const mentionLabel = (name: string) =>
  `@${name.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim() || 'ユーザー'}`;

export const getMentionIds = (body: string) => [
  ...new Set(Array.from(body.matchAll(mentionPattern), (match) => match[1])),
];

export const displayMentions = (
  body: string,
  members: MentionMember[],
): MentionDisplay => {
  const names = new Map(members.map((member) => [member.id, member.name]));
  const parsed = Array.from(body.matchAll(mentionPattern)).reduce(
    (state, match) => {
      const before = body.slice(state.offset, match.index);
      const label = mentionLabel(names.get(match[1]) ?? '削除されたユーザー');
      const start = state.text.length + before.length;
      return {
        text: state.text + before + label,
        offset: match.index + match[0].length,
        spans: [
          ...state.spans,
          { start, end: start + label.length, raw: match[0], userId: match[1] },
        ],
      };
    },
    { text: '', offset: 0, spans: [] as MentionSpan[] },
  );
  return { text: parsed.text + body.slice(parsed.offset), spans: parsed.spans };
};

const serializeMentions = (text: string, spans: MentionSpan[]) =>
  spans
    .map(
      (span, index) =>
        text.slice(index ? spans[index - 1].end : 0, span.start) + span.raw,
    )
    .join('') + text.slice(spans.at(-1)?.end ?? 0);

const moveSpans = (
  spans: MentionSpan[],
  start: number,
  end: number,
  delta: number,
) =>
  spans.flatMap((span) => {
    if (span.end <= start) return [span];
    if (span.start >= end)
      return [{ ...span, start: span.start + delta, end: span.end + delta }];
    return [];
  });

// Keep mention identities only when the displayed label is left intact by an edit.
export const editMentionText = (previous: MentionDisplay, text: string) => {
  const length = Math.min(previous.text.length, text.length);
  const firstDifference = Array.from({ length }, (_, index) => index).findIndex(
    (index) => previous.text[index] !== text[index],
  );
  const start = firstDifference < 0 ? length : firstDifference;
  const tailLength = Math.min(
    previous.text.length - start,
    text.length - start,
  );
  const lastDifference = Array.from(
    { length: tailLength },
    (_, index) => index,
  ).findIndex(
    (index) =>
      previous.text[previous.text.length - 1 - index] !==
      text[text.length - 1 - index],
  );
  const suffix = lastDifference < 0 ? tailLength : lastDifference;
  const spans = moveSpans(
    previous.spans,
    start,
    previous.text.length - suffix,
    text.length - previous.text.length,
  );
  return serializeMentions(text, spans);
};

export const findMentionQuery = (text: string, caret: number) => {
  if (caret < 0) return null;
  const match = /(?:^|[\s([{（「、。])@([^\s@<>]{0,40})$/.exec(
    text.slice(0, caret),
  );
  return match
    ? { start: caret - match[1].length - 1, end: caret, query: match[1] }
    : null;
};

export const insertMention = (
  display: MentionDisplay,
  start: number,
  end: number,
  member: MentionMember,
) => {
  const label = mentionLabel(member.name);
  const replacement = `${label} `;
  const text =
    display.text.slice(0, start) + replacement + display.text.slice(end);
  const spans = [
    ...moveSpans(display.spans, start, end, replacement.length - (end - start)),
    {
      start,
      end: start + label.length,
      raw: `<@${member.id}>`,
      userId: member.id,
    },
  ].sort((left, right) => left.start - right.start);
  return {
    value: serializeMentions(text, spans),
    caret: start + replacement.length,
  };
};
