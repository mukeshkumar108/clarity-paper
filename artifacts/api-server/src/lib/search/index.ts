import { db, searchSessionsTable, paperCacheTable, searchSessionMessagesTable } from "@workspace/db";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { planResearch } from "./researchPlanner";
import { retrievePlannedPapers } from "./retrieval";
import { deduplicatePapers, filterGuidelineDocuments } from "./dedupe";
import { rerankByRelevance } from "./reranker";
import { applyTopicalVeto } from "./topicalVeto";
import { rankPapers, buildEvidenceSnapshot } from "./ranking";
import { synthesisePapers } from "./synthesizer";
import { checkRetractionStatus } from "./openAlexClient";
import { judgeRetrievalQuality, filterTopicallyWeakPapers } from "./retrievalJudge";
import { repairRetrieval } from "./queryRepair";
import { validateGrounding } from "./groundingValidator";
import { buildEvidenceSpans, computeSpanDiagnostics } from "./evidenceSpans";
import { detectContradictions } from "./contradictionDetector";
import { enrichWithUnpaywall } from "./unpaywallClient";
import { logger } from "../logger";
import type { SearchResult, SearchProgressEvent, RetrievedPaper, RankedPaper, DebugMetadata, PipelineLatency, EvidenceSpan, GroundingDiagnostics, RetrievalSourceCounts, SearchSessionDetail, SearchSessionMessage, SearchFocusState, ResearchPlan } from "./types";
import type { SynthesisOutput } from "./synthesizer";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RETRACTION_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24h
const SYNTHESIS_TIMEOUT_MS = 90_000; // 90s

// ─── Query result cache ───────────────────────────────────────────────────────
// In-memory cache keyed on normalised query string. Avoids re-running the full
// pipeline for repeated or near-identical queries within the TTL window.
// The sessionId is always generated fresh so user history remains correct.

const QUERY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CachedResult = Omit<SearchResult, "sessionId">;

interface QueryCacheEntry {
  result: CachedResult;
  cachedAt: number;
}

const queryCache = new Map<string, QueryCacheEntry>();

function normalizeQueryKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function getQueryCache(query: string): CachedResult | null {
  const key = normalizeQueryKey(query);
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > QUERY_CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return entry.result;
}

function setQueryCache(query: string, result: CachedResult): void {
  queryCache.set(normalizeQueryKey(query), { result, cachedAt: Date.now() });
  // Cap cache size at 200 entries — evict oldest on overflow
  if (queryCache.size > 200) {
    const oldest = queryCache.keys().next().value;
    if (oldest) queryCache.delete(oldest);
  }
}

function makeCacheKey(paper: RetrievedPaper): string {
  if (paper.doi) return `doi:${paper.doi.toLowerCase()}`;
  return `${paper.source}:${paper.externalId}`;
}

function deduplicateCacheUpserts(
  rows: typeof paperCacheTable.$inferInsert[],
): typeof paperCacheTable.$inferInsert[] {
  const unique = new Map<string, typeof paperCacheTable.$inferInsert>();
  for (const row of rows) {
    unique.set(row.cacheKey, row);
  }
  return [...unique.values()];
}

function countSources(papers: Array<RetrievedPaper | RankedPaper>): RetrievalSourceCounts {
  let semanticScholar = 0;
  let openAlex = 0;
  let europePmc = 0;
  let core = 0;

  for (const paper of papers) {
    if (paper.source === "semantic_scholar") semanticScholar++;
    else if (paper.source === "openalex") openAlex++;
    else if (paper.source === "europe_pmc") europePmc++;
    else if (paper.source === "core") core++;
  }

  return {
    semanticScholar,
    openAlex,
    europePmc,
    core,
    total: papers.length,
  };
}

