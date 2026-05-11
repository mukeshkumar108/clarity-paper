import { Router, type IRouter } from "express";
import multer from "multer";
import { eq, and, or, desc } from "drizzle-orm";
import { db, usersTable, documentsTable, documentAnalysisTable, documentQuestionsTable, usageEventsTable } from "@workspace/db";
import { CreateDocumentBody, ListDocumentsQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { extractText, sanitiseText } from "../lib/documentExtraction";
import { analyseDocument, answerDocumentQuestion, type DocumentAnalysisTimings } from "../lib/documentAnalysisService";
import { getLimits } from "../lib/usageLimits";
import { logger } from "../lib/logger";
import { normalizeStoredAnalysis, packAnalysisForStorage } from "../lib/analysisContract";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Helper to get session user
async function getSessionUser(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user;
}

// Map DB row to API response shape
function mapDocument(doc: typeof documentsTable.$inferSelect) {
  return {
    id: doc.id,
    userId: doc.userId,
    title: doc.title,
    documentType: doc.documentType ?? null,
    originalFileName: doc.originalFileName ?? null,
    sourceType: doc.sourceType,
    extractedText: doc.extractedText ?? null,
    pageCountEstimate: doc.pageCountEstimate ?? null,
    wordCount: doc.wordCount ?? null,
    status: doc.status,
    isDemo: doc.isDemo,
    researchField: doc.researchField ?? null,
    goal: doc.goal ?? null,
    confidenceLevel: doc.confidenceLevel ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// List documents
router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const queryParsed = ListDocumentsQueryParams.safeParse(req.query);
  const filters = queryParsed.success ? queryParsed.data : {};

  let docs = await db
    .select()
    .from(documentsTable)
    .where(or(eq(documentsTable.userId, req.session.userId!), eq(documentsTable.isDemo, true)))
    .orderBy(desc(documentsTable.createdAt));

  if (filters.search) {
    const s = filters.search.toLowerCase();
    docs = docs.filter((d: any) => d.title.toLowerCase().includes(s));
  }
  if (filters.documentType) {
    docs = docs.filter((d: any) => d.documentType === filters.documentType);
  }
  if (filters.status) {
    docs = docs.filter((d: any) => d.status === filters.status);
  }

  res.json(docs.map(mapDocument));
});

// Create document (paste text)
router.post("/documents", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, text: rawText, documentType, researchField, goal } = parsed.data;
  const text = sanitiseText(rawText);
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const pageCountEstimate = Math.max(1, Math.ceil(wordCount / 250));

  const [doc] = await db
    .insert(documentsTable)
    .values({
      userId: req.session.userId!,
      title,
      documentType: documentType ?? null,
      sourceType: "paste",
      extractedText: text,
      wordCount,
      pageCountEstimate,
      status: "uploaded",
      isDemo: false,
      researchField: researchField ?? null,
      goal: goal ?? null,
    })
    .returning();

  res.status(201).json(mapDocument(doc));
});

// Get single document
router.get("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, id), or(eq(documentsTable.userId, req.session.userId!), eq(documentsTable.isDemo, true))));

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(mapDocument(doc));
});

// Delete document
router.delete("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [doc] = await db
    .delete(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.userId, req.session.userId!)))
    .returning();

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.sendStatus(204);
});

// Upload document file
router.post("/documents/upload", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const user = await getSessionUser(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  let extracted: { text: string; pageCountEstimate: number; wordCount: number; suggestedTitle?: string };
  try {
    extracted = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    res.status(400).json({ error: message });
    return;
  }

  const title = (req.body.title as string) || extracted.suggestedTitle || req.file.originalname;
  const documentType = (req.body.documentType as string) || null;
  const researchField = (req.body.researchField as string) || null;
  const goal = (req.body.goal as string) || null;

  const [doc] = await db
    .insert(documentsTable)
    .values({
      userId: user.id,
      title,
      documentType,
      originalFileName: req.file.originalname,
      sourceType: "upload",
      extractedText: extracted.text,
      wordCount: extracted.wordCount,
      pageCountEstimate: extracted.pageCountEstimate,
      status: "uploaded",
      isDemo: false,
      researchField,
      goal,
    })
    .returning();

  req.log.info({ documentId: doc.id, wordCount: extracted.wordCount }, "Document uploaded");
  res.status(201).json(mapDocument(doc));
});

