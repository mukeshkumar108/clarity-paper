import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const searchSessionsTable = pgTable("search_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  plannerOutput: jsonb("planner_output").notNull(),
  papers: jsonb("papers").notNull().default([]),
  synthesisText: text("synthesis_text").notNull().default(""),
  confidence: text("confidence").notNull().default(""),
  evidenceSnapshot: jsonb("evidence_snapshot").notNull().default({}),
  followUpOptions: jsonb("follow_up_options").notNull().default([]),
  pathways: jsonb("pathways").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SearchSession = typeof searchSessionsTable.$inferSelect;
