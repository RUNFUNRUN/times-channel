import { afterAll, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseRealtimeEvent } from '../src/lib/realtime';
import {
  connectRealtime,
  waitForSocketClose,
  waitForSocketMessage,
  withRealtimeEvent,
} from './realtime-helpers';

const baseURL = process.env.TEST_BASE_URL ?? 'http://localhost:8787';
const target = new URL(baseURL);
if (
  target.protocol !== 'http:' ||
  !['localhost', '127.0.0.1'].includes(target.hostname)
) {
  throw new Error('Integration tests may only run against a local preview.');
}
const runId = crypto.randomUUID();
const emails = [
  `qa-${runId}@example.test`,
  `qa-${runId}@other.example.test`,
  `qa-add-${runId}@example.test`,
];
const channelName = `qa-${runId}`;
const mentionFixtureIds = Array.from(
  { length: 60 },
  (_, index) => `qm-${runId}-${index}`,
);
const cookies: string[] = [];
const uploadedMessages: string[] = [];
const realtimeSockets: WebSocket[] = [];
const upload = async (
  files: File[],
  channelId: string,
  parentId?: string,
  actor = 0,
  body = '',
  quoteId?: string,
  alsoPostToChannel = false,
) => {
  const form = new FormData();
  form.set('channelId', channelId);
  form.set('body', body);
  if (parentId) form.set('parentId', parentId);
  if (quoteId) form.set('quoteId', quoteId);
  if (alsoPostToChannel) form.set('alsoPostToChannel', 'true');
  for (const file of files) form.append('files', file);
  const result = await fetch(`${baseURL}/api/uploads`, {
    method: 'POST',
    headers: { Origin: baseURL, Cookie: cookies[actor] ?? '' },
    body: form,
  });
  const data = (await result.json()) as { message: { id: string } };
  if (result.ok) uploadedMessages.push(data.message.id);
  return { status: result.status, data };
};
const request = (
  path: string,
  options: {
    method?: string;
    body?: unknown;
    actor?: number;
    origin?: string;
    invite?: string;
  } = {},
) =>
  fetch(`${baseURL}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Origin: options.origin ?? baseURL,
      Cookie: cookies[options.actor ?? 0] ?? '',
      ...(options.invite ? { 'x-times-invite': options.invite } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
type Post = {
  id: string;
  body: string;
  userId: string;
  parentId: string | null;
  alsoPostToChannel: boolean;
  replyCount: number;
  channelName: string;
  reactions: { emoji: string; userId: string }[];
  saved: boolean;
  quote: {
    messageId: string;
    source: {
      id: string;
      body: string;
      author: string;
      channelId: string;
      mentions: { userId: string; name: string }[];
      attachmentNames: string[];
    } | null;
  } | null;
  mentions: { userId: string; name: string }[];
  attachments: {
    id: string;
    name: string;
    size: number;
    contentType: string;
  }[];
};
type Page = { messages: Post[]; nextCursor: string | null };

afterAll(async () => {
  for (const socket of realtimeSockets) socket.close();
  await Promise.allSettled(
    uploadedMessages.map((id) =>
      request(`/messages/${id}`, { method: 'DELETE' }),
    ),
  );
  // Remove only this run's fixtures from Wrangler's default local D1 state.
  // No remote option is accepted here or in TEST_BASE_URL.
  const emailList = emails.map((email) => `'${email}'`).join(',');
  const cleanup = `DELETE FROM member_invite WHERE email IN (${emailList}); INSERT OR IGNORE INTO file_cleanup (object_key) SELECT attachment.object_key FROM attachment JOIN message ON attachment.message_id = message.id JOIN channel ON message.channel_id = channel.id WHERE channel.name = '${channelName}' OR message.user_id IN (SELECT id FROM user WHERE email IN (${emailList})); INSERT OR IGNORE INTO file_cleanup (object_key) SELECT 'avatars/' || substr(image, 21) FROM user WHERE email IN (${emailList}) AND image LIKE '/api/profile/avatar/%'; DELETE FROM channel WHERE name = '${channelName}' OR owner_id IN (SELECT id FROM user WHERE email IN (${emailList})); DELETE FROM user WHERE email IN (${emailList}) OR id IN (${mentionFixtureIds.map((id) => `'${id}'`).join(',')});`;
  execFileSync(
    'bunx',
    ['wrangler', 'd1', 'execute', 'DB', '--local', '--command', cleanup],
    { stdio: 'pipe' },
  );
});

test('D1 workspace: authentication, ownership, threads, search, reactions, bookmarks and pagination', async () => {
  const unauthenticated = await fetch(`${baseURL}/api/messages`);
  expect(unauthenticated.status).toBe(401);
  expect((await fetch(`${baseURL}/api/messages/missing/thread`)).status).toBe(
    401,
  );
  for (const path of [
    '/notifications',
    '/saved',
    '/search?q=hello',
    '/channels/general',
    '/messages/missing',
  ]) {
    expect((await fetch(`${baseURL}${path}`)).status).toBe(200);
  }

  expect((await request('/members/directory', { actor: 99 })).status).toBe(401);
  expect(
    (
      await request('/members/invitations', {
        method: 'POST',
        actor: 99,
        body: { email: emails[1] },
      })
    ).status,
  ).toBe(401);

  const signUp = (email: string, index: number, invite?: string) =>
    request('/auth/sign-up/email', {
      method: 'POST',
      actor: index,
      invite,
      body: { email, name: `QA ${index}`, password: `test-only-${runId}` },
    });
  const sessionCookie = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  const firstSignup = await signUp(emails[0], 0);
  expect(firstSignup.status).toBe(200);
  cookies.push(sessionCookie(firstSignup));
  expect(cookies[0]).toContain('session_token');
  const invitation = await request('/members/invitations', {
    method: 'POST',
    body: { email: emails[1].toUpperCase() },
  });
  expect(invitation.status).toBe(201);
  const { token } = (await invitation.json()) as { token: string };
  expect(
    await (await request(`/auth/invitations/${token}`, { actor: 99 })).json(),
  ).toEqual({ email: emails[1] });
  expect((await signUp(emails[0], 1, token)).status).toBe(404);
  const invitedSignup = await signUp(emails[1], 1, token);
  expect(invitedSignup.status).toBe(200);
  cookies.push(sessionCookie(invitedSignup));
  expect(cookies[1]).toContain('session_token');
  expect(
    (await request(`/auth/invitations/${token}`, { actor: 99 })).status,
  ).toBe(404);
  expect((await signUp(emails[1], 1, token)).status).toBe(404);
  expect(
    (
      await request('/members/invitations', {
        method: 'POST',
        body: { email: emails[1] },
      })
    ).status,
  ).toBe(409);
  const workspace = (await (await request('/workspace')).json()) as {
    user: { id: string };
    channels: {
      id: string;
      ownerId: string | null;
      name: string;
      starred: boolean;
      unread: boolean;
      sidebarVisible: boolean;
      description: string;
    }[];
  };
  const ownChannel = workspace.channels.find(
    (channel) => channel.ownerId === workspace.user.id,
  );
  expect(ownChannel?.name).toBe(`times-qa-${runId.slice(0, 27)}`);
  // A second email domain with the same local part receives its own channel.
  const second = (await (
    await request('/workspace', { actor: 1 })
  ).json()) as typeof workspace;
  const secondChannel = second.channels.find(
    (channel) => channel.ownerId === second.user.id,
  );
  expect(secondChannel).toBeDefined();
  expect(secondChannel?.id).not.toBe(ownChannel?.id);
  const again = (await (
    await request('/workspace')
  ).json()) as typeof workspace;
  expect(
    again.channels.filter((channel) => channel.ownerId === workspace.user.id),
  ).toHaveLength(1);

  if (!ownChannel || !secondChannel)
    throw new Error('Personal channel missing');
  expect(ownChannel.sidebarVisible).toBe(true);
  expect(secondChannel.sidebarVisible).toBe(true);
  expect(
    workspace.channels
      .filter((item) => item.sidebarVisible)
      .map((item) => item.id),
  ).toEqual(['general', ownChannel.id]);
  expect(
    second.channels
      .filter((item) => item.sidebarVisible)
      .map((item) => item.id),
  ).toEqual(['general', secondChannel.id]);
  expect(
    workspace.channels.find((item) => item.id === secondChannel.id)
      ?.sidebarVisible,
  ).toBe(false);
  expect(
    second.channels.find((item) => item.id === ownChannel.id)?.sidebarVisible,
  ).toBe(false);
  const general = (await (
    await request('/messages?channelId=general')
  ).json()) as Page;
  const joinNotice = general.messages.filter(
    (item) => item.userId === second.user.id,
  );
  expect(joinNotice).toHaveLength(1);
  expect(joinNotice[0].body).toContain(`/channels/${secondChannel.id}`);
  expect(joinNotice[0].body).toContain('ワークスペースに参加しました');
  const joinChannel = (channelId: string, actor = 0) =>
    request(`/channels/${channelId}/join`, { method: 'PUT', actor });
  expect((await joinChannel(secondChannel.id, 99)).status).toBe(401);
  expect((await joinChannel('unknown-channel')).status).toBe(404);
  const sidebar = [
    { channelId: secondChannel.id, visible: true },
    { channelId: ownChannel.id, visible: true },
    { channelId: 'general', visible: false },
  ];
  expect(
    (
      await request('/channels/sidebar', {
        method: 'PUT',
        body: {
          channels: [{ ...sidebar[0], visible: false }, ...sidebar.slice(1)],
        },
      })
    ).status,
  ).toBe(200);
  expect((await joinChannel(secondChannel.id)).status).toBe(200);
  expect((await joinChannel(secondChannel.id)).status).toBe(200);
  const preferences = (await (
    await request('/workspace')
  ).json()) as typeof workspace;
  expect(
    preferences.channels
      .slice(0, 3)
      .map((item) => [item.id, item.sidebarVisible]),
  ).toEqual(sidebar.map((item) => [item.channelId, item.visible]));
  expect((await request('/messages?channelId=general')).status).toBe(200);
  const unaffected = (await (
    await request('/workspace', { actor: 1 })
  ).json()) as typeof workspace;
  expect(
    unaffected.channels.find((item) => item.id === 'general')?.sidebarVisible,
  ).toBe(true);
  expect(
    unaffected.channels.find((item) => item.id === ownChannel.id)
      ?.sidebarVisible,
  ).toBe(false);
  expect((await joinChannel(ownChannel.id, 1)).status).toBe(200);
  expect((await joinChannel('general', 1)).status).toBe(200);
  const joined = (await (
    await request('/workspace', { actor: 1 })
  ).json()) as typeof workspace;
  expect(
    joined.channels.slice(0, 2).map((item) => [item.id, item.sidebarVisible]),
  ).toEqual([
    [ownChannel.id, true],
    ['general', true],
  ]);
  expect((secondChannel?.name.length ?? 0) <= 64).toBe(true);
  const ownPostResult = await request('/messages', {
    method: 'POST',
    body: { channelId: ownChannel.id, body: '名前変更前の投稿' },
  });
  expect(ownPostResult.status).toBe(201);
  const ownPost = (await ownPostResult.json()) as { message: Post };
  expect(
    (
      await request(`/channels/${ownChannel.id}`, {
        method: 'PATCH',
        actor: 1,
        body: { name: 'other-user' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request('/channels/general', {
        method: 'PATCH',
        body: { name: 'renamed-general' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request('/channels/missing', {
        method: 'PATCH',
        body: { name: 'missing' },
      })
    ).status,
  ).toBe(404);
  for (const body of [
    {},
    { name: '' },
    { name: 'invalid name' },
    { name: 'x'.repeat(65) },
    { description: 'x'.repeat(201) },
  ]) {
    expect(
      (await request(`/channels/${ownChannel.id}`, { method: 'PATCH', body }))
        .status,
    ).toBe(400);
  }
  expect(
    (
      await request(`/channels/${ownChannel.id}`, {
        method: 'PATCH',
        body: { name: 'general' },
      })
    ).status,
  ).toBe(409);
  const renamedName = `times-edited-${runId}`;
  expect(
    (
      await request(`/channels/${ownChannel.id}`, {
        method: 'PATCH',
        body: { name: renamedName, description: '変更後の説明' },
      })
    ).status,
  ).toBe(200);
  // Initial workspace loading must preserve the edited name and channel identity.
  const renamedWorkspace = (await (
    await request('/workspace')
  ).json()) as typeof workspace;
  const renamed = renamedWorkspace.channels.find(
    (item) => item.ownerId === workspace.user.id,
  );
  expect(renamed?.id).toBe(ownChannel.id);
  expect(renamed?.name).toBe(renamedName);
  expect(renamed?.description).toBe('変更後の説明');
  expect(
    renamedWorkspace.channels.filter(
      (item) => item.ownerId === workspace.user.id,
    ),
  ).toHaveLength(1);
  const ownTimeline = (await (
    await request(`/messages?channelId=${ownChannel.id}`)
  ).json()) as Page;
  expect(
    ownTimeline.messages.find((item) => item.id === ownPost.message.id)
      ?.channelName,
  ).toBe(renamedName);
  expect(
    (
      await request(`/channels/${ownChannel.id}`, {
        method: 'PATCH',
        body: { description: '' },
      })
    ).status,
  ).toBe(200);
  const descriptionOnly = (await (
    await request('/workspace')
  ).json()) as typeof workspace;
  expect(
    descriptionOnly.channels.find((item) => item.id === ownChannel.id)?.name,
  ).toBe(renamedName);
  expect(
    descriptionOnly.channels.find((item) => item.id === ownChannel.id)
      ?.description,
  ).toBe('');
  expect(
    (
      await request(`/channels/${ownChannel.id}`, {
        method: 'PATCH',
        body: { name: renamedName },
      })
    ).status,
  ).toBe(200);

  const created = await request('/channels', {
    method: 'POST',
    body: { name: channelName, description: 'integration fixtures' },
  });
  expect(created.status).toBe(201);
  const { channel } = (await created.json()) as { channel: { id: string } };
  const extraSignup = await signUp(emails[2], 2);
  expect(extraSignup.status).toBe(200);
  cookies.push(sessionCookie(extraSignup));
  const thirdWorkspace = (await (
    await request('/workspace', { actor: 2 })
  ).json()) as typeof workspace;
  const candidatesPath = `/channels/${channel.id}/member-candidates`;
  const recruit = (userIds: string[], actor = 0) =>
    request(`/channels/${channel.id}/members`, {
      method: 'POST',
      actor,
      body: { userIds },
    });
  const candidateIds = async () => {
    const response = await request(candidatesPath);
    expect(response.status).toBe(200);
    return (
      (await response.json()) as { members: { id: string }[] }
    ).members.map((member) => member.id);
  };
  expect((await request(candidatesPath, { actor: 99 })).status).toBe(401);
  expect((await recruit([second.user.id], 99)).status).toBe(401);
  expect(await candidateIds()).toEqual(
    expect.arrayContaining([second.user.id, thirdWorkspace.user.id]),
  );
  expect((await recruit([second.user.id, 'missing-member'])).status).toBe(409);
  expect(await candidateIds()).toContain(second.user.id);
  expect((await recruit([second.user.id, second.user.id])).status).toBe(400);
  const recruited = await recruit([second.user.id, thirdWorkspace.user.id]);
  expect(recruited.status).toBe(200);
  expect(await recruited.json()).toEqual({ count: 2 });
  const remainingCandidates = await candidateIds();
  expect(remainingCandidates).not.toContain(second.user.id);
  expect(remainingCandidates).not.toContain(thirdWorkspace.user.id);
  expect(remainingCandidates).not.toContain(workspace.user.id);
  for (const actor of [1, 2]) {
    const updated = (await (
      await request('/workspace', { actor })
    ).json()) as typeof workspace;
    expect(
      updated.channels.find((item) => item.id === channel.id)?.sidebarVisible,
    ).toBe(true);
    expect(
      updated.channels.find((item) => item.id === 'general')?.sidebarVisible,
    ).toBe(true);
  }
  expect(
    (
      await request('/channels', {
        method: 'POST',
        body: { name: channelName },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request('/channels', {
        method: 'POST',
        body: { name: 'invalid name' },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: { channelId: channel.id, body: '   ' },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: { channelId: channel.id, body: 'x'.repeat(4001) },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request('/messages', {
        method: 'POST',
        origin: 'https://other.example',
        body: { channelId: channel.id, body: 'cross-origin' },
      })
    ).status,
  ).toBe(403);

  // Notifications are scoped to synthetic accounts and use the owner's channel.
  type Notice = {
    id: string;
    kind: string;
    readAt: number | null;
    messageId: string;
    threadId: string;
    body: string;
  };
  type Notices = { notifications: Notice[]; nextCursor: string | null };
  const inbox = async (actor: number, query = '') =>
    (await (
      await request(`/notifications${query}`, { actor })
    ).json()) as Notices;
  const unread = async (actor: number) =>
    (
      (await (
        await request('/notifications/unread-count', { actor })
      ).json()) as { unreadCount: number }
    ).unreadCount;
  const membersResponse = await request('/members');
  expect(membersResponse.status).toBe(200);
  const memberList = (await membersResponse.json()) as {
    members: { id: string; name: string; email: string }[];
  };
  expect(
    memberList.members.find((member) => member.id === second.user.id)?.email,
  ).toBe(emails[1]);
  expect(Object.keys(memberList.members[0]).sort()).toEqual([
    'email',
    'id',
    'image',
    'name',
  ]);
  const literalMarkdown = await request('/messages', {
    method: 'POST',
    body: {
      channelId: ownChannel.id,
      body: '```ts\n<@missing-user>\n```\n\n`<@missing-user>` [link](https://example.test/<@missing-user>)',
    },
  });
  expect(literalMarkdown.status).toBe(201);
  const literalId = ((await literalMarkdown.json()) as { message: Post })
    .message.id;
  expect(await unread(1)).toBe(0);
  const literalRow = (
    (await (
      await request(`/messages?channelId=${ownChannel.id}`)
    ).json()) as Page
  ).messages.find((item) => item.id === literalId);
  expect(literalRow?.mentions).toEqual([]);
  const markdownEdit = await request(`/messages/${literalId}`, {
    method: 'PATCH',
    body: { body: `**<@${second.user.id}>** _Markdown mention_` },
  });
  expect(markdownEdit.status).toBe(200);
  expect(await unread(1)).toBe(1);
  await request(`/messages/${literalId}`, { method: 'DELETE' });
  expect(await unread(1)).toBe(0);

  const mentionBody = `<@${second.user.id}> <@${second.user.id}> <@${workspace.user.id}> notification`;
  const mentioned = await request('/messages', {
    method: 'POST',
    body: { channelId: ownChannel?.id, body: mentionBody },
  });
  expect(mentioned.status).toBe(201);
  const mentionRoot = ((await mentioned.json()) as { message: Post }).message;
  expect(await unread(0)).toBe(0);
  expect(await unread(1)).toBe(1);
  const notice = (await inbox(1)).notifications[0];
  expect(notice.kind).toBe('mention');
  expect(notice.threadId).toBe(mentionRoot.id);
  expect(notice.body).toContain('@QA 1');
  expect(notice.body).not.toContain('<@');
  const mentionRows = (
    (await (
      await request(`/messages?channelId=${ownChannel?.id}`)
    ).json()) as Page
  ).messages.find((row) => row.id === mentionRoot.id);
  expect(mentionRows?.mentions.length).toBe(2);
  const searchMentions = (await (
    await request('/messages?q=%40QA%201')
  ).json()) as Page;
  expect(searchMentions.messages.some((row) => row.id === mentionRoot.id)).toBe(
    true,
  );
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: { channelId: ownChannel?.id, body: '<@missing-user>' },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(`/notifications/${notice.id}/read`, {
        method: 'PUT',
        body: { read: true },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(`/notifications/${notice.id}/read`, {
        method: 'PUT',
        actor: 1,
        body: { read: true },
      })
    ).status,
  ).toBe(200);
  const readAt = (await inbox(1)).notifications[0].readAt;
  expect(readAt).toBeNumber();
  expect(await unread(1)).toBe(0);
  expect((await inbox(1, '?unread=true')).notifications).toHaveLength(0);
  await request(`/notifications/${notice.id}/read`, {
    method: 'PUT',
    actor: 1,
    body: { read: true },
  });
  expect((await inbox(1)).notifications[0].readAt).toBe(readAt);
  await request(`/messages/${mentionRoot.id}`, {
    method: 'PATCH',
    body: { body: `${mentionBody} edited` },
  });
  expect((await inbox(1)).notifications[0].id).toBe(notice.id);
  expect((await inbox(1)).notifications[0].readAt).toBe(readAt);
  await request(`/notifications/${notice.id}/read`, {
    method: 'PUT',
    actor: 1,
    body: { read: false },
  });
  expect(await unread(1)).toBe(1);
  await request(`/messages/${mentionRoot.id}`, {
    method: 'PATCH',
    body: { body: 'removed mentions' },
  });
  expect((await inbox(1)).notifications).toHaveLength(0);
  await request(`/messages/${mentionRoot.id}`, {
    method: 'PATCH',
    body: { body: mentionBody },
  });
  expect(await unread(1)).toBe(1);
  const explicitReply = await request('/messages', {
    method: 'POST',
    actor: 1,
    body: {
      channelId: ownChannel?.id,
      parentId: mentionRoot.id,
      body: `<@${workspace.user.id}> reply`,
    },
  });
  expect(explicitReply.status).toBe(201);
  expect((await inbox(0)).notifications.map((item) => item.kind)).toEqual([
    'mention',
  ]);
  const replyId = ((await explicitReply.json()) as { message: Post }).message
    .id;
  const replyNotice = (await inbox(0)).notifications[0];
  expect(replyNotice.messageId).toBe(replyId);
  expect(replyNotice.threadId).toBe(mentionRoot.id);
  await request('/messages', {
    method: 'POST',
    actor: 1,
    body: {
      channelId: ownChannel?.id,
      parentId: mentionRoot.id,
      body: 'ordinary reply',
    },
  });
  expect(
    (await inbox(0)).notifications.map((item) => item.kind).sort(),
  ).toEqual(['mention', 'reply']);
  const reactionPath = `/messages/${mentionRoot.id}/reaction`;
  for (const active of [true, true])
    expect(
      (
        await request(reactionPath, {
          method: 'PUT',
          actor: 1,
          body: { emoji: '👍', active },
        })
      ).status,
    ).toBe(200);
  expect(
    (await inbox(0)).notifications.filter((item) => item.kind === 'reaction'),
  ).toHaveLength(1);
  await request(reactionPath, {
    method: 'PUT',
    actor: 1,
    body: { emoji: '👍', active: false },
  });
  expect(
    (await inbox(0)).notifications.filter((item) => item.kind === 'reaction'),
  ).toHaveLength(0);
  await request(reactionPath, {
    method: 'PUT',
    body: { emoji: '👍', active: true },
  });
  expect(await unread(0)).toBe(2);
  await request('/notifications/read-all', { method: 'PUT' });
  expect(await unread(0)).toBe(0);
  expect(await unread(1)).toBe(1);
  await request(`/messages/${mentionRoot.id}`, { method: 'DELETE' });
  expect((await inbox(0)).notifications).toHaveLength(0);
  expect((await inbox(1)).notifications).toHaveLength(0);
  const mentionedFile = await upload(
    [new File(['mentioned file'], 'mention.txt')],
    ownChannel?.id ?? '',
    undefined,
    0,
    `<@${second.user.id}> file`,
  );
  expect(mentionedFile.status).toBe(201);
  expect(await unread(1)).toBe(1);
  await request(`/messages/${mentionedFile.data.message.id}`, {
    method: 'DELETE',
  });
  expect(await unread(1)).toBe(0);
  expect(
    (
      await upload(
        [new File(['invalid'], 'invalid.txt')],
        ownChannel?.id ?? '',
        undefined,
        0,
        '<@missing-user>',
      )
    ).status,
  ).toBe(400);
  // Cursor ordering remains stable for notifications created within the same millisecond.
  for (const index of Array.from({ length: 51 }, (_, index) => index)) {
    const result = await request('/messages', {
      method: 'POST',
      body: {
        channelId: ownChannel?.id,
        body: `<@${second.user.id}> page ${index}`,
      },
    });
    expect(result.status).toBe(201);
  }
  const firstNotices = await inbox(1);
  expect(firstNotices.notifications).toHaveLength(50);
  expect(firstNotices.nextCursor).not.toBeNull();
  const olderNotices = await inbox(
    1,
    `?before=${encodeURIComponent(firstNotices.nextCursor ?? '')}`,
  );
  expect(olderNotices.notifications).toHaveLength(1);
  expect(
    new Set(
      [...firstNotices.notifications, ...olderNotices.notifications].map(
        (item) => item.id,
      ),
    ).size,
  ).toBe(51);
  expect(await unread(1)).toBe(51);
  await request('/notifications/read-all', { method: 'PUT', actor: 1 });
  expect(await unread(1)).toBe(0);
  await request('/messages', {
    method: 'POST',
    body: {
      channelId: ownChannel?.id,
      body: `<@${second.user.id}> new unread`,
    },
  });
  expect(await unread(1)).toBe(1);

  // Exercise multi-recipient writes across D1 statement parameter boundaries.
  const mentionFixtures = mentionFixtureIds
    .map(
      (id) =>
        `('${id}', 'QA mention', '${id}@example.test', 0, ${Date.now()}, ${Date.now()})`,
    )
    .join(',');
  execFileSync(
    'bunx',
    [
      'wrangler',
      'd1',
      'execute',
      'DB',
      '--local',
      '--command',
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ${mentionFixtures}`,
    ],
    { stdio: 'pipe' },
  );
  const groupBody = mentionFixtureIds.map((id) => `<@${id}>`).join(' ');
  const groupPost = await request('/messages', {
    method: 'POST',
    body: { channelId: ownChannel?.id, body: groupBody },
  });
  expect(groupPost.status).toBe(201);
  const groupId = ((await groupPost.json()) as { message: Post }).message.id;
  const groupRow = (
    (await (
      await request(`/messages?channelId=${ownChannel?.id}`)
    ).json()) as Page
  ).messages.find((row) => row.id === groupId);
  expect(groupRow?.mentions).toHaveLength(60);
  expect(
    (
      await request(`/messages/${groupId}`, {
        method: 'PATCH',
        body: { body: `${groupBody} edited` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(`/messages/${groupId}`, {
        method: 'PATCH',
        body: { body: 'removed group mentions' },
      })
    ).status,
  ).toBe(200);
  expect(
    (await request(`/messages/${groupId}`, { method: 'DELETE' })).status,
  ).toBe(200);

  // Real connections against workerd, using the same isolated auth fixtures.
  expect(
    (
      await fetch(`${baseURL}/api/realtime`, {
        headers: {
          Origin: baseURL,
          Upgrade: 'websocket',
          'x-user-id': workspace.user.id,
        },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${baseURL}/api/realtime`, {
        headers: {
          Origin: 'https://other.example',
          Upgrade: 'websocket',
          Cookie: cookies[0],
        },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${baseURL}/api/realtime`, {
        headers: { Origin: baseURL, Cookie: cookies[0] },
      })
    ).status,
  ).toBe(426);
  const socketA = await connectRealtime(baseURL, cookies[0]);
  realtimeSockets.push(socketA);
  const socketB = await connectRealtime(baseURL, cookies[1]);
  realtimeSockets.push(socketB);
  const observedA: string[] = [];
  socketA.addEventListener('message', (event) => {
    const parsed = parseRealtimeEvent(event.data);
    if (parsed) observedA.push(parsed.scope);
  });
  const pong = waitForSocketMessage(socketA, (data) => data === 'pong');
  socketA.send('ping');
  expect(await pong).toBe('pong');
  const saveProfile = (
    name: string,
    avatar?: File,
    remove = false,
    actor = 0,
  ) => {
    const form = new FormData();
    form.set('name', name);
    if (avatar) form.set('avatar', avatar);
    if (remove) form.set('removeAvatar', 'true');
    // Extra identity fields must never grant access to another user's profile.
    form.set('userId', workspace.user.id);
    return fetch(`${baseURL}/api/profile`, {
      method: 'PATCH',
      headers: { Origin: baseURL, Cookie: cookies[actor] ?? '' },
      body: form,
    });
  };
  expect((await fetch(`${baseURL}/api/profile`)).status).toBe(401);
  expect((await saveProfile('anonymous', undefined, false, 99)).status).toBe(
    401,
  );
  expect((await saveProfile('   ')).status).toBe(400);
  expect((await saveProfile('x'.repeat(41))).status).toBe(400);
  expect(
    (
      await saveProfile(
        'QA 0',
        new File(['<svg onload="alert(1)"></svg>'], 'fake.png', {
          type: 'image/png',
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await saveProfile(
        'QA 0',
        new File([], 'empty.png', { type: 'image/png' }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await saveProfile(
        'QA 0',
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', {
          type: 'image/png',
        }),
      )
    ).status,
  ).toBe(400);
  const avatar = new File(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S9sAAAAASUVORK5CYII=',
        'base64',
      ),
    ],
    'avatar.png',
    { type: 'image/png' },
  );
  const savedProfile = await withRealtimeEvent(socketB, 'workspace', () =>
    saveProfile('変更した表示名', avatar),
  );
  expect(savedProfile.response.status).toBe(200);
  type Profile = {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  const profile = ((await savedProfile.response.json()) as { user: Profile })
    .user;
  expect(profile.id).toBe(workspace.user.id);
  expect(profile.name).toBe('変更した表示名');
  expect(profile.image).toMatch(/^\/api\/profile\/avatar\/[a-f0-9-]{36}$/);
  const avatarResponse = await request(
    profile.image?.replace('/api', '') ?? '',
    { actor: 1 },
  );
  expect(avatarResponse.status).toBe(200);
  expect(avatarResponse.headers.get('content-type')).toBe('image/png');
  expect(new Uint8Array(await avatarResponse.arrayBuffer())).toEqual(
    new Uint8Array(await avatar.arrayBuffer()),
  );
  expect((await fetch(`${baseURL}${profile.image}`)).status).toBe(401);
  expect((await saveProfile('QA 1', undefined, false, 1)).status).toBe(200);
  expect(
    ((await (await request('/profile')).json()) as { user: Profile }).user.name,
  ).toBe('変更した表示名');
  const sessionProfile = (await (
    await request('/auth/get-session')
  ).json()) as { user: Profile };
  expect(sessionProfile.user.name).toBe('変更した表示名');
  expect(sessionProfile.user.image).toBe(profile.image);
  const previousPost = (
    (await (
      await request(`/messages/${ownPost.message.id}/thread`)
    ).json()) as Page
  ).messages.find((item) => item.id === ownPost.message.id) as Post & {
    author: string;
    authorImage: string | null;
  };
  expect(previousPost.author).toBe('変更した表示名');
  expect(previousPost.authorImage).toBe(profile.image);
  const updatedMembers = (
    (await (await request('/members', { actor: 1 })).json()) as {
      members: Profile[];
    }
  ).members;
  expect(
    updatedMembers.find((item) => item.id === workspace.user.id)?.image,
  ).toBe(profile.image);
  const currentWorkspace = (await (
    await request('/workspace')
  ).json()) as typeof workspace & { user: Profile };
  expect(currentWorkspace.user.image).toBe(profile.image);
  const replacement = (
    (await (await saveProfile('変更した表示名', avatar)).json()) as {
      user: Profile;
    }
  ).user;
  expect(replacement.image).not.toBe(profile.image);
  expect(
    (
      await fetch(`${baseURL}${profile.image}`, {
        headers: { Cookie: cookies[0] },
      })
    ).status,
  ).toBe(404);
  expect((await saveProfile('QA 0', undefined, true)).status).toBe(200);
  expect(
    ((await (await request('/profile')).json()) as { user: Profile }).user
      .image,
  ).toBeNull();
  expect(
    (
      await fetch(`${baseURL}${replacement.image}`, {
        headers: { Cookie: cookies[0] },
      })
    ).status,
  ).toBe(404);

  const createdRealtime = await withRealtimeEvent(socketB, 'messages', () =>
    request('/messages', {
      method: 'POST',
      body: { channelId: ownChannel?.id, body: 'realtime post' },
    }),
  );
  expect(createdRealtime.response.status).toBe(201);
  expect(createdRealtime.payload).toEqual({
    type: 'changed',
    scope: 'messages',
  });
  const realtimeId = (
    (await createdRealtime.response.json()) as { message: Post }
  ).message.id;
  expect(
    (
      await withRealtimeEvent(socketB, 'messages', () =>
        request(`/messages/${realtimeId}`, {
          method: 'PATCH',
          body: { body: 'realtime edited' },
        }),
      )
    ).response.status,
  ).toBe(200);
  expect(
    (
      await withRealtimeEvent(socketA, 'messages', () =>
        request('/messages', {
          method: 'POST',
          actor: 1,
          body: {
            channelId: ownChannel?.id,
            parentId: realtimeId,
            body: 'realtime reply',
          },
        }),
      )
    ).response.status,
  ).toBe(201);
  expect(
    (
      await withRealtimeEvent(socketA, 'messages', () =>
        request(`/messages/${realtimeId}/reaction`, {
          method: 'PUT',
          actor: 1,
          body: { emoji: '👍', active: true },
        }),
      )
    ).response.status,
  ).toBe(200);
  const publicCount = observedA.length;
  expect(
    (
      await withRealtimeEvent(socketB, 'private', () =>
        request(`/messages/${realtimeId}/bookmark`, {
          method: 'PUT',
          actor: 1,
          body: { active: true },
        }),
      )
    ).response.status,
  ).toBe(200);
  expect(
    (
      await withRealtimeEvent(socketB, 'private', () =>
        request('/notifications/read-all', { method: 'PUT', actor: 1 }),
      )
    ).response.status,
  ).toBe(200);
  expect(observedA.length).toBe(publicCount);
  expect(observedA).not.toContain('private');
  expect(
    (
      await withRealtimeEvent(socketB, 'workspace', () =>
        request(`/channels/${ownChannel?.id}`, {
          method: 'PATCH',
          body: { description: 'realtime channel' },
        }),
      )
    ).response.status,
  ).toBe(200);
  expect(
    (
      await withRealtimeEvent(socketB, 'messages', () =>
        request(`/messages/${realtimeId}`, { method: 'DELETE' }),
      )
    ).response.status,
  ).toBe(200);
  const malicious = await connectRealtime(baseURL, cookies[0]);
  realtimeSockets.push(malicious);
  const rejectedPublish = waitForSocketClose(malicious);
  malicious.send(JSON.stringify({ type: 'changed', scope: 'messages' }));
  expect(await rejectedPublish).toBe(1008);
  const extraTab = await connectRealtime(baseURL, cookies[0]);
  realtimeSockets.push(extraTab);

  const rootResult = await request('/messages', {
    method: 'POST',
    body: {
      channelId: channel.id,
      body: '日本語の作業ログ\n100% 完了 _literal_',
    },
  });
  expect(rootResult.status).toBe(201);
  const { message: root } = (await rootResult.json()) as { message: Post };
  const channelUnread = async (actor = 0) => {
    const response = await request('/workspace', { actor });
    expect(response.status).toBe(200);
    const current = (await response.json()) as typeof workspace;
    return current.channels.find((item) => item.id === channel.id)?.unread;
  };
  const markChannelRead = (
    messageId: string,
    actor = 0,
    channelId = channel.id,
  ) =>
    request(`/channels/${channelId}/read`, {
      method: 'PUT',
      actor,
      body: { messageId },
    });
  expect(await channelUnread()).toBe(false);
  expect(await channelUnread(1)).toBe(true);
  expect((await markChannelRead(root.id, 99)).status).toBe(401);
  expect((await markChannelRead(root.id, 1, 'general')).status).toBe(404);
  expect(
    (
      await withRealtimeEvent(socketB, 'private', () =>
        markChannelRead(root.id, 1),
      )
    ).response.status,
  ).toBe(200);
  expect(await channelUnread(1)).toBe(false);
  expect(
    (
      await request(`/messages/${root.id}`, {
        method: 'PATCH',
        actor: 1,
        body: { body: 'other user' },
      })
    ).status,
  ).toBe(404);
  expect(
    (await request(`/messages/${root.id}`, { method: 'DELETE', actor: 1 }))
      .status,
  ).toBe(404);
  expect(
    (
      await request(`/messages/${root.id}`, {
        method: 'PATCH',
        body: { body: '更新済みのログ\n100% 完了 _literal_' },
      })
    ).status,
  ).toBe(200);
  const replyResult = await request('/messages', {
    method: 'POST',
    actor: 1,
    body: { channelId: channel.id, parentId: root.id, body: '返信しました' },
  });
  expect(replyResult.status).toBe(201);
  const { message: reply } = (await replyResult.json()) as { message: Post };
  expect(await channelUnread()).toBe(false);
  expect(await channelUnread(1)).toBe(false);
  expect((await markChannelRead(reply.id)).status).toBe(404);
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: { channelId: channel.id, parentId: reply.id, body: 'nested' },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: {
          channelId: 'general',
          parentId: root.id,
          body: 'wrong channel',
        },
      })
    ).status,
  ).toBe(400);
  const thread = (await (
    await request(`/messages/${reply.id}/thread`)
  ).json()) as { parentId: string; messages: Post[] };
  expect(thread.parentId).toBe(root.id);
  expect(thread.messages).toHaveLength(2);
  const timeline = (await (
    await request(`/messages?channelId=${channel.id}`)
  ).json()) as Page;
  expect(timeline.messages).toHaveLength(1);
  expect(timeline.messages[0].replyCount).toBe(1);
  for (const keyword of ['100%', '_literal_', '返信']) {
    const search = (await (
      await request(
        `/messages?channelId=${channel.id}&q=${encodeURIComponent(keyword)}`,
      )
    ).json()) as Page;
    expect(search.messages).toHaveLength(1);
  }

  for (const active of [true, true])
    expect(
      (
        await request(`/messages/${root.id}/reaction`, {
          method: 'PUT',
          body: { emoji: '👍', active },
        })
      ).status,
    ).toBe(200);
  const reacted = (await (
    await request(`/messages?channelId=${channel.id}`)
  ).json()) as Page;
  expect(reacted.messages[0].reactions).toHaveLength(1);
  expect(
    (
      await request(`/messages/${root.id}/reaction`, {
        method: 'PUT',
        body: { emoji: '👍', active: false },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(`/messages/${root.id}/bookmark`, {
        method: 'PUT',
        body: { active: true },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      (await (await request('/messages?saved=true')).json()) as Page
    ).messages.some((item) => item.id === root.id),
  ).toBe(true);
  expect(
    (
      (await (
        await request('/messages?saved=true', { actor: 1 })
      ).json()) as Page
    ).messages.some((item) => item.id === root.id),
  ).toBe(false);
  expect(
    (
      await request(`/channels/${channel.id}/favorite`, {
        method: 'PUT',
        body: { active: true },
      })
    ).status,
  ).toBe(200);
  const starred = (await (
    await request('/workspace')
  ).json()) as typeof workspace;
  expect(starred.channels.find((item) => item.id === channel.id)?.starred).toBe(
    true,
  );

  const channelReplyInput = {
    channelId: channel.id,
    parentId: root.id,
    body: 'チャンネルにも表示する返信',
    alsoPostToChannel: true,
  };
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: { ...channelReplyInput, parentId: undefined },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: { ...channelReplyInput, channelId: 'general' },
      })
    ).status,
  ).toBe(400);
  const channelReplyResult = await withRealtimeEvent(socketA, 'messages', () =>
    request('/messages', { method: 'POST', actor: 1, body: channelReplyInput }),
  );
  expect(channelReplyResult.response.status).toBe(201);
  const { message: channelReply } =
    (await channelReplyResult.response.json()) as { message: Post };
  const channelTimeline = (await (
    await request(`/messages?channelId=${channel.id}`)
  ).json()) as Page;
  expect(channelTimeline.messages).toHaveLength(2);
  const visibleReply = channelTimeline.messages.find(
    (item) => item.id === channelReply.id,
  );
  expect(visibleReply?.parentId).toBe(root.id);
  expect(visibleReply?.alsoPostToChannel).toBe(true);
  expect(
    channelTimeline.messages.find((item) => item.id === root.id)?.replyCount,
  ).toBe(2);
  const channelReplyThread = (await (
    await request(`/messages/${channelReply.id}/thread`)
  ).json()) as { parentId: string; messages: Post[] };
  expect(channelReplyThread.parentId).toBe(root.id);
  expect(
    channelReplyThread.messages.find((item) => item.id === channelReply.id),
  ).toEqual(visibleReply);
  expect(await channelUnread()).toBe(true);
  expect(await channelUnread(1)).toBe(false);
  const unreadNotifications = await (
    await request('/notifications/unread-count')
  ).json();
  // A request for an older page cannot clear a newer reply.
  expect((await markChannelRead(root.id)).status).toBe(200);
  expect(await channelUnread()).toBe(true);
  expect((await markChannelRead(channelReply.id)).status).toBe(200);
  // A late request from another tab cannot move the stored position backward.
  expect((await markChannelRead(root.id)).status).toBe(200);
  expect(await channelUnread()).toBe(false);
  expect(await (await request('/notifications/unread-count')).json()).toEqual(
    unreadNotifications,
  );

  // More than a page also exercises ordering for simultaneous timestamps.
  const results = await Promise.all(
    Array.from({ length: 51 }, (_, index) =>
      request('/messages', {
        method: 'POST',
        body: { channelId: channel.id, body: `pagination ${index}` },
      }),
    ),
  );
  expect(results.every((result) => result.status === 201)).toBe(true);
  expect(await channelUnread()).toBe(false);
  expect(await channelUnread(1)).toBe(true);
  const page1 = (await (
    await request(`/messages?channelId=${channel.id}`)
  ).json()) as Page;
  expect(page1.messages).toHaveLength(50);
  expect(page1.nextCursor).not.toBeNull();
  const page2 = (await (
    await request(
      `/messages?channelId=${channel.id}&before=${page1.nextCursor}`,
    )
  ).json()) as Page;
  expect(page2.messages).toHaveLength(3);
  expect(page2.nextCursor).toBeNull();
  expect(
    new Set([...page1.messages, ...page2.messages].map((item) => item.id)).size,
  ).toBe(53);

  expect(
    (await request(`/messages/${root.id}`, { method: 'DELETE' })).status,
  ).toBe(200);
  expect((await request(`/messages/${reply.id}/thread`)).status).toBe(404);
  expect((await request(`/messages/${channelReply.id}/thread`)).status).toBe(
    404,
  );
  const remainingTimeline = (await (
    await request(
      `/messages?channelId=${channel.id}&before=${page1.nextCursor}`,
    )
  ).json()) as Page;
  expect(remainingTimeline.messages.map((item) => item.id)).toEqual(
    page2.messages
      .filter((item) => item.id !== root.id && item.id !== channelReply.id)
      .map((item) => item.id),
  );
  expect(
    (
      (await (await request('/messages?saved=true')).json()) as Page
    ).messages.some((item) => item.id === root.id),
  ).toBe(false);
  // Private R2 attachments: image detection, download headers, isolation and cleanup.
  const png = new File(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S9sAAAAASUVORK5CYII=',
        'base64',
      ),
    ],
    'image.png',
    { type: 'image/png' },
  );
  const memo = new File(['添付ファイルの本文です。'], '作業メモ.txt', {
    type: 'text/plain',
  });
  const spoofed = new File(
    ['<html><script>alert(1)</script></html>'],
    'fake.png',
    { type: 'image/png' },
  );
  expect((await upload([png], channel.id, undefined, 99)).status).toBe(401);
  expect((await upload([png], 'missing-channel')).status).toBe(404);
  expect(
    (
      await upload(
        Array.from({ length: 6 }, () => png),
        channel.id,
      )
    ).status,
  ).toBe(400);
  expect((await upload([new File([], 'empty.txt')], channel.id)).status).toBe(
    400,
  );
  expect(
    (
      await upload(
        [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.bin')],
        channel.id,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await upload(
        Array.from(
          { length: 3 },
          () => new File([new Uint8Array(8 * 1024 * 1024)], 'total.bin'),
        ),
        channel.id,
      )
    ).status,
  ).toBe(413);
  const uploaded = await upload([png, memo, spoofed], channel.id);
  expect(uploaded.status).toBe(201);
  const uploadedId = uploaded.data.message.id as string;
  const attachedPage = (await (
    await request(`/messages?channelId=${channel.id}`)
  ).json()) as Page;
  const attachedPost = attachedPage.messages.find(
    (item) => item.id === uploadedId,
  );
  expect(attachedPost?.body).toBe('');
  expect(attachedPost?.attachments).toHaveLength(3);
  const image = attachedPost?.attachments.find(
    (item) => item.name === 'image.png',
  );
  const text = attachedPost?.attachments.find(
    (item) => item.name === '作業メモ.txt',
  );
  const fake = attachedPost?.attachments.find(
    (item) => item.name === 'fake.png',
  );
  expect(image?.contentType).toBe('image/png');
  expect(fake?.contentType).toBe('application/octet-stream');
  expect((await fetch(`${baseURL}/api/uploads/${image?.id}`)).status).toBe(401);
  const imageResponse = await request(`/uploads/${image?.id}`, { actor: 1 });
  expect(imageResponse.status).toBe(200);
  expect(imageResponse.headers.get('content-type')).toBe('image/png');
  expect(imageResponse.headers.get('content-disposition')).toStartWith(
    'inline;',
  );
  expect(imageResponse.headers.get('cache-control')).toContain('no-store');
  expect(new Uint8Array(await imageResponse.arrayBuffer())).toEqual(
    new Uint8Array(await png.arrayBuffer()),
  );
  const textResponse = await request(`/uploads/${text?.id}`);
  expect(textResponse.headers.get('content-disposition')).toContain(
    encodeURIComponent('作業メモ.txt'),
  );
  expect(textResponse.headers.get('content-disposition')).toStartWith(
    'attachment;',
  );
  expect(await textResponse.text()).toBe('添付ファイルの本文です。');
  expect(
    (await request(`/uploads/${fake?.id}`)).headers.get('content-type'),
  ).toBe('application/octet-stream');
  expect(
    (await request(`/uploads/${image?.id}?download=1`)).headers.get(
      'content-disposition',
    ),
  ).toStartWith('attachment;');
  expect(
    (
      await request(`/messages/${uploadedId}`, {
        method: 'PATCH',
        body: { body: '' },
      })
    ).status,
  ).toBe(200);
  expect(
    (await request(`/messages/${uploadedId}`, { method: 'DELETE', actor: 1 }))
      .status,
  ).toBe(404);
  const attachedReply = await upload(
    [memo],
    channel.id,
    uploadedId,
    1,
    '',
    undefined,
    true,
  );
  expect(attachedReply.status).toBe(201);
  const attachedThread = (await (
    await request(`/messages/${uploadedId}/thread`)
  ).json()) as { messages: Post[] };
  expect(
    attachedThread.messages.find((item) => item.id === uploadedId)?.attachments,
  ).toHaveLength(3);
  expect(
    attachedThread.messages.find(
      (item) => item.id === attachedReply.data.message.id,
    )?.attachments,
  ).toHaveLength(1);
  const attachedReplyPage = (await (
    await request(`/messages?channelId=${channel.id}`)
  ).json()) as Page;
  expect(
    attachedReplyPage.messages.find(
      (item) => item.id === attachedReply.data.message.id,
    ),
  ).toMatchObject({
    parentId: uploadedId,
    alsoPostToChannel: true,
    attachments: [expect.objectContaining({ name: memo.name })],
  });
  const r2Key = `times-channel-uploads/attachments/${uploadedId}/${image?.id}`;
  // Check the object itself before and after deletion, independently of D1 metadata.
  const destination = `/tmp/times-r2-test-${runId}.png`;
  const getR2 = () =>
    spawnSync(
      'bunx',
      [
        'wrangler',
        'r2',
        'object',
        'get',
        r2Key,
        '--local',
        '--file',
        destination,
      ],
      { encoding: 'utf8' },
    );
  expect(getR2().status).toBe(0);
  expect(
    (await request(`/messages/${uploadedId}`, { method: 'DELETE' })).status,
  ).toBe(200);
  expect((await request(`/uploads/${image?.id}`)).status).toBe(404);
  expect(
    (await request(`/messages/${attachedReply.data.message.id}/thread`)).status,
  ).toBe(404);
  const deletedObject = getR2();
  expect(deletedObject.status).not.toBe(0);
  expect(deletedObject.stdout + deletedObject.stderr).toMatch(
    /not exist|not found|NoSuchKey|404/i,
  );

  // Permalinks resolve old posts and exact replies, always behind the session middleware.
  const getThreadPost = async (id: string, actor = 0) => {
    const response = await request(`/messages/${id}/thread`, { actor });
    expect(response.status).toBe(200);
    return ((await response.json()) as { messages: Post[] }).messages.find(
      (item) => item.id === id,
    ) as Post;
  };
  const sourceResponse = await request('/messages', {
    method: 'POST',
    actor: 1,
    body: {
      channelId: secondChannel?.id,
      body: `quote source <@${workspace.user.id}>`,
    },
  });
  expect(sourceResponse.status).toBe(201);
  const sourceId = ((await sourceResponse.json()) as { message: Post }).message
    .id;
  expect(
    (await fetch(`${baseURL}/api/messages/${sourceId}/thread`)).status,
  ).toBe(401);
  expect((await request('/messages/missing/thread')).status).toBe(404);
  const countBeforeQuote = await (
    await request('/notifications/unread-count')
  ).json();
  expect(
    (
      await request('/messages', {
        method: 'POST',
        actor: 99,
        body: { channelId: ownChannel?.id, body: '', quoteId: sourceId },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: { channelId: ownChannel?.id, body: '', quoteId: 'missing' },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request('/messages', {
        method: 'POST',
        body: { channelId: ownChannel?.id, body: '' },
      })
    ).status,
  ).toBe(400);
  expect(
    (await upload([memo], channel.id, undefined, 0, '', 'missing')).status,
  ).toBe(404);
  const quoteResponse = await request('/messages', {
    method: 'POST',
    body: { channelId: ownChannel?.id, body: '', quoteId: sourceId },
  });
  expect(quoteResponse.status).toBe(201);
  const quoteId = ((await quoteResponse.json()) as { message: Post }).message
    .id;
  const quoted = await getThreadPost(quoteId, 1);
  expect(quoted.body).toBe('');
  expect(quoted.quote?.source?.id).toBe(sourceId);
  expect(quoted.quote?.source?.channelId).toBe(secondChannel?.id);
  expect(quoted.quote?.source?.mentions.map((member) => member.userId)).toEqual(
    [workspace.user.id],
  );
  expect(quoted.mentions).toHaveLength(0);
  expect(await (await request('/notifications/unread-count')).json()).toEqual(
    countBeforeQuote,
  );
  const quoteList = (await (
    await request(`/messages?channelId=${ownChannel?.id}`)
  ).json()) as Page;
  expect(quoteList.messages.find((item) => item.id === quoteId)?.quote).toEqual(
    quoted.quote,
  );
  expect(
    (
      await request(`/messages/${quoteId}`, {
        method: 'PATCH',
        body: { body: '' },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(`/messages/${sourceId}`, {
        method: 'PATCH',
        actor: 1,
        body: { body: 'updated quote source' },
      })
    ).status,
  ).toBe(200);
  expect((await getThreadPost(quoteId)).quote?.source?.body).toBe(
    'updated quote source',
  );
  const quoteReplyResponse = await request('/messages', {
    method: 'POST',
    body: {
      channelId: ownChannel?.id,
      parentId: quoteId,
      body: 'reply with quote',
      quoteId: sourceId,
    },
  });
  expect(quoteReplyResponse.status).toBe(201);
  const quoteReplyId = ((await quoteReplyResponse.json()) as { message: Post })
    .message.id;
  expect((await getThreadPost(quoteReplyId)).quote?.source?.id).toBe(sourceId);
  const attachedQuote = await upload(
    [memo],
    channel.id,
    undefined,
    0,
    'with attachment',
    sourceId,
  );
  expect(attachedQuote.status).toBe(201);
  expect(
    (await getThreadPost(attachedQuote.data.message.id)).quote?.source?.id,
  ).toBe(sourceId);
  const quoteOfAttachmentResponse = await request('/messages', {
    method: 'POST',
    body: {
      channelId: channel.id,
      body: 'quoting attachment',
      quoteId: attachedQuote.data.message.id,
    },
  });
  expect(quoteOfAttachmentResponse.status).toBe(201);
  const quoteOfAttachmentId = (
    (await quoteOfAttachmentResponse.json()) as { message: Post }
  ).message.id;
  expect(
    (await getThreadPost(quoteOfAttachmentId)).quote?.source?.attachmentNames,
  ).toEqual([memo.name]);
  expect(
    (await request(`/messages/${sourceId}`, { method: 'DELETE', actor: 1 }))
      .status,
  ).toBe(200);
  expect((await request(`/messages/${sourceId}/thread`)).status).toBe(404);
  expect((await getThreadPost(quoteId)).quote).toEqual({
    messageId: quoteId,
    source: null,
  });
  expect((await getThreadPost(quoteReplyId)).quote?.source).toBeNull();
  expect(
    (
      await request(`/messages/${quoteId}`, {
        method: 'PATCH',
        body: { body: '' },
      })
    ).status,
  ).toBe(200);
  expect(
    (await request(`/messages/${quoteId}`, { method: 'DELETE' })).status,
  ).toBe(200);
  expect((await request(`/messages/${quoteReplyId}/thread`)).status).toBe(404);
  expect(
    (
      await request(`/messages/${attachedQuote.data.message.id}`, {
        method: 'DELETE',
      })
    ).status,
  ).toBe(200);
  expect((await getThreadPost(quoteOfAttachmentId)).quote?.source).toBeNull();
  expect(
    (await request(`/messages/${quoteOfAttachmentId}`, { method: 'DELETE' }))
      .status,
  ).toBe(200);

  const disconnectedA = waitForSocketClose(socketA);
  const disconnectedExtraTab = waitForSocketClose(extraTab);
  const signedOut = await request('/auth/sign-out', {
    method: 'POST',
    body: {},
  });
  expect(signedOut.status).toBe(200);
  expect(await disconnectedA).toBe(4001);
  expect(await disconnectedExtraTab).toBe(4001);
  const stillConnected = waitForSocketMessage(
    socketB,
    (data) => data === 'pong',
  );
  socketB.send('ping');
  expect(await stillConnected).toBe('pong');
  expect((await request('/workspace')).status).toBe(401);
  const signedIn = await request('/auth/sign-in/email', {
    method: 'POST',
    body: { email: emails[0], password: `test-only-${runId}` },
  });
  expect(signedIn.status).toBe(200);
  cookies[0] = sessionCookie(signedIn);
  const setDisabled = (id: string, disabled: boolean) =>
    request(`/members/${id}/status`, { method: 'PUT', body: { disabled } });
  expect((await setDisabled(workspace.user.id, true)).status).toBe(400);
  const disabledSocket = waitForSocketClose(socketB);
  expect((await setDisabled(second.user.id, true)).status).toBe(200);
  expect(await disabledSocket).toBe(4001);
  expect((await request('/workspace', { actor: 1 })).status).toBe(401);
  const disabledLogin = await request('/auth/sign-in/email', {
    method: 'POST',
    actor: 1,
    body: { email: emails[1], password: `test-only-${runId}` },
  });
  expect(disabledLogin.status).toBe(403);
  expect((await disabledLogin.json()) as { code: string }).toMatchObject({
    code: 'MEMBER_DISABLED',
  });
  const directory = (await (await request('/members/directory')).json()) as {
    members: { id: string; disabled: boolean }[];
  };
  expect(
    directory.members.find((item) => item.id === second.user.id)?.disabled,
  ).toBe(true);
  const activeMembers = (await (await request('/members')).json()) as {
    members: { id: string }[];
  };
  expect(activeMembers.members.some((item) => item.id === second.user.id)).toBe(
    false,
  );
  expect((await request(`/messages/${joinNotice[0].id}/thread`)).status).toBe(
    200,
  );
  expect((await setDisabled(second.user.id, false)).status).toBe(200);
  expect((await request('/workspace', { actor: 1 })).status).toBe(401);
  const restored = await request('/auth/sign-in/email', {
    method: 'POST',
    actor: 1,
    body: { email: emails[1], password: `test-only-${runId}` },
  });
  expect(restored.status).toBe(200);
  cookies[1] = sessionCookie(restored);
}, 120000);