async function hydratePapersFromCache(papers: RetrievedPaper[]): Promise<RetrievedPaper[]> {
  if (papers.length === 0) return papers;

  try {
    const staleThreshold = new Date(Date.now() - CACHE_TTL_MS);
    const keys = papers.map(makeCacheKey);

    // Batch fetch all cached rows in a single query
    const cachedRows = await db
      .select()
      .from(paperCacheTable)
      .where(inArray(paperCacheTable.cacheKey, keys));

    const cacheMap = new Map(cachedRows.map((r) => [r.cacheKey, r]));

    const result: RetrievedPaper[] = [];
    const upserts: typeof paperCacheTable.$inferInsert[] = [];

    for (const paper of papers) {
      const key = makeCacheKey(paper);
      const cached = cacheMap.get(key);

      if (cached && cached.cachedAt > staleThreshold) {
        result.push({
          ...paper,
          isRetracted: cached.isRetracted,
          citationNormalizedPercentile:
            cached.citationNormalizedPercentile ?? paper.citationNormalizedPercentile,
          openAccessPdfUrl: cached.openAccessPdfUrl ?? paper.openAccessPdfUrl,
        });
      } else {
        result.push(paper);
        upserts.push({
          cacheKey: key,
          doi: paper.doi,
          externalId: paper.externalId,
          source: paper.source,
          title: paper.title,
          abstract: paper.abstract,
          authors: paper.authors as any,
          year: paper.year,
          studyType: paper.studyType,
          isRetracted: paper.isRetracted,
          citationCount: paper.citationCount,
          citationNormalizedPercentile: paper.citationNormalizedPercentile,
          openAccessPdfUrl: paper.openAccessPdfUrl,
          cachedAt: new Date(),
        });
      }
    }

    // Batch upsert stale/missing rows (fire-and-forget — don't block search)
    if (upserts.length > 0) {
      const dedupedUpserts = deduplicateCacheUpserts(upserts);
      db.insert(paperCacheTable)
        .values(dedupedUpserts)
        .onConflictDoUpdate({
          target: paperCacheTable.cacheKey,
          set: {
            isRetracted: sql`excluded.is_retracted`,
            citationCount: sql`excluded.citation_count`,
            citationNormalizedPercentile: sql`excluded.citation_normalized_percentile`,
            openAccessPdfUrl: sql`excluded.open_access_pdf_url`,
            cachedAt: sql`excluded.cached_at`,
          },
        })
        .catch((err) => logger.warn({ err }, "Paper cache upsert failed — non-fatal"));
    }

    return result;
  } catch (err) {
    // If paper_cache table doesn't exist or any DB error — skip caching, return papers as-is
    logger.warn({ err }, "Paper cache unavailable — skipping cache layer");
    return papers;
  }
}

function applySummariesToPapers(
  papers: RankedPaper[],
  summaries: Array<{ externalId: string; summary: string }>,
): RankedPaper[] {
  const summaryMap = new Map(summaries.map((s) => [s.externalId, s.summary]));
  return papers.map((p) => ({
    ...p,
    plainSummary: summaryMap.get(p.externalId) ?? p.plainSummary,
  }));
}

