import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const matchRecords = sqliteTable("match_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nickname: text("nickname").notNull(),
  fixtureId: text("fixture_id").notNull(),
  fixtureLabel: text("fixture_label").notNull(),
  managedTeam: text("managed_team").notNull().default("unknown"),
  score: integer("score").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  managerArchetype: text("manager_archetype").notNull(),
  managerConfidence: integer("manager_confidence").notNull(),
  managerBadges: text("manager_badges").notNull(),
  managerSummary: text("manager_summary").notNull(),
  tacticTimeline: text("tactic_timeline").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_match_records_public_score").on(table.isPublic, table.score),
  index("idx_match_records_public_fixture_score").on(table.isPublic, table.fixtureId, table.score, table.createdAt),
  index("idx_match_records_public_fixture_team_score").on(table.isPublic, table.fixtureId, table.managedTeam, table.score, table.createdAt),
  index("idx_match_records_nickname_created_at").on(table.nickname, table.createdAt),
]);

export const managerTactics = sqliteTable("manager_tactics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nickname: text("nickname").notNull(),
  tacticName: text("tactic_name").notNull(),
  tacticJson: text("tactic_json").notNull(),
  layoutJson: text("layout_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_manager_tactics_nickname_updated_at").on(table.nickname, table.updatedAt),
  index("idx_manager_tactics_nickname_name").on(table.nickname, table.tacticName),
]);
