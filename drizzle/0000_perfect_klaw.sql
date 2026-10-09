CREATE TABLE `assets` (
	`owner` text NOT NULL,
	`hash` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `hash`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `records` (
	`owner` text NOT NULL,
	`collection_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `collection_id`, `id`),
	FOREIGN KEY (`owner`,`collection_id`) REFERENCES `collections`(`owner`,`id`) ON UPDATE no action ON DELETE no action
);