async function refreshRetractionStatus(papers: RankedPaper[]): Promise<RankedPaper[]> {
  const staleThreshold = new Date(Date.now() - RETRACTION_FRESHNESS_MS);
  const candidates = papers.filter(
    (p) => p.evidenceBucket === "strongest" && p.doi,
  );

  if (candidates.length === 0) return papers;

  // Batch fetch cache timestamps for all candidates in one query
  const candidateKeys = candidates.map((p) => `doi:${p.doi!.toLowerCase()}`);
  const cachedRows = await db
    .select({ cacheKey: paperCacheTable.cacheKey, cachedAt: paperCacheTable.cachedAt })
    .from(paperCacheTable)
    .where(inArray(paperCacheTable.cacheKey, candidateKeys));
  const cacheTimestampMap = new Map(cachedRows.map((r) => [r.cacheKey, r.cachedAt]));

  const staleDois: string[] = [];
  for (const p of candidates) {
    const key = `doi:${p.doi!.toLowerCase()}`;
    const cachedAt = cacheTimestampMap.get(key);
    if (!cachedAt || cachedAt < staleThreshold) {
      staleDois.push(p.doi!);
    }
  }

  if (staleDois.length === 0) return papers;

  const updates = await Promise.allSettled(
    staleDois.map(async (doi) => {
      const isRetracted = await checkRetractionStatus(doi);
      return { doi, isRetracted };
    }),
  );

  const retractionMap = new Map<string, boolean>();
  for (const r of updates) {
    if (r.status === "fulfilled" && r.value.isRetracted !== null) {
      const normDoi = r.value.doi.toLowerCase();
      retractionMap.set(normDoi, r.value.isRetracted);
      await db
        .update(paperCacheTable)
        .set({ isRetracted: r.value.isRetracted, cachedAt: new Date() })
        .where(eq(paperCacheTable.cacheKey, `doi:${normDoi}`));
    }
  }

  if (retractionMap.size === 0) return papers;

  return papers.filter((p) => {
    const normDoi = p.doi?.toLowerCase();
    if (!normDoi) return true;
    const fresh = retractionMap.get(normDoi);
    if (fresh === true) {
      logger.warn({ doi: p.doi, title: p.title }, "Retraction detected via freshness check — paper removed");
      return false;
    }
    return true;
  });
}

function synthesisTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("synthesis_timeout")), ms),
  );
}

function fallbackSynthesis(): SynthesisOutput {
  return {
    synthesisText:
      "The evidence synthesis took longer than expected. The retrieved papers are shown below — please review them directly for information on your question.",
    openThreads: [],
    confidence: "preliminary",
    noEvidence: false,
    paperSummaries: [],
    followUpOptions: [],
  };
}

function buildDefaultFocusState(query: string, plan: ResearchPlan): SearchFocusState {
  const entityBadges = plan.entities.slice(0, 3);
  const summary =
    entityBadges.length > 0
      ? `This canvas is currently oriented around ${entityBadges.join(", ")}.`
      : `This canvas is currently oriented around ${query}.`;

  return {
    summary,
    badges: [plan.intentType.replace(/_/g, " "), ...entityBadges].slice(0, 5),
  };
}

function formatFocusStateFromMessages(
  query: string,
  plan: ResearchPlan,
  messages: Array<{
    role: string;
    kind: string;
    content: string;
    metadata?: SearchSessionMessage["metadata"];
  }>,
): SearchFocusState {
  const base = buildDefaultFocusState(query, plan);
  const lastAssistantWithMetadata = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.metadata);

  if (!lastAssistantWithMetadata?.metadata) {
    return base;
  }

  let lastActionLabel: string | undefined;
  if (lastAssistantWithMetadata.metadata.actionType === "answer_current_results") {
    lastActionLabel = "Stayed on current canvas";
  } else if (lastAssistantWithMetadata.metadata.actionType === "exhaustive_intent_transparency") {
    lastActionLabel = "Flagged curated scope";
  } else if (lastAssistantWithMetadata.metadata.actionType === "clarification_prompt") {
    lastActionLabel = "Suggested a narrowing move";
  } else if (lastAssistantWithMetadata.metadata.retrievalMode === "focused_retrieval") {
    lastActionLabel = "Ran focused retrieval";
  } else if (lastAssistantWithMetadata.metadata.retrievalMode === "reused_current_papers") {
    lastActionLabel = "Reused current papers";
  } else if (lastAssistantWithMetadata.metadata.canvasChanged) {
    lastActionLabel = "Refined current canvas";
  }

  return {
    summary: lastAssistantWithMetadata.metadata.focusSummary ?? base.summary,
    badges:
      lastAssistantWithMetadata.metadata.focusBadges &&
      lastAssistantWithMetadata.metadata.focusBadges.length > 0
        ? lastAssistantWithMetadata.metadata.focusBadges
        : base.badges,
    lastActionLabel,
    lastActionDetail: lastAssistantWithMetadata.content,
  };
}