// Extract title suggestion from file (pre-upload helper)
router.post("/documents/extract-title", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  try {
    const extracted = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ title: extracted.suggestedTitle || "" });
  } catch (err) {
    res.json({ title: "" }); // Silent failure, just return empty
  }
});

// Analyse document
router.post("/documents/:id/analyse", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const analyseStart = Date.now();
  let stepStart = Date.now();

  const user = await getSessionUser(req.session.userId!);
  const dbFetchUserMs = Date.now() - stepStart;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  stepStart = Date.now();
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.userId, user.id)));
  const dbFetchDocumentMs = Date.now() - stepStart;

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (!doc.extractedText) {
    res.status(400).json({ error: "Document has no text to analyse" });
    return;
  }

  // Check if already analysed. During active product iteration we always
  // regenerate so existing studies pick up the latest pipeline changes.
  stepStart = Date.now();
  const [existing] = await db
    .select()
    .from(documentAnalysisTable)
    .where(eq(documentAnalysisTable.documentId, id));
  const dbCheckExistingMs = Date.now() - stepStart;

  stepStart = Date.now();
  await db.update(documentsTable).set({ status: "analysing" }).where(eq(documentsTable.id, id));
  const dbUpdateAnalysingMs = Date.now() - stepStart;
  res.json({ status: "analysing", documentId: id });

  // Background pipeline — errors are caught internally and written to the DB.
  void (async () => {
    const bgStart = Date.now();
    const timings: Partial<DocumentAnalysisTimings> = {};
    try {
      const result = await analyseDocument(
        doc.extractedText!,
        doc.documentType ?? "",
        doc.researchField ?? "",
        doc.goal ?? "",
        user.preferredLanguage ?? "English",
        { timings },
      );
      const stored = packAnalysisForStorage(result);
      const analysisPayload = {
        documentId: id,
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
        isDemo: result.isDemo,
      };

      stepStart = Date.now();
      if (existing) {
        await db
          .update(documentAnalysisTable)
          .set(analysisPayload)
          .where(eq(documentAnalysisTable.documentId, id));
        logger.info({ documentId: id }, "Document analysis regenerated");
      } else {
        await db.insert(documentAnalysisTable).values(analysisPayload);
        logger.info({ documentId: id }, "Document analysis created");
      }
      const dbUpsertAnalysisMs = Date.now() - stepStart;

      const extractedTitle = result.paperMetadata?.title?.trim();
      stepStart = Date.now();
      await db
        .update(documentsTable)
        .set({
          status: "completed",
          confidenceLevel: result.confidenceLevel as "low" | "medium" | "high",
          ...(extractedTitle ? { title: extractedTitle } : {}),
        })
        .where(eq(documentsTable.id, id));
      const dbUpdateCompletedMs = Date.now() - stepStart;

      stepStart = Date.now();
      await db.insert(usageEventsTable).values({
        userId: user.id,
        eventType: "document_analysed",
        documentId: id,
      });
      const dbUsageEventMs = Date.now() - stepStart;

      logger.info({
        documentId: id,
        userId: user.id,
        timings: {
          dbFetchUserMs,
          dbFetchDocumentMs,
          dbCheckExistingMs,
          dbUpdateAnalysingMs,
          ...timings,
          dbUpsertAnalysisMs,
          dbUpdateCompletedMs,
          dbUsageEventMs,
          totalBackgroundMs: Date.now() - bgStart,
          totalRouteMs: Date.now() - analyseStart,
        },
      }, "Document analysis timing");
    } catch (err) {
      logger.error({
        err,
        documentId: id,
        userId: user.id,
        timings: {
          dbFetchUserMs,
          dbFetchDocumentMs,
          dbCheckExistingMs,
          dbUpdateAnalysingMs,
          ...timings,
          totalBackgroundMs: Date.now() - bgStart,
          totalRouteMs: Date.now() - analyseStart,
        },
        failedAtStage: timings.pass1LlmMs === undefined ? "pass1"
          : timings.pass2AttemptsMs === undefined ? "pass2"
          : timings.assemblyMs === undefined ? "assembly"
          : "db_write",
      }, "Background analysis failed");
      await db.update(documentsTable).set({ status: "failed" }).where(eq(documentsTable.id, id));
    }
  })();
});

