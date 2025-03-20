CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`order_type` text NOT NULL,
	`price` real,
	`qty` real NOT NULL,
	`order_id` text,
	`order_status` text,
	`timestamp` text DEFAULT '2025-03-20T22:13:10.211Z' NOT NULL,
	`profit_loss` real,
	`is_closed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trade_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`price` real NOT NULL,
	`strategy` text NOT NULL,
	`strength` real,
	`timestamp` text DEFAULT '2025-03-20T22:13:10.211Z' NOT NULL,
	`is_executed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT '2025-03-20T22:13:10.210Z' NOT NULL,
	`updated_at` text DEFAULT '2025-03-20T22:13:10.211Z' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);