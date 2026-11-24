CREATE TABLE `message_quote` (
	`message_id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `message_quote_source_idx` ON `message_quote` (`source_id`);