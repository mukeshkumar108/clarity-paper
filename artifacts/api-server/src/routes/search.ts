import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { runSearch, getSearchSession, listSearchSessions, buildSearchResultFromPapers, overwriteSearchSession, rerunSearchIntoExistingSession } from "../lib/search/index";
import type { SearchProgressEvent, RankedPaper, SearchSessionDetail } from "../lib/search/types";
import { sanitiseText } from "../lib/documentExtraction";
import { analyseDocument } from "../lib/documentAnalysisService";
import { packAnalysisForStorage } from "../lib/analysisContract";
import { db, documentsTable, documentAnalysisTable, usersTable, searchSessionMessagesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { orchestrateSidebarInput } from "../lib/search/sidebarOrchestrator";
import { planResearch } from "../lib/search/researchPlanner";
import { synthesiseFollowUpAnswer } from "../lib/search/synthesizer";
import { validateGrounding } from "../lib/search/groundingValidator";
import { buildEvidenceSpans, computeSpanDiagnostics } from "../lib/search/evidenceSpans";
import type { EvidenceSpan, GroundingDiagnostics } from "../lib/search/types";

const router: IRouter = Router();

function textForPaper(paper: RankedPaper): string {
  return `${paper.title} ${paper.abstract}`.toLowerCase();
}

function applyPaperFilters(
  session: SearchSessionDetail,
  filters: {
    population: "human" | "animal" | "in_vitro" | null;
    studyDesign: "meta_analysis" | "systematic_review" | "rct" | "cohort" | "cross_sectional" | null;
    evidenceBuckets: Array<"strongest" | "human_observational" | "mechanistic" | "background" | "conflicting">;
    keywordFocus: string[];
  },
): RankedPaper[] {
  return session.papers.filter((paper) => {
    if (filters.population && paper.populationType !== filters.population) return false;
    if (filters.studyDesign && paper.studyDesign !== filters.studyDesign) return false;
    if (filters.evidenceBuckets.length > 0 && !filters.evidenceBuckets.includes(paper.evidenceBucket)) return false;
    if (filters.keywordFocus.length > 0) {
      const haystack = textForPaper(paper);
      const hasKeyword = filters.keywordFocus.some((keyword) =>
        haystack.includes(keyword.toLowerCase()),
      );
      if (!hasKeyword) return false;
    }
    return true;
  });
}

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

// POST /search/stream — run a new search with SSE progressive results
// Emits: { type:"papers" } as soon as papers are ranked, then { type:"synthesis" }
// when the LLM synthesis completes, then { type:"done", sessionId } on save.
// Keeps the existing POST /search endpoint for backwards-compat (e.g. session loads).
router.post("/search/stream", requireAuth, async (req, res): Promise<void> => {
  const { query } = req.body as { query?: string };

  if (!query || query.trim().length === 0) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  if (query.trim().length > 1000) {
    res.status(400).json({ error: "query must be under 1000 characters" });
    return;
  }

  // SSE headers — X-Accel-Buffering disables nginx/Vercel proxy buffering
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (event: SearchProgressEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const result = await runSearch(req.session.userId!, query.trim(), write);
    write({ type: "done", sessionId: result.sessionId });
  } catch (err) {
    logger.error({ err }, "Streaming search failed");
    const message = err instanceof Error ? err.message : "Search failed";
    if (message === "DEMO_MODE") {
      write({ type: "error", message: "Search requires an API key" });
    } else {
      write({ type: "error", message: "Search failed. Please try again." });
    }
  } finally {
    res.end();
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

// POST /search/sessions/:id/messages — persist a structured sidebar refinement message
router.post("/search/sessions/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const { content } = req.body as { content?: string };

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  if (!content || content.trim().length === 0) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  if (content.trim().length > 2000) {
    res.status(400).json({ error: "content must be under 2000 characters" });
    return;
  }

  try {
    const session = await getSearchSession(id, req.session.userId!);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const trimmed = content.trim();
    
    // Step 1: Save user message immediately
    const [userMessage] = await db
      .insert(searchSessionMessagesTable)
      .values({
        sessionId: id,
        role: "user",
        kind: "refinement",
        content: trimmed,
        metadata: {
          canvasChanged: false,
        },
      })
      .returning();

    // Step 2: Orchestrator decides what to do and extracts user intent
    const action = await orchestrateSidebarInput(session, trimmed);
    
    let assistantContent: string;
    let assistantKind: "system" | "answer" | "clarification" | "canvas_update" = "answer";
    let canvasChanged = false;
    let retrievalPerformed = false;
    let papersBefore = session.papers.length;
    let papersAfter = papersBefore;
    
    // Step 3: Handle based on action type
    if (action.actionType === "clarification_prompt") {
      // Use orchestrator's reply for clarification questions
      assistantContent = action.assistantReply || "I need a bit more clarity to help you properly. Could you tell me more about what you're looking for?";
      assistantKind = "clarification";
      
    } else if (action.actionType === "exhaustive_intent_transparency") {
      // Use orchestrator's reply for scope transparency
      assistantContent = action.assistantReply || "I should be transparent about the scope of what we're exploring here.";
      assistantKind = "answer";
      
    } else if (action.actionType === "answer_current_results") {
      // Synthesize answer from CURRENT evidence (no new retrieval)
      assistantKind = "answer";
      canvasChanged = false;
      
      const synthesis = await synthesiseFollowUpAnswer({
        originalQuery: session.query,
        followUpQuestion: trimmed,
        userIntent: action.userIntent,
        existingPapers: session.papers,
        newPapers: [], // No new papers
        previousSynthesis: session.synthesisText,
        evidenceSnapshot: session.evidenceSnapshot,
      });

      // P0: Grounding validation on follow-up synthesis
      const grounding = validateGrounding(synthesis.synthesisText, session.papers, session.evidenceSnapshot);
      if (grounding.unsupportedNumericClaims > 0 || grounding.causalOverreach || grounding.studiesShowViolations > 0 || grounding.modelPriorLeakage > 0) {
        logger.warn({ unsupported: grounding.unsupportedNumericClaims, causalOverreach: grounding.causalOverreach, studiesShowViolations: grounding.studiesShowViolations, modelPriorLeakage: grounding.modelPriorLeakage }, "Grounding issues in follow-up (answer_current_results)");
      }
      const followUpEvidenceSpans = buildEvidenceSpans(synthesis.synthesisText, session.papers, session.plan.entities);
      const spanDiag = computeSpanDiagnostics(followUpEvidenceSpans);
      logger.debug({ totalClaims: spanDiag.totalClaims, claimsWithAnySupport: spanDiag.claimsWithAnySupport }, "Follow-up evidence span diagnostics (answer_current_results)");
      
      assistantContent = synthesis.synthesisText;
      
    } else {
      // refine_current_canvas or focused_retrieval_expansion - MAY need new evidence
      assistantKind = "canvas_update";
      
      let papersForSynthesis: RankedPaper[] = session.papers;
      let newPapers: RankedPaper[] = [];
      
      if (action.actionType === "refine_current_canvas" && action.reuseCurrentPapers) {
        // Just filter existing papers
        papersForSynthesis = applyPaperFilters(session, action.filters);
        
        if (papersForSynthesis.length === 0) {
          // Filtered to nothing - need to retrieve
          const effectiveQuery = action.refinedQuery?.trim() || `${session.query} ${trimmed}`;
          await rerunSearchIntoExistingSession(req.session.userId!, id, effectiveQuery);
          retrievalPerformed = true;
        }
      } else {
        // Need new retrieval
        const effectiveQuery = action.refinedQuery?.trim() || `${session.query} ${trimmed}`;
        await rerunSearchIntoExistingSession(req.session.userId!, id, effectiveQuery);
        retrievalPerformed = true;
      }
      
      // Get updated session after potential retrieval
      let updatedSessionForSynthesis = session;
      if (retrievalPerformed) {
        updatedSessionForSynthesis = await getSearchSession(id, req.session.userId!) || session;
        papersForSynthesis = updatedSessionForSynthesis.papers;
        papersAfter = papersForSynthesis.length;
        
        // Find which papers are new (not in original session)
        const originalPaperIds = new Set(session.papers.map(p => p.externalId));
        newPapers = papersForSynthesis.filter(p => !originalPaperIds.has(p.externalId));
      }
      
      canvasChanged = true;
      
      // Synthesize with delta context
      const synthesis = await synthesiseFollowUpAnswer({
        originalQuery: session.query,
        followUpQuestion: trimmed,
        userIntent: action.userIntent,
        existingPapers: session.papers,
        newPapers: newPapers,
        previousSynthesis: session.synthesisText,
        evidenceSnapshot: updatedSessionForSynthesis.evidenceSnapshot,
      });

      // P0: Grounding validation on follow-up synthesis
      const grounding = validateGrounding(synthesis.synthesisText, papersForSynthesis, updatedSessionForSynthesis.evidenceSnapshot);
      if (grounding.unsupportedNumericClaims > 0 || grounding.causalOverreach || grounding.studiesShowViolations > 0 || grounding.modelPriorLeakage > 0) {
        logger.warn({ unsupported: grounding.unsupportedNumericClaims, causalOverreach: grounding.causalOverreach, studiesShowViolations: grounding.studiesShowViolations, modelPriorLeakage: grounding.modelPriorLeakage }, "Grounding issues in follow-up (canvas_update)");
      }
      const followUpEvidenceSpans = buildEvidenceSpans(synthesis.synthesisText, papersForSynthesis, session.plan.entities);
      const spanDiag = computeSpanDiagnostics(followUpEvidenceSpans);
      logger.debug({ totalClaims: spanDiag.totalClaims, claimsWithAnySupport: spanDiag.claimsWithAnySupport }, "Follow-up evidence span diagnostics (canvas_update)");
      
      assistantContent = synthesis.synthesisText;
    }

    // Step 4: Save assistant message with synthesized content
    const [assistantMessage] = await db
      .insert(searchSessionMessagesTable)
      .values({
        sessionId: id,
        role: "assistant",
        kind: assistantKind,
        content: assistantContent,
        metadata: {
          canvasChanged,
          actionType: action.actionType,
          focusBadges: action.focusBadges,
          focusSummary: action.focusSummary,
          retrievalMode: action.retrievalMode ?? undefined,
          // Include retrieval delta info
          retrievalDelta: retrievalPerformed ? {
            papersBefore,
            papersAfter,
            newPaperCount: papersAfter - papersBefore,
          } : undefined,
        },
      })
      .returning();

    // Get final updated session
    const updatedSession = await getSearchSession(id, req.session.userId!);

    res.status(201).json({
      messages: [
        {
          id: userMessage.id,
          sessionId: userMessage.sessionId,
          role: userMessage.role,
          kind: userMessage.kind,
          content: userMessage.content,
          metadata: userMessage.metadata ?? {},
          createdAt: userMessage.createdAt.toISOString(),
        },
        {
          id: assistantMessage.id,
          sessionId: assistantMessage.sessionId,
          role: assistantMessage.role,
          kind: assistantMessage.kind,
          content: assistantMessage.content,
          metadata: assistantMessage.metadata ?? {},
          createdAt: assistantMessage.createdAt.toISOString(),
        },
      ],
      session: updatedSession,
    });
  } catch (err) {
    logger.error({ err, sessionId: id }, "Failed to persist search session message");
    res.status(500).json({ error: "Failed to save sidebar message" });
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
