UPDATE channel
SET description = '全員が利用する共有チャンネル'
WHERE id = 'general'
  AND description = 'みんなへのお知らせや、ちょっとした共有に。';
--> statement-breakpoint
UPDATE channel
SET description = (SELECT name || ' の times チャンネル' FROM user WHERE user.id = channel.owner_id)
WHERE owner_id IS NOT NULL
  AND description = (SELECT name || ' の日々のログ。考えごと、作業メモ、ひとりごとを気軽に。' FROM user WHERE user.id = channel.owner_id);