export async function buildSearchResultFromPapers(
  query: string,
  plan: ResearchPlan,
  papers: RankedPaper[],
): Promise<Omit<SearchResult, "sessionId">> {
  const snapshot = buildEvidenceSnapshot(papers);
  const noEvidence = papers.length === 0;
  const synthesis = await synthesisePapers(plan, papers, snapshot);
  const papersWithSummaries = applySummariesToPapers(papers, synthesis.paperSummaries);
  const evidenceSpans = buildEvidenceSpans(
    synthesis.synthesisText,
    papersWithSummaries,
    plan.entities,
  );

  return {
    query,
    plan,
    synthesisText: synthesis.synthesisText,
    confidence: synthesis.confidence,
    noEvidence: synthesis.noEvidence || noEvidence,
    evidenceSnapshot: snapshot,
    papers: papersWithSummaries,
    followUpOptions: synthesis.followUpOptions,
    evidenceSpans,
    coverageNote: "abstracts_only",
  };
}

export async function overwriteSearchSession(
  sessionId: number,
  result: Omit<SearchResult, "sessionId">,
): Promise<void> {
  await db
    .update(searchSessionsTable)
    .set({
      query: result.query,
      plannerOutput: result.plan as any,
      papers: result.papers as any,
      synthesisText: result.synthesisText,
      confidence: result.confidence,
      evidenceSnapshot: result.evidenceSnapshot as any,
      followUpOptions: result.followUpOptions as any,
    })
    .where(eq(searchSessionsTable.id, sessionId));
}

export async function rerunSearchIntoExistingSession(
  userId: number,
  sessionId: number,
  query: string,
): Promise<Omit<SearchResult, "sessionId">> {
  const fresh = await runSearch(userId, query);

  await overwriteSearchSession(sessionId, {
    query: fresh.query,
    plan: fresh.plan,
    synthesisText: fresh.synthesisText,
    confidence: fresh.confidence,
    noEvidence: fresh.noEvidence,
    evidenceSnapshot: fresh.evidenceSnapshot,
    papers: fresh.papers,
    followUpOptions: fresh.followUpOptions,
    evidenceSpans: fresh.evidenceSpans,
    coverageNote: fresh.coverageNote,
    debugMetadata: fresh.debugMetadata,
  });

  if (fresh.sessionId && fresh.sessionId !== sessionId) {
    await db.delete(searchSessionsTable).where(eq(searchSessionsTable.id, fresh.sessionId));
  }

  const { sessionId: _newSessionId, ...withoutSessionId } = fresh;
  return withoutSessionId;
}

const MAX_SESSIONS_PER_USER = 50;

async function pruneOldSessions(userId: number): Promise<void> {
  const all = await db
    .select({ id: searchSessionsTable.id })
    .from(searchSessionsTable)
    .where(eq(searchSessionsTable.userId, userId))
    .orderBy(asc(searchSessionsTable.createdAt));

  if (all.length <= MAX_SESSIONS_PER_USER) return;

  const toDelete = all.slice(0, all.length - MAX_SESSIONS_PER_USER).map((r) => r.id);
  await db.delete(searchSessionsTable).where(inArray(searchSessionsTable.id, toDelete));
  logger.info({ userId, deleted: toDelete.length }, "Pruned old search sessions");
}