// Get document analysis
router.get("/documents/:id/analysis", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, id), or(eq(documentsTable.userId, req.session.userId!), eq(documentsTable.isDemo, true))));

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const [analysis] = await db
    .select()
    .from(documentAnalysisTable)
    .where(eq(documentAnalysisTable.documentId, id));

  if (!analysis) {
    res.status(404).json({ error: "Analysis not found" });
    return;
  }

  const normalized = normalizeStoredAnalysis(
    {
      briefSummary: analysis.briefSummary,
      plainEnglishSummary: analysis.plainEnglishSummary,
      documentType: analysis.documentType,
      keyPoints: analysis.keyPoints,
      keyFindings: analysis.keyFindings,
      methodology: analysis.methodology,
      limitations: analysis.limitations,
      gotchas: analysis.gotchas,
      conflictingInterests: analysis.conflictingInterests,
      practicalApplications: analysis.practicalApplications,
      unusualTerms: analysis.unusualTerms,
      missingInfo: analysis.missingInfo,
      questionsToAsk: analysis.questionsToAsk,
      confidenceLevel: analysis.confidenceLevel,
      confidenceNotes: analysis.confidenceNotes,
    },
    analysis.documentType,
  );

  res.json({
    id: analysis.id,
    documentId: analysis.documentId,
    documentType: analysis.documentType,
    briefSummary: normalized.briefSummary,
    plainEnglishSummary: normalized.plainEnglishSummary,
    bottomLine: normalized.bottomLine,
    editorialView: normalized.editorialView,
    primarySummary: normalized.primarySummary,
    suggestedQuestions: normalized.suggestedQuestions,
    whatTheyActuallyStudied: normalized.whatTheyActuallyStudied,
    trustRating: normalized.trustRating,
    takeaway: normalized.takeaway,
    practicalRelevance: normalized.practicalRelevance,
    whatPaperActuallyShows: normalized.whatPaperActuallyShows,
    whatItDoesNotShow: normalized.whatItDoesNotShow,
    keyFindings: normalized.keyFindings,
    evidenceQuality: normalized.evidenceQuality,
    limitationsAndGotchas: normalized.limitationsAndGotchas,
    commonMisreadings: normalized.commonMisreadings,
    realWorldMeaning: normalized.realWorldMeaning,
    practicalUse: normalized.practicalUse,
    whoThisAppliesTo: normalized.whoThisAppliesTo,
    questionsToAskBeforeTrustingIt: normalized.questionsToAskBeforeTrustingIt,
    furtherReading: normalized.furtherReading,
    methodologySnapshot: normalized.methodologySnapshot,
    keyTerms: normalized.keyTerms,
    missingInfo: normalized.missingInfo,
    disclaimer: normalized.disclaimer,
    confidenceLevel: normalized.confidenceLevel,
    confidenceNotes: analysis.confidenceNotes ?? normalized.disclaimer,
    isDemo: analysis.isDemo,
    createdAt: analysis.createdAt,
  });
});

