import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const matchRecords = sqliteTable("match_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nickname: text("nickname").notNull(),
  fixtureId: text("fixture_id").notNull(),
  fixtureLabel: text("fixture_label").notNull(),
  score: integer("score").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  managerArchetype: text("manager_archetype").notNull(),
  managerConfidence: integer("manager_confidence").notNull(),
  managerBadges: text("manager_badges").notNull(),
  managerSummary: text("manager_summary").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_match_records_public_score").on(table.isPublic, table.score),
  index("idx_match_records_nickname_created_at").on(table.nickname, table.createdAt),
]);
