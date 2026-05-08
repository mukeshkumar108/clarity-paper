import { pgTable, text, serial, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sourceTypeEnum = pgEnum("source_type", ["upload", "paste"]);
export const documentStatusEnum = pgEnum("document_status", ["uploaded", "extracting", "analysing", "completed", "failed"]);
export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high"]);

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  documentType: text("document_type"),
  originalFileName: text("original_file_name"),
  sourceType: sourceTypeEnum("source_type").notNull(),
  extractedText: text("extracted_text"),
  pageCountEstimate: integer("page_count_estimate"),
  wordCount: integer("word_count"),
  status: documentStatusEnum("status").notNull().default("uploaded"),
  isDemo: boolean("is_demo").notNull().default(false),
  researchField: text("research_field"),
  goal: text("goal"),
  confidenceLevel: riskLevelEnum("confidence_level"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