// List Q&A for document
router.get("/documents/:id/questions", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.id, id),
        or(eq(documentsTable.userId, req.session.userId!), eq(documentsTable.isDemo, true)),
      ),
    );

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const questions = await db
    .select()
    .from(documentQuestionsTable)
    .where(
      and(
        eq(documentQuestionsTable.documentId, id),
        eq(documentQuestionsTable.userId, req.session.userId!),
      ),
    )
    .orderBy(documentQuestionsTable.createdAt);

  res.json(questions);
});

// Ask a question
router.post("/documents/:id/questions", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const user = await getSessionUser(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.id, id),
        or(eq(documentsTable.userId, user.id), eq(documentsTable.isDemo, true)),
      ),
    );

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  const question = req.body?.question as string | undefined;
  if (!question || question.trim().length === 0) {
    res.status(400).json({ error: "Question is required" });
    return;
  }

  if (!doc.extractedText) {
    res.status(400).json({ error: "Document has no text to query" });
    return;
  }

  const [analysis] = await db
    .select()
    .from(documentAnalysisTable)
    .where(eq(documentAnalysisTable.documentId, id));

  const qaStart = Date.now();
  let answer: string;
  try {
    answer = await answerDocumentQuestion(
      doc.extractedText,
      question,
      analysis
        ? (() => {
            const normalized = normalizeStoredAnalysis(
              {
                briefSummary: analysis.briefSummary,
                plainEnglishSummary: analysis.plainEnglishSummary,
                documentType: analysis.documentType,
                keyPoints: analysis.keyPoints,
                keyFindings: analysis.keyFindings,
                methodology: analysis.methodology,
                limitations: analysis.limitations,
                gotchas: analysis.gotchas,
                conflictingInterests: analysis.conflictingInterests,
                practicalApplications: analysis.practicalApplications,
                unusualTerms: analysis.unusualTerms,
                missingInfo: analysis.missingInfo,
                questionsToAsk: analysis.questionsToAsk,
                confidenceLevel: analysis.confidenceLevel,
                confidenceNotes: analysis.confidenceNotes,
              },
              analysis.documentType,
            );

            return {
              documentType: analysis.documentType,
              briefSummary: normalized.bottomLine,
              plainEnglishSummary: normalized.realWorldMeaning.summary,
              gotchas: normalized.commonMisreadings.map((item) => ({
                title: item.misleadingClaim,
                explanation: item.whatThePaperSupports,
              })),
              missingInfo: normalized.missingInfo,
              questionsToAsk: normalized.questionsToAskBeforeTrustingIt,
            };
          })()
        : null,
      user.preferredLanguage ?? "English",
    );
  } catch (err) {
    const latencyMs = Date.now() - qaStart;
    const isTimeout = err instanceof Error && err.message.startsWith("LLM_TIMEOUT");
    logger.warn(
      { documentId: id, userId: user.id, latencyMs, err: (err as Error).message, isTimeout },
      "Q&A LLM call failed",
    );
    const fallbackAnswer = isTimeout
      ? "The answer took too long to generate. Please try again — shorter questions tend to work best."
      : "Something went wrong generating an answer. Please try again in a moment.";

    const [savedFailed] = await db
      .insert(documentQuestionsTable)
      .values({
        documentId: id,
        userId: user.id,
        question: question.trim(),
        answer: fallbackAnswer,
      })
      .returning();

    res.status(201).json(savedFailed);
    return;
  }

  const qaLatencyMs = Date.now() - qaStart;
  logger.info({ documentId: id, userId: user.id, latencyMs: qaLatencyMs }, "Q&A answered");

  const [savedQuestion] = await db
    .insert(documentQuestionsTable)
    .values({
      documentId: id,
      userId: user.id,
      question: question.trim(),
      answer,
    })
    .returning();

  // Record usage
  await db.insert(usageEventsTable).values({
    userId: user.id,
    eventType: "question_asked",
    documentId: id,
  });

  res.status(201).json(savedQuestion);
});

export default router;
