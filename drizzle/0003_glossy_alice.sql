CREATE TABLE `manager_tactics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nickname` text NOT NULL,
	`tactic_name` text NOT NULL,
	`tactic_json` text NOT NULL,
	`layout_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_manager_tactics_nickname_updated_at` ON `manager_tactics` (`nickname`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_manager_tactics_nickname_name` ON `manager_tactics` (`nickname`,`tactic_name`);