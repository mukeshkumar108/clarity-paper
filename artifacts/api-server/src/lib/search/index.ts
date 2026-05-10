import { db, searchSessionsTable, paperCacheTable } from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { planResearch } from "./researchPlanner";
import { retrievePapers } from "./retrieval";
import { deduplicatePapers, filterGuidelineDocuments } from "./dedupe";
import { rankPapers, buildEvidenceSnapshot } from "./ranking";
import { synthesisePapers } from "./synthesizer";
import { checkRetractionStatus } from "./openAlexClient";
import { judgeRetrievalQuality } from "./retrievalJudge";
import { repairRetrieval } from "./queryRepair";
import { validateGrounding } from "./groundingValidator";
import { buildEvidenceSpans, computeSpanDiagnostics } from "./evidenceSpans";
import { enrichWithUnpaywall } from "./unpaywallClient";
import { logger } from "../logger";
import type { SearchResult, RetrievedPaper, RankedPaper, DebugMetadata, PipelineLatency, EvidenceSpan, GroundingDiagnostics } from "./types";
import type { SynthesisOutput } from "./synthesizer";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RETRACTION_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24h
const SYNTHESIS_TIMEOUT_MS = 90_000; // 90s

function makeCacheKey(paper: RetrievedPaper): string {
  if (paper.doi) return `doi:${paper.doi.toLowerCase()}`;
  return `${paper.source}:${paper.externalId}`;
}

async function hydratePapersFromCache(papers: RetrievedPaper[]): Promise<RetrievedPaper[]> {
  const staleThreshold = new Date(Date.now() - CACHE_TTL_MS);

  const result: RetrievedPaper[] = [];
  for (const paper of papers) {
    const key = makeCacheKey(paper);

    const [cached] = await db
      .select()
      .from(paperCacheTable)
      .where(eq(paperCacheTable.cacheKey, key));

    if (cached && cached.cachedAt > staleThreshold) {
      result.push({
        ...paper,
        isRetracted: cached.isRetracted,
        citationNormalizedPercentile:
          cached.citationNormalizedPercentile ?? paper.citationNormalizedPercentile,
        openAccessPdfUrl: cached.openAccessPdfUrl ?? paper.openAccessPdfUrl,
      });
    } else {
      await db
        .insert(paperCacheTable)
        .values({
          cacheKey: key,
          doi: paper.doi,
          externalId: paper.externalId,
          source: paper.source,
          title: paper.title,
          abstract: paper.abstract,
          authors: paper.authors,
          year: paper.year,
          studyType: paper.studyType,
          isRetracted: paper.isRetracted,
          citationCount: paper.citationCount,
          citationNormalizedPercentile: paper.citationNormalizedPercentile,
          openAccessPdfUrl: paper.openAccessPdfUrl,
          cachedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: paperCacheTable.cacheKey,
          set: {
            isRetracted: paper.isRetracted,
            citationCount: paper.citationCount,
            citationNormalizedPercentile: paper.citationNormalizedPercentile,
            openAccessPdfUrl: paper.openAccessPdfUrl,
            cachedAt: new Date(),
          },
        });

      result.push(paper);
    }
  }
  return result;
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

  const staleDois: string[] = [];
  for (const p of candidates) {
    const key = `doi:${p.doi!.toLowerCase()}`;
    const [cached] = await db
      .select({ cachedAt: paperCacheTable.cachedAt })
      .from(paperCacheTable)
      .where(eq(paperCacheTable.cacheKey, key));
    if (!cached || cached.cachedAt < staleThreshold) {
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
    confidence: "preliminary",
    noEvidence: false,
    paperSummaries: [],
    followUpOptions: [],
  };
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
): Promise<SearchResult> {
  const searchStart = Date.now();
  logger.info({ userId, query }, "Search started");

  // 1. Plan
  const t0 = Date.now();
  const plan = await planResearch(query);
  const planMs = Date.now() - t0;
  logger.info({ intentType: plan.intentType, variants: plan.queryVariants.length }, "Research plan generated");

  // 2. Retrieve
  const t1 = Date.now();
  const rawPapers = await retrievePapers(plan.queryVariants);
  const retrieveMs = Date.now() - t1;
  logger.info({ count: rawPapers.length }, "Papers retrieved");

  // 3. Hydrate with cache / update cache
  const hydratedPapers = await hydratePapersFromCache(rawPapers);

  // 4. Deduplicate + hard filter
  const t2 = Date.now();
  const deduplicatedRaw = deduplicatePapers(hydratedPapers);
  const deduplicated = filterGuidelineDocuments(deduplicatedRaw);
  const dedupeMs = Date.now() - t2;
  logger.info({ beforeFilter: deduplicatedRaw.length, afterFilter: deduplicated.length }, "Papers after dedup + guideline filter");

  // 5. Rank + bucket
  const t3 = Date.now();
  const rankedPapers = rankPapers(deduplicated, plan.entities);
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

  // 6. Synthesise (with timeout) + Unpaywall enrichment in parallel
  const t6 = Date.now();
  const noEvidence = finalPapers.length === 0;

  // Start Unpaywall enrichment alongside synthesis — hides network latency
  const unpaywallPromise = enrichWithUnpaywall(finalPapers).catch((err) => {
    logger.warn({ err }, "Unpaywall enrichment failed — skipping");
    return finalPapers;
  });

  let synthesis: SynthesisOutput;
  try {
    synthesis = await Promise.race([
      synthesisePapers(plan, finalPapers, snapshot),
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

  // 9. Build debug metadata
  const totalMs = Date.now() - searchStart;
  const latency: PipelineLatency = { planMs, retrieveMs, dedupeMs, rankMs, judgeMs, repairMs, synthesisMs, totalMs };
  const debugMetadata: DebugMetadata = {
    latency,
    retrievalJudgment: judgment,
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

  // 10. Persist session
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

  logger.info({ sessionId: session.id }, "Search session saved");

  // 11. Prune to 50 most recent sessions for this user (fire-and-forget)
  pruneOldSessions(userId).catch((err) =>
    logger.warn({ err, userId }, "Session pruning failed"),
  );

  return {
    sessionId: session.id,
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
}

export async function getSearchSession(
  sessionId: number,
  userId: number,
): Promise<SearchResult | null> {
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

  // Re-build evidence spans from stored papers + synthesis text (entities from stored plan)
  const storedEntities: string[] = (plan as any).entities ?? [];
  const evidenceSpans = buildEvidenceSpans(session.synthesisText, papers as RankedPaper[], storedEntities);

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
