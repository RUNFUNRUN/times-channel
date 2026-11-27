CREATE TABLE `channel_read` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_at` integer NOT NULL,
	`last_read_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `channel_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `channel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `channel` ADD `unread_since` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Existing channel history is read when unread tracking is enabled.
UPDATE `channel` SET `unread_since` = CAST(unixepoch('subsec') * 1000 AS integer);
