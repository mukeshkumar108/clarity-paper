import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { runSearch, getSearchSession, listSearchSessions } from "../lib/search/index";
import { sanitiseText } from "../lib/documentExtraction";
import { analyseDocument } from "../lib/documentAnalysisService";
import { packAnalysisForStorage } from "../lib/analysisContract";
import { db, documentsTable, documentAnalysisTable, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /search — run a new search
router.post("/search", requireAuth, async (req, res): Promise<void> => {
  const { query } = req.body as { query?: string };

  if (!query || query.trim().length === 0) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  if (query.trim().length > 1000) {
    res.status(400).json({ error: "query must be under 1000 characters" });
    return;
  }

  try {
    const result = await runSearch(req.session.userId!, query.trim());
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Search failed");
    const message = err instanceof Error ? err.message : "Search failed";
    if (message === "DEMO_MODE") {
      res.status(503).json({ error: "Search requires an API key" });
    } else {
      res.status(500).json({ error: "Search failed. Please try again." });
    }
  }
});

// GET /search/sessions — list user's recent sessions
router.get("/search/sessions", requireAuth, async (req, res): Promise<void> => {
  try {
    const sessions = await listSearchSessions(req.session.userId!);
    res.json(sessions);
  } catch (err) {
    logger.error({ err }, "Failed to list search sessions");
    res.status(500).json({ error: "Failed to load search history" });
  }
});

// GET /search/sessions/:id — replay a cached session
router.get("/search/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  try {
    const session = await getSearchSession(id, req.session.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  } catch (err) {
    logger.error({ err, sessionId: id }, "Failed to load search session");
    res.status(500).json({ error: "Failed to load session" });
  }
});

// POST /search/analyse-paper — create a document from a search result and kick off analysis
router.post("/search/analyse-paper", requireAuth, async (req, res): Promise<void> => {
  const { doi, title, abstract, authors, year } = req.body as {
    doi?: string;
    title?: string;
    abstract?: string;
    authors?: string[];
    year?: number;
  };

  if (!title || !abstract) {
    res.status(400).json({ error: "title and abstract are required" });
    return;
  }

  const sanitised = sanitiseText(abstract);
  const wordCount = sanitised.trim().split(/\s+/).filter(Boolean).length;
  const authorString = (authors ?? []).slice(0, 5).join(", ");
  const yearStr = year ? ` (${year})` : "";
  const docTitle = `${title}${yearStr}`;
  const docGoal = [
    "From Clarity Search result.",
    authorString ? `Authors: ${authorString}.` : "",
    doi ? `DOI: ${doi}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const userId = req.session.userId!;

  try {
    const [doc] = await db
      .insert(documentsTable)
      .values({
        userId,
        title: docTitle,
        documentType: "research_paper",
        sourceType: "paste",
        extractedText: sanitised,
        wordCount,
        pageCountEstimate: Math.max(1, Math.ceil(wordCount / 250)),
        status: "analysing",
        isDemo: false,
        goal: docGoal,
      })
      .returning();

    res.status(201).json({ documentId: doc.id });

    // Fire background analysis in fast mode — abstracts are short, Gemini Flash
    // is more than adequate and completes in ~30-60s vs 3-5min for DeepSeek.
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const preferredLanguage = user?.preferredLanguage ?? "English";

    void (async () => {
      try {
        const result = await analyseDocument(
          sanitised,
          "research_paper",
          "",
          docGoal,
          preferredLanguage,
          { fastMode: true },
        );
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
          isDemo: result.isDemo,
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
        logger.info({ documentId: doc.id }, "Background analysis completed for search result");
      } catch (err) {
        logger.error({ err, documentId: doc.id }, "Background analysis failed for search result");
        await db
          .update(documentsTable)
          .set({ status: "failed" })
          .where(eq(documentsTable.id, doc.id));
      }
    })();
  } catch (err) {
    logger.error({ err }, "Failed to create document from search result");
    res.status(500).json({ error: "Failed to create document" });
  }
});

export default router;