export async function runSearch(
  userId: number,
  query: string,
  onProgress?: (event: SearchProgressEvent) => void,
): Promise<SearchResult> {
  const searchStart = Date.now();
  logger.info({ userId, query }, "Search started");

  // ── Query cache check ──────────────────────────────────────────────────────
  const cached = getQueryCache(query);
  if (cached) {
    logger.info({ query }, "Query cache hit — emitting events and persisting session");
    // Emit progress events immediately so streaming clients get fast response
    onProgress?.({ type: "papers", papers: cached.papers, evidenceSnapshot: cached.evidenceSnapshot, noEvidence: cached.noEvidence });
    onProgress?.({ type: "synthesis", synthesisText: cached.synthesisText, confidence: cached.confidence, evidenceSpans: cached.evidenceSpans, followUpOptions: cached.followUpOptions, coverageNote: "abstracts_only" });
    // Still persist session so user history is correct
    let sessionId = 0;
    try {
      const [session] = await db
        .insert(searchSessionsTable)
        .values({
          userId,
          query,
          plannerOutput: cached.plan as any,
          papers: cached.papers as any,
          synthesisText: cached.synthesisText,
          confidence: cached.confidence,
          evidenceSnapshot: cached.evidenceSnapshot as any,
          followUpOptions: cached.followUpOptions as any,
        })
        .returning();
      sessionId = session.id;
      pruneOldSessions(userId).catch((err) => logger.warn({ err }, "Session pruning failed"));

      // Persist the initial synthesis as a message (canvas→chat: truth lives in messages)
      try {
        const spanDiag = computeSpanDiagnostics(cached.evidenceSpans);
        await db.insert(searchSessionMessagesTable).values({
          sessionId: session.id,
          role: "assistant",
          kind: "synthesis",
          content: cached.synthesisText,
          metadata: {
            confidence: cached.confidence,
            evidenceSnapshot: cached.evidenceSnapshot,
            evidenceSpanCount: cached.evidenceSpans.length,
            groundingDiagnostics: spanDiag,
            noEvidence: cached.noEvidence,
          },
        });
      } catch (msgErr) {
        logger.warn({ err: msgErr }, "Failed to persist cached synthesis message — non-fatal");
      }
    } catch (err) {
      logger.warn({ err }, "Failed to persist cached search session");
    }
    return { ...cached, sessionId };
  }

  // 1. Plan
  const t0 = Date.now();
  const plan = await planResearch(query);
  const planMs = Date.now() - t0;
  logger.info(
    {
      intentType: plan.intentType,
      responseLanguage: plan.responseLanguage,
      directVariants: plan.directQueryVariants.length,
      contextVariants: plan.contextQueryVariants.length,
      variants: plan.queryVariants.length,
    },
    "Research plan generated",
  );

  // 2. Retrieve
  const t1 = Date.now();
  const rawPapers = await retrievePlannedPapers(plan);
  const retrieveMs = Date.now() - t1;
  logger.info({ count: rawPapers.length }, "Papers retrieved");

  // 3. Hydrate with cache / update cache
  const hydratedPapers = await hydratePapersFromCache(rawPapers);
  const rawSourceCounts = countSources(hydratedPapers);

  // 4. Deduplicate + hard filter
  const t2 = Date.now();
  const deduplicatedRaw = deduplicatePapers(hydratedPapers);
  const deduplicated = filterGuidelineDocuments(deduplicatedRaw);
  const dedupeMs = Date.now() - t2;
  logger.info({ beforeFilter: deduplicatedRaw.length, afterFilter: deduplicated.length }, "Papers after dedup + guideline filter");
  const deduplicatedSourceCounts = countSources(deduplicated);

  // 4a. Cohere Rerank — semantic relevance scoring + soft filter for off-topic papers.
  // Runs after dedup so we don't waste rerank quota on duplicates. Fault-tolerant:
  // if reranker fails, papers get relevanceScore=0.5 and ranking proceeds unchanged.
  const rerankedDeduplicated = await rerankByRelevance(plan.normalizedEnglishQuestion, deduplicated);
  const vetoedDeduplicated = await applyTopicalVeto(
    plan,
    rankPapers(rerankedDeduplicated, plan),
  );

  // 5. Rank + bucket (evidence quality hierarchy; relevance used as within-bucket tie-breaker)
  const t3 = Date.now();
  const rankedPapers = filterTopicallyWeakPapers(
    vetoedDeduplicated,
    plan,
  );
  const rankMs = Date.now() - t3;

  // 5a. Retraction freshness check for top-ranked papers
  const freshRankedPapers = await refreshRetractionStatus(rankedPapers);

  // 5b. Retrieval quality judgment
  const t4 = Date.now();
  const judgment = judgeRetrievalQuality(freshRankedPapers, plan);
  const judgeMs = Date.now() - t4;
  logger.info(
    {
      quality: judgment.quality,
      qualityScore: judgment.qualityScore.total.toFixed(3),
      issues: judgment.issues.map((i) => `${i.severity}:${i.kind}`),
      shouldTriggerRepair: judgment.shouldTriggerRepair,
      triggerReason: judgment.triggerReason,
    },
    "Retrieval quality judgment",
  );

  // 5c. Bounded repair loop (max 1 iteration, only when judge says to trigger)
  let finalPapers = freshRankedPapers;
  let repairMs: number | null = null;
  let repairTriggered = false;
  let repairStrategy: string | null = null;
  let repairQueriesUsed: string[] = [];
  let repairTriggerReason: string | null = null;
  let originalQualityScore: number | null = null;
  let repairedQualityScore: number | null = null;
  let scoreImprovement: number | null = null;
  let keepRepairedReason: string | null = null;
  let paperCountBeforeRepair: number | null = null;
  let paperCountAfterRepair: number | null = null;

  if (judgment.shouldTriggerRepair) {
    logger.info(
      { triggerReason: judgment.triggerReason, issues: judgment.issues.map((i) => i.kind) },
      "Repair loop triggered",
    );
    const t5 = Date.now();
    paperCountBeforeRepair = freshRankedPapers.length;
    const repairResult = await repairRetrieval(freshRankedPapers, plan, judgment);
    finalPapers = repairResult.papers;
    repairQueriesUsed = repairResult.queriesUsed;
    repairStrategy = repairResult.strategy;
    originalQualityScore = repairResult.originalScore;
    repairedQualityScore = repairResult.repairedScore;
    scoreImprovement = repairedQualityScore - originalQualityScore;
    keepRepairedReason = repairResult.keepRepairedReason;
    repairMs = Date.now() - t5;
    repairTriggered = true;
    repairTriggerReason = judgment.triggerReason;
    paperCountAfterRepair = finalPapers.length;
    logger.info(
      {
        repairMs,
        strategy: repairStrategy,
        originalScore: originalQualityScore.toFixed(3),
        repairedScore: repairedQualityScore.toFixed(3),
        improvement: scoreImprovement.toFixed(3),
        paperCount: finalPapers.length,
        keepRepairedReason,
      },
      "Repair loop complete",
    );
  }

  const snapshot = buildEvidenceSnapshot(finalPapers);
  const noEvidence = finalPapers.length === 0;

  // Detect contradictions between top-fit papers
  const contradictions = detectContradictions(finalPapers);
  if (contradictions.length > 0) {
    logger.info(
      { count: contradictions.length },
      "Contradictions detected between papers",
    );
  }
  const finalSourceCounts = countSources(finalPapers);

  logger.info(
    { raw: rawSourceCounts, deduplicated: deduplicatedSourceCounts, final: finalSourceCounts },
    "Retrieval source counts",
  );

  // ── Papers ready — emit first streaming event ────────────────────────────
  // Clients receive paper cards immediately while synthesis LLM call runs.
  onProgress?.({ type: "papers", papers: finalPapers, evidenceSnapshot: snapshot, noEvidence });

  // 6. Synthesise (with timeout) + Unpaywall enrichment in parallel
  const t6 = Date.now();

  // Start Unpaywall enrichment alongside synthesis — hides network latency
  const unpaywallPromise = enrichWithUnpaywall(finalPapers).catch((err) => {
    logger.warn({ err }, "Unpaywall enrichment failed — skipping");
    return finalPapers;
  });

  let synthesis: SynthesisOutput;
  try {
    synthesis = await Promise.race([
      synthesisePapers(plan, finalPapers, snapshot, contradictions),
      synthesisTimeout(SYNTHESIS_TIMEOUT_MS),
    ]);
  } catch (err) {
    if ((err as Error).message === "synthesis_timeout") {
      logger.warn({ query }, "Synthesis timed out after 90s — using fallback");
      synthesis = fallbackSynthesis();
    } else {
      throw err;
    }
  }
  const synthesisMs = Date.now() - t6;
  logger.info({ confidence: synthesis.confidence, noEvidence: synthesis.noEvidence, synthesisMs }, "Synthesis complete");

  // Collect Unpaywall results (should already be done by now)
  const enrichedFinalPapers = await unpaywallPromise;

  // 7. Apply per-paper summaries from synthesizer (on OA-enriched papers)
  const papersWithSummaries = applySummariesToPapers(enrichedFinalPapers, synthesis.paperSummaries);

  // 8. Grounding validation
  const grounding = validateGrounding(synthesis.synthesisText, papersWithSummaries, snapshot);
  if (grounding.unsupportedNumericClaims > 0 || grounding.causalOverreach || grounding.studiesShowViolations > 0 || grounding.modelPriorLeakage > 0) {
    logger.warn(
      {
        unsupported: grounding.unsupportedNumericClaims,
        causalOverreach: grounding.causalOverreach,
        studiesShowViolations: grounding.studiesShowViolations,
        modelPriorLeakage: grounding.modelPriorLeakage,
      },
      "Grounding issues detected in synthesis",
    );
  }

  // 8a. Evidence span extraction — provenance for every synthesis claim
  const evidenceSpans: EvidenceSpan[] = buildEvidenceSpans(synthesis.synthesisText, papersWithSummaries, plan.entities);
  const groundingDiagnostics: GroundingDiagnostics = computeSpanDiagnostics(evidenceSpans);
  logger.debug(
    {
      totalClaims: groundingDiagnostics.totalClaims,
      claimsWithDirectSupport: groundingDiagnostics.claimsWithDirectSupport,
      claimsWithAnySupport: groundingDiagnostics.claimsWithAnySupport,
      avgSnippetConfidence: groundingDiagnostics.avgSnippetConfidence,
    },
    "Evidence span diagnostics",
  );

  // ── Synthesis ready — emit second streaming event ──────────────────────────
  onProgress?.({
    type: "synthesis",
    synthesisText: synthesis.synthesisText,
    confidence: synthesis.confidence,
    evidenceSpans,
    followUpOptions: synthesis.followUpOptions,
    coverageNote: "abstracts_only",
  });

  // 9. Build debug metadata
  const totalMs = Date.now() - searchStart;
  const latency: PipelineLatency = { planMs, retrieveMs, dedupeMs, rankMs, judgeMs, repairMs, synthesisMs, totalMs };
  const debugMetadata: DebugMetadata = {
    latency,
    retrievalJudgment: judgment,
    retrievalSourceCounts: {
      raw: rawSourceCounts,
      deduplicated: deduplicatedSourceCounts,
      final: finalSourceCounts,
    },
    repairTriggered,
    repairStrategy,
    repairQueriesUsed,
    repairTriggerReason,
    originalQualityScore,
    repairedQualityScore,
    scoreImprovement,
    keepRepairedReason,
    grounding,
    groundingDiagnostics,
    paperCountBeforeRepair,
    paperCountAfterRepair,
  };

  logger.info({ totalMs, quality: judgment.quality, repairTriggered }, "Search pipeline complete");

  // 10. Persist session (non-fatal — search results still returned if DB unavailable)
  let sessionId: number | null = null;
  try {
    const [session] = await db
      .insert(searchSessionsTable)
      .values({
        userId,
        query,
        plannerOutput: plan as any,
        papers: papersWithSummaries as any,
        synthesisText: synthesis.synthesisText,
        confidence: synthesis.confidence,
        evidenceSnapshot: snapshot as any,
        followUpOptions: synthesis.followUpOptions as any,
      })
      .returning();
    sessionId = session.id;
    logger.info({ sessionId: session.id }, "Search session saved");

    // Persist the initial synthesis as a message (canvas→chat: truth lives in messages)
    try {
      await db.insert(searchSessionMessagesTable).values({
        sessionId: session.id,
        role: "assistant",
        kind: "synthesis",
        content: synthesis.synthesisText,
        metadata: {
          confidence: synthesis.confidence,
          evidenceSnapshot: snapshot,
          evidenceSpanCount: evidenceSpans.length,
          groundingDiagnostics,
          noEvidence: synthesis.noEvidence,
        },
      });
    } catch (msgErr) {
      logger.warn({ err: msgErr }, "Failed to persist initial synthesis message — non-fatal");
    }

    // 11. Prune to 50 most recent sessions for this user (fire-and-forget)
    pruneOldSessions(userId).catch((err) =>
      logger.warn({ err, userId }, "Session pruning failed"),
    );
  } catch (err) {
    logger.warn({ err }, "Failed to persist search session — returning results anyway");
  }

  const searchResult: SearchResult = {
    sessionId: sessionId ?? 0,
    query,
    plan,
    synthesisText: synthesis.synthesisText,
    confidence: synthesis.confidence,
    noEvidence: synthesis.noEvidence || noEvidence,
    evidenceSnapshot: snapshot,
    papers: papersWithSummaries,
    followUpOptions: synthesis.followUpOptions,
    evidenceSpans,
    coverageNote: "abstracts_only" as const,
    debugMetadata,
  };

  // Populate query cache (exclude sessionId — always generated fresh)
  const { sessionId: _sid, ...cacheable } = searchResult;
  setQueryCache(query, cacheable);

  return searchResult;
}

