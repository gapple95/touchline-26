CREATE TABLE `match_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nickname` text NOT NULL,
	`fixture_id` text NOT NULL,
	`fixture_label` text NOT NULL,
	`score` integer NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`manager_archetype` text NOT NULL,
	`manager_confidence` integer NOT NULL,
	`manager_badges` text NOT NULL,
	`manager_summary` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_match_records_public_score` ON `match_records` (`is_public`,`score`);--> statement-breakpoint
CREATE INDEX `idx_match_records_nickname_created_at` ON `match_records` (`nickname`,`created_at`);