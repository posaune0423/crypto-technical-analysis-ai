CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`leverage` integer DEFAULT 1 NOT NULL,
	`position_size_usd` real DEFAULT 100 NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT '2025-03-21T03:03:11.829Z' NOT NULL,
	`updated_at` text DEFAULT '2025-03-21T03:03:11.830Z' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "created_at", "updated_at") SELECT "id", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`signal_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`order_type` text NOT NULL,
	`price` real,
	`qty` real NOT NULL,
	`order_id` text,
	`order_status` text,
	`timestamp` text DEFAULT '2025-03-21T03:03:11.830Z' NOT NULL,
	`profit_loss` real,
	`is_closed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "signal_id", "symbol", "side", "order_type", "price", "qty", "order_id", "order_status", "timestamp", "profit_loss", "is_closed") SELECT "id", "signal_id", "symbol", "side", "order_type", "price", "qty", "order_id", "order_status", "timestamp", "profit_loss", "is_closed" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
CREATE TABLE `__new_trade_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`price` real NOT NULL,
	`strategy` text NOT NULL,
	`strength` real,
	`timestamp` text DEFAULT '2025-03-21T03:03:11.830Z' NOT NULL,
	`is_executed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_trade_signals`("id", "symbol", "direction", "price", "strategy", "strength", "timestamp", "is_executed") SELECT "id", "symbol", "direction", "price", "strategy", "strength", "timestamp", "is_executed" FROM `trade_signals`;--> statement-breakpoint
DROP TABLE `trade_signals`;--> statement-breakpoint
ALTER TABLE `__new_trade_signals` RENAME TO `trade_signals`;