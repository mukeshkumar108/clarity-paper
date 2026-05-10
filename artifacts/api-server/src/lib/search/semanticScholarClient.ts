import { logger } from "../logger";
import type { RetrievedPaper } from "./types";

const BASE_URL = "https://api.semanticscholar.org/graph/v1";
const FIELDS =
  "paperId,externalIds,title,abstract,authors,year,citationCount,publicationTypes,isOpenAccess,openAccessPdf";

const MAX_RESULTS_PER_QUERY = 8;
const TIMEOUT_MS = 8000;

// ─── Circuit-breaker state ────────────────────────────────────────────────────
// Tracks consecutive 429 responses. After OPEN_THRESHOLD failures the circuit
// opens and all SS calls short-circuit for COOLDOWN_MS, avoiding wasted
// network trips during rate-limit windows.

const OPEN_THRESHOLD = 3;     // consecutive 429s before opening
const COOLDOWN_MS = 120_000;  // 2 minutes open before trying again

let consecutiveFailures = 0;
let circuitOpenSince: number | null = null;

function isCircuitOpen(): boolean {
  if (circuitOpenSince === null) return false;
  if (Date.now() - circuitOpenSince > COOLDOWN_MS) {
    // Half-open: allow one probe through
    circuitOpenSince = null;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= OPEN_THRESHOLD && circuitOpenSince === null) {
    circuitOpenSince = Date.now();
    logger.warn(
      { consecutiveFailures, cooldownMs: COOLDOWN_MS },
      "Semantic Scholar circuit opened — skipping SS for cooldown period",
    );
  }
}

function recordSuccess(): void {
  if (consecutiveFailures > 0 || circuitOpenSince !== null) {
    logger.info("Semantic Scholar circuit reset — requests succeeding again");
  }
  consecutiveFailures = 0;
  circuitOpenSince = null;
}

export function getSsCircuitStatus(): { open: boolean; consecutiveFailures: number } {
  return { open: isCircuitOpen(), consecutiveFailures };
}

function getHeaders(): Record<string, string> {
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  return key ? { "x-api-key": key } : {};
}

interface SSPaper {
  paperId: string;
  externalIds?: { DOI?: string; [k: string]: string | undefined };
  title?: string;
  abstract?: string;
  authors?: Array<{ name: string }>;
  year?: number;
  citationCount?: number;
  publicationTypes?: string[];
  isOpenAccess?: boolean;
  openAccessPdf?: { url?: string } | null;
}

function mapPaper(paper: SSPaper, query: string): RetrievedPaper {
  const doi = paper.externalIds?.DOI ?? null;
  return {
    doi,
    externalId: paper.paperId,
    title: paper.title ?? "",
    abstract: paper.abstract ?? "",
    authors: (paper.authors ?? []).map((a) => a.name).filter(Boolean),
    year: paper.year ?? null,
    studyType: (paper.publicationTypes ?? []).join(",") || null,
    isRetracted: false,
    citationCount: paper.citationCount ?? null,
    citationNormalizedPercentile: null,
    openAccessPdfUrl: paper.openAccessPdf?.url ?? null,
    source: "semantic_scholar",
    retrievedByQuery: [query],
    sources: ["semantic_scholar"],
  };
}

export async function searchSemanticScholar(
  query: string,
): Promise<RetrievedPaper[]> {
  const url = new URL(`${BASE_URL}/paper/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(MAX_RESULTS_PER_QUERY));
  url.searchParams.set("fields", FIELDS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  if (isCircuitOpen()) {
    logger.debug({ query }, "Semantic Scholar circuit open — skipping request");
    clearTimeout(timer);
    return [];
  }

  try {
    const response = await fetch(url.toString(), {
      headers: getHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        recordFailure();
      }
      logger.warn(
        { status: response.status, query },
        "Semantic Scholar API error",
      );
      return [];
    }

    const data = (await response.json()) as {
      data?: SSPaper[];
      total?: number;
    };

    const papers = (data.data ?? [])
      .filter((p) => p.title && p.abstract)
      .map((p) => mapPaper(p, query));

    if (papers.length > 0) recordSuccess();
    return papers;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      logger.warn({ query }, "Semantic Scholar request timed out");
      recordFailure();
    } else {
      logger.warn({ err, query }, "Semantic Scholar fetch error");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
