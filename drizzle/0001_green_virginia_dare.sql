CREATE INDEX `idx_match_records_public_fixture_score` ON `match_records` (`is_public`,`fixture_id`,`score`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
