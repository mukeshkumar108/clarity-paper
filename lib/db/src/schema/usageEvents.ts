import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const usageEventsTable = pgTable("usage_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  documentId: integer("document_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UsageEvent = typeof usageEventsTable.$inferSelect;