export async function getSearchSession(
  sessionId: number,
  userId: number,
): Promise<SearchSessionDetail | null> {
  const [session] = await db
    .select()
    .from(searchSessionsTable)
    .where(
      and(
        eq(searchSessionsTable.id, sessionId),
        eq(searchSessionsTable.userId, userId),
      ),
    );

  if (!session) return null;

  const plan = session.plannerOutput as any;
  const papers = (session.papers as any[]) ?? [];
  const snapshot = session.evidenceSnapshot as any;
  const messages = await db
    .select()
    .from(searchSessionMessagesTable)
    .where(eq(searchSessionMessagesTable.sessionId, session.id))
    .orderBy(searchSessionMessagesTable.createdAt);

  // Re-build evidence spans from stored papers + synthesis text (entities from stored plan)
  const storedEntities: string[] = (plan as any).entities ?? [];
  const evidenceSpans = buildEvidenceSpans(session.synthesisText, papers as RankedPaper[], storedEntities);
  const normalizedMessages: SearchSessionMessage[] = messages.map((message) => ({
    id: message.id,
    sessionId: message.sessionId,
    role: message.role as SearchSessionMessage["role"],
    kind: message.kind as SearchSessionMessage["kind"],
    content: message.content,
    metadata: (message.metadata ?? {}) as SearchSessionMessage["metadata"],
    createdAt: message.createdAt.toISOString(),
  }));
  const focusState = formatFocusStateFromMessages(
    session.query,
    plan as ResearchPlan,
    normalizedMessages,
  );

  return {
    sessionId: session.id,
    query: session.query,
    plan,
    synthesisText: session.synthesisText,
    confidence: session.confidence,
    noEvidence: papers.length === 0,
    evidenceSnapshot: snapshot,
    papers,
    followUpOptions: (session.followUpOptions as any[]) ?? [],
    evidenceSpans,
    coverageNote: "abstracts_only" as const,
    messages: normalizedMessages,
    focusState,
  };
}

export async function listSearchSessions(userId: number) {
  const sessions = await db
    .select({
      id: searchSessionsTable.id,
      query: searchSessionsTable.query,
      confidence: searchSessionsTable.confidence,
      createdAt: searchSessionsTable.createdAt,
    })
    .from(searchSessionsTable)
    .where(eq(searchSessionsTable.userId, userId))
    .orderBy(searchSessionsTable.createdAt)
    .limit(20);

  return sessions.reverse();
}
