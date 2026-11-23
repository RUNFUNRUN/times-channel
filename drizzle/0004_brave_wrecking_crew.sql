CREATE TABLE `message_mention` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`),
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mention_user_idx` ON `message_mention` (`user_id`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`user_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`message_id` text NOT NULL,
	`kind` text NOT NULL,
	`emoji` text,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_event_key_unique` ON `notification` (`event_key`);--> statement-breakpoint
CREATE INDEX `notification_user_time_idx` ON `notification` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `notification_unread_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notification_message_idx` ON `notification` (`message_id`);