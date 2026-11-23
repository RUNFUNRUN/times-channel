import { afterAll, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';

const baseURL = process.env.TEST_BASE_URL ?? 'http://localhost:8787';
const target = new URL(baseURL);
if (
  target.protocol !== 'http:' ||
  !['localhost', '127.0.0.1'].includes(target.hostname)
) {
  throw new Error('Integration tests may only run against a local preview.');
}
const runId = crypto.randomUUID();
const emails = [`qa-${runId}@example.test`, `qa-${runId}@other.example.test`];
const channelName = `qa-${runId}`;
const mentionFixtureIds = Array.from(
  { length: 60 },
  (_, index) => `qm-${runId}-${index}`,
);
const cookies: string[] = [];
const uploadedMessages: string[] = [];
const upload = async (
  files: File[],
  channelId: string,
  parentId?: string,
  actor = 0,
  body = '',
) => {
  const form = new FormData();
  form.set('channelId', channelId);
  form.set('body', body);
  if (parentId) form.set('parentId', parentId);
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
  } = {},
) =>
  fetch(`${baseURL}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Origin: options.origin ?? baseURL,
      Cookie: cookies[options.actor ?? 0] ?? '',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
type Post = {
  id: string;
  body: string;
  userId: string;
  parentId: string | null;
  replyCount: number;
  channelName: string;
  reactions: { emoji: string; userId: string }[];
  saved: boolean;
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
  await Promise.allSettled(
    uploadedMessages.map((id) =>
      request(`/messages/${id}`, { method: 'DELETE' }),
    ),
  );
  // Remove only this run's fixtures from Wrangler's default local D1 state.
  // No remote option is accepted here or in TEST_BASE_URL.
  const emailList = emails.map((email) => `'${email}'`).join(',');
  const cleanup = `INSERT OR IGNORE INTO file_cleanup (object_key) SELECT attachment.object_key FROM attachment JOIN message ON attachment.message_id = message.id JOIN channel ON message.channel_id = channel.id WHERE channel.name = '${channelName}' OR message.user_id IN (SELECT id FROM user WHERE email IN (${emailList})); DELETE FROM channel WHERE name = '${channelName}' OR owner_id IN (SELECT id FROM user WHERE email IN (${emailList})); DELETE FROM user WHERE email IN (${emailList}) OR id IN (${mentionFixtureIds.map((id) => `'${id}'`).join(',')});`;
  execFileSync(
    'bunx',
    ['wrangler', 'd1', 'execute', 'DB', '--local', '--command', cleanup],
    { stdio: 'pipe' },
  );
});

test('D1 workspace: authentication, ownership, threads, search, reactions, bookmarks and pagination', async () => {
  const unauthenticated = await fetch(`${baseURL}/api/messages`);
  expect(unauthenticated.status).toBe(401);

  for (const [index, email] of emails.entries()) {
    const result = await request('/auth/sign-up/email', {
      method: 'POST',
      actor: index,
      body: { email, name: `QA ${index}`, password: `test-only-${runId}` },
    });
    expect(result.status).toBe(200);
    const cookie = result.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(cookie).toContain('session_token');
    cookies.push(cookie);
  }
  const workspace = (await (await request('/workspace')).json()) as {
    user: { id: string };
    channels: {
      id: string;
      ownerId: string | null;
      name: string;
      starred: boolean;
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

  if (!ownChannel) throw new Error('Personal channel missing');
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
    'name',
  ]);
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

  const rootResult = await request('/messages', {
    method: 'POST',
    body: {
      channelId: channel.id,
      body: '日本語の作業ログ\n100% 完了 _literal_',
    },
  });
  expect(rootResult.status).toBe(201);
  const { message: root } = (await rootResult.json()) as { message: Post };
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
  expect(page2.messages).toHaveLength(2);
  expect(page2.nextCursor).toBeNull();
  expect(
    new Set([...page1.messages, ...page2.messages].map((item) => item.id)).size,
  ).toBe(52);

  expect(
    (await request(`/messages/${root.id}`, { method: 'DELETE' })).status,
  ).toBe(200);
  expect((await request(`/messages/${reply.id}/thread`)).status).toBe(404);
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
  const attachedReply = await upload([memo], channel.id, uploadedId, 1);
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

  const signedOut = await request('/auth/sign-out', {
    method: 'POST',
    body: {},
  });
  expect(signedOut.status).toBe(200);
  expect((await request('/workspace')).status).toBe(401);
  const signedIn = await request('/auth/sign-in/email', {
    method: 'POST',
    body: { email: emails[0], password: `test-only-${runId}` },
  });
  expect(signedIn.status).toBe(200);
}, 120000);
