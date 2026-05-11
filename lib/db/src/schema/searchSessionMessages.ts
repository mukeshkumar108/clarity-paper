import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { searchSessionsTable } from "./searchSessions";

export const searchSessionMessagesTable = pgTable("search_session_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => searchSessionsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SearchSessionMessage = typeof searchSessionMessagesTable.$inferSelect;
