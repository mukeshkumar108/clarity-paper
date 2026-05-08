import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";
import { usersTable } from "./users";

export const documentQuestionsTable = pgTable("document_questions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentQuestionSchema = createInsertSchema(documentQuestionsTable).omit({ id: true, createdAt: true });
export type InsertDocumentQuestion = z.infer<typeof insertDocumentQuestionSchema>;
export type DocumentQuestion = typeof documentQuestionsTable.$inferSelect;
