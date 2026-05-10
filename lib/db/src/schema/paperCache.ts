import { pgTable, text, timestamp, integer, real, boolean, jsonb } from "drizzle-orm/pg-core";

export const paperCacheTable = pgTable("paper_cache", {
  cacheKey: text("cache_key").primaryKey(),
  doi: text("doi"),
  externalId: text("external_id").notNull(),
  source: text("source").notNull(),
  title: text("title").notNull(),
  abstract: text("abstract").notNull().default(""),
  authors: jsonb("authors").notNull().default([]),
  year: integer("year"),
  studyType: text("study_type"),
  isRetracted: boolean("is_retracted").notNull().default(false),
  citationCount: integer("citation_count"),
  citationNormalizedPercentile: real("citation_normalized_percentile"),
  openAccessPdfUrl: text("open_access_pdf_url"),
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaperCache = typeof paperCacheTable.$inferSelect;
