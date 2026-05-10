import { searchSemanticScholar } from "./semanticScholarClient";
import { searchOpenAlex } from "./openAlexClient";
import { searchEuropePMC } from "./europePMCClient";
import { searchCore } from "./coreClient";
import { deduplicatePapers } from "./dedupe";
import { logger } from "../logger";
import type { RetrievedPaper, ResearchPlan } from "./types";

const MIN_DIRECT_RESULTS_BEFORE_CONTEXT = 12;

async function runBatch(queries: string[]): Promise<RetrievedPaper[]> {
  const results = await Promise.allSettled([
    ...queries.map((q) => searchSemanticScholar(q)),
    ...queries.map((q) => searchOpenAlex(q)),
    ...queries.map((q) => searchEuropePMC(q)),
    ...queries.map((q) => searchCore(q)),
  ]);

  const papers: RetrievedPaper[] = [];
  let ssCount = 0, oaCount = 0, epmcCount = 0, coreCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const source = result.value[0]?.source;
      if (source === "semantic_scholar") ssCount += result.value.length;
      else if (source === "openalex") oaCount += result.value.length;
      else if (source === "europe_pmc") epmcCount += result.value.length;
      else if (source === "core") coreCount += result.value.length;
      papers.push(...result.value);
    } else {
      logger.warn({ reason: result.reason }, "Search source failed");
    }
  }

  if (papers.length > 0) {
    logger.debug({ ssCount, oaCount, epmcCount, coreCount, total: papers.length }, "Batch retrieval source breakdown");
  }

  return papers;
}

export async function retrievePapers(
  queryVariants: string[],
): Promise<RetrievedPaper[]> {
  // All variants run in a single Promise.allSettled — no sequential batching.
  // Each variant fans out to 3 sources inside runBatch, so N variants = 3N parallel requests.
  return runBatch(queryVariants);
}

function uniqueQueries(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function retrievePlannedPapers(
  plan: ResearchPlan,
): Promise<RetrievedPaper[]> {
  const directQueries = uniqueQueries(
    plan.directQueryVariants.length > 0 ? plan.directQueryVariants : plan.queryVariants,
  );
  const contextQueries = uniqueQueries(
    plan.contextQueryVariants.filter((query) => !directQueries.includes(query)),
  );

  const directPapers = await runBatch(directQueries);
  if (contextQueries.length === 0) {
    return directPapers;
  }

  const directCandidateCount = deduplicatePapers(directPapers).length;
  if (directCandidateCount >= MIN_DIRECT_RESULTS_BEFORE_CONTEXT) {
    logger.info(
      { directQueries: directQueries.length, directCandidateCount, contextQueriesSkipped: contextQueries.length },
      "Direct evidence lane sufficient — skipping broader context retrieval",
    );
    return directPapers;
  }

  const contextPapers = await runBatch(contextQueries);
  logger.info(
    {
      directQueries: directQueries.length,
      contextQueries: contextQueries.length,
      directCandidateCount,
      directPapers: directPapers.length,
      contextPapers: contextPapers.length,
    },
    "Expanded retrieval from direct evidence lane into broader context lane",
  );

  return [...directPapers, ...contextPapers];
}
