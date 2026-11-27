CREATE TABLE `member_invite` (
	`email` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_invite_token_hash_unique` ON `member_invite` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sidebar_preference` (
	`user_id` text PRIMARY KEY NOT NULL,
	`channels` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `channel` ADD `hidden_by_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `disabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `join_announced` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Existing members remain visible even if their personal channel is created later.
UPDATE `user` SET `join_announced` = 1;
