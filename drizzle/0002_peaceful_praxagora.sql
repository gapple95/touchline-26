ALTER TABLE `match_records` ADD `managed_team` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `match_records` ADD `tactic_timeline` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_match_records_public_fixture_team_score` ON `match_records` (`is_public`,`fixture_id`,`managed_team`,`score`,`created_at`);