CREATE TABLE `color_library` (
	`owner` text NOT NULL,
	`color_key` text NOT NULL,
	`name` text NOT NULL,
	`hex` text,
	`used_at` text NOT NULL,
	PRIMARY KEY(`owner`, `color_key`)
);
--> statement-breakpoint
CREATE TABLE `color_library_seeded` (
	`owner` text PRIMARY KEY NOT NULL
);
