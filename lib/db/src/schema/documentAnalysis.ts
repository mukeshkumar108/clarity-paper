import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";

export const documentAnalysisTable = pgTable("document_analysis", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }).unique(),
  briefSummary: text("brief_summary").notNull(),
  plainEnglishSummary: text("plain_english_summary").notNull(),
  documentType: text("document_type").notNull().default("unknown"),
  keyPoints: jsonb("key_points").notNull().default([]),
  keyFindings: jsonb("key_findings").notNull().default([]),
  methodology: jsonb("methodology").notNull().default([]),
  limitations: jsonb("limitations").notNull().default([]),
  gotchas: jsonb("gotchas").notNull().default([]),
  unusualTerms: jsonb("unusual_terms").notNull().default([]),
  missingInfo: jsonb("missing_info").notNull().default([]),
  questionsToAsk: jsonb("questions_to_ask").notNull().default([]),
  conflictingInterests: jsonb("conflicting_interests").notNull().default([]),
  practicalApplications: jsonb("practical_applications").notNull().default([]),
  confidenceLevel: text("confidence_level", { enum: ["low", "medium", "high"] }).notNull().default("low"),
  confidenceNotes: text("confidence_notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentAnalysisSchema = createInsertSchema(documentAnalysisTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentAnalysis = z.infer<typeof insertDocumentAnalysisSchema>;
export type DocumentAnalysis = typeof documentAnalysisTable.$inferSelect;
