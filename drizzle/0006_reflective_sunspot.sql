CREATE TABLE `ai_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`scopes` text NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mcp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`collection_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner`,`collection_id`) REFERENCES `collections`(`owner`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_connections_token_hash_unique` ON `mcp_connections` (`token_hash`);--> statement-breakpoint
CREATE TABLE `tool_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`source` text NOT NULL,
	`tool` text NOT NULL,
	`collection_id` text NOT NULL,
	`ok` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tool_receipts` (
	`owner` text NOT NULL,
	`collection_id` text NOT NULL,
	`request_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`response` text NOT NULL,
	PRIMARY KEY(`owner`, `collection_id`, `request_id`),
	FOREIGN KEY (`owner`,`collection_id`) REFERENCES `collections`(`owner`,`id`) ON UPDATE no action ON DELETE no action
);
