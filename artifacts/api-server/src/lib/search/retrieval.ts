import { searchSemanticScholar } from "./semanticScholarClient";
import { searchOpenAlex } from "./openAlexClient";
import { searchEuropePMC } from "./europePMCClient";
import { logger } from "../logger";
import type { RetrievedPaper } from "./types";

const MAX_CONCURRENT_QUERIES = 3;

async function runBatch(queries: string[]): Promise<RetrievedPaper[]> {
  const results = await Promise.allSettled([
    ...queries.map((q) => searchSemanticScholar(q)),
    ...queries.map((q) => searchOpenAlex(q)),
    ...queries.map((q) => searchEuropePMC(q)),
  ]);

  const papers: RetrievedPaper[] = [];
  let ssCount = 0, oaCount = 0, epmcCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const source = result.value[0]?.source;
      if (source === "semantic_scholar") ssCount += result.value.length;
      else if (source === "openalex") oaCount += result.value.length;
      else if (source === "europe_pmc") epmcCount += result.value.length;
      papers.push(...result.value);
    } else {
      logger.warn({ reason: result.reason }, "Search source failed");
    }
  }

  if (papers.length > 0) {
    logger.debug({ ssCount, oaCount, epmcCount, total: papers.length }, "Batch retrieval source breakdown");
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
