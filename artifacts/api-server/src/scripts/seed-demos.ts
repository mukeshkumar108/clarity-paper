/**
 * Seed demo papers into the database.
 *
 * Reads every .md file from seeds/papers/, runs the full analysis pipeline
 * (Pass 1 + Pass 2), and stores the result with isDemo=true.
 *
 * Idempotent: identified by originalFileName + isDemo=true. Running twice
 * skips already-seeded papers.
 *
 * Run from the api-server package root:
 *   node --env-file=../../.env --experimental-strip-types ./src/scripts/seed-demos.ts
 * Or via pnpm:
 *   pnpm --filter api-server seed:demos
 */

import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import {
  db,
  documentsTable,
  documentAnalysisTable,
  usageEventsTable,
  usersTable,
} from "@workspace/db";
import { analyseDocument } from "../lib/documentAnalysisService.js";
import { sanitiseText, extractMetadataTitle } from "../lib/documentExtraction.js";
import { packAnalysisForStorage } from "../lib/analysisContract.js";

const SEEDS_DIR = path.join(process.cwd(), "seeds", "papers");
const SYSTEM_USER_EMAIL = "seed@clarity.internal";

async function getOrCreateSystemUser(): Promise<number> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, SYSTEM_USER_EMAIL));

  if (existing) return existing.id;

  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
  const [created] = await db
    .insert(usersTable)
    .values({
      name: "Clarity Seeds",
      email: SYSTEM_USER_EMAIL,
      passwordHash,
    })
    .returning();

  console.log(`Created system seed user (id=${created.id})`);
  return created.id;
}

function extractTitleFromMarkdown(content: string): string {
  // Try first ATX heading
  const headingMatch = content.match(/^#{1,3}\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  // Fall back to generic extractor
  return extractMetadataTitle(content);
}

async function seedPaper(
  filePath: string,
  systemUserId: number,
): Promise<"seeded" | "skipped"> {
  const fileName = path.basename(filePath);
  const rawContent = fs.readFileSync(filePath, "utf-8");

  // Idempotency: check by originalFileName + isDemo
  const [existing] = await db
    .select()
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.originalFileName, fileName),
        eq(documentsTable.isDemo, true),
      ),
    );

  if (existing) {
    console.log(`  SKIP  ${fileName} (already seeded, id=${existing.id})`);
    return "skipped";
  }

  const title = extractTitleFromMarkdown(rawContent) || fileName.replace(/\.md$/, "");
  const text = sanitiseText(rawContent);
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const pageCountEstimate = Math.max(1, Math.ceil(wordCount / 250));

  // Insert document
  const [doc] = await db
    .insert(documentsTable)
    .values({
      userId: systemUserId,
      title,
      originalFileName: fileName,
      sourceType: "paste",
      extractedText: text,
      wordCount,
      pageCountEstimate,
      status: "analysing",
      isDemo: true,
    })
    .returning();

  console.log(`  SEED  ${fileName} → doc id=${doc.id}, title="${title}"`);

  try {
    const result = await analyseDocument(text, "research_paper", "", "");
    const stored = packAnalysisForStorage(result);

    await db.insert(documentAnalysisTable).values({
      documentId: doc.id,
      briefSummary: stored.briefSummary,
      plainEnglishSummary: stored.plainEnglishSummary,
      documentType: stored.documentType,
      keyPoints: stored.keyPoints,
      keyFindings: stored.keyFindings,
      methodology: stored.methodology,
      limitations: stored.limitations,
      gotchas: stored.gotchas,
      conflictingInterests: stored.conflictingInterests,
      practicalApplications: stored.practicalApplications,
      unusualTerms: stored.unusualTerms,
      missingInfo: stored.missingInfo,
      questionsToAsk: stored.questionsToAsk,
      confidenceLevel: stored.confidenceLevel as "low" | "medium" | "high",
      confidenceNotes: stored.confidenceNotes,
      isDemo: true,
    });

    const extractedTitle = result.paperMetadata?.title?.trim();
    await db
      .update(documentsTable)
      .set({
        status: "completed",
        confidenceLevel: result.confidenceLevel as "low" | "medium" | "high",
        ...(extractedTitle ? { title: extractedTitle } : {}),
      })
      .where(eq(documentsTable.id, doc.id));

    await db.insert(usageEventsTable).values({
      userId: systemUserId,
      eventType: "document_analysed",
      documentId: doc.id,
    });

    console.log(`         ✓ analysis complete`);
    return "seeded";
  } catch (err) {
    await db
      .update(documentsTable)
      .set({ status: "failed" })
      .where(eq(documentsTable.id, doc.id));
    console.error(`         ✗ analysis failed:`, err);
    return "seeded"; // inserted but failed — won't be skipped next run since status=failed
  }
}

async function main() {
  if (!fs.existsSync(SEEDS_DIR)) {
    console.error(`Seeds directory not found: ${SEEDS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(SEEDS_DIR, f))
    .sort();

  if (files.length === 0) {
    console.log("No .md files found in seeds/papers/");
    process.exit(0);
  }

  console.log(`Found ${files.length} paper(s) in ${SEEDS_DIR}\n`);

  const systemUserId = await getOrCreateSystemUser();
  let seeded = 0;
  let skipped = 0;

  for (const file of files) {
    const outcome = await seedPaper(file, systemUserId);
    if (outcome === "seeded") seeded++;
    else skipped++;
  }

  console.log(`\nDone. Seeded: ${seeded}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
