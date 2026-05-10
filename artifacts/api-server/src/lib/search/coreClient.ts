import { logger } from "../logger";
import type { RetrievedPaper } from "./types";

const BASE_URL = "https://api.core.ac.uk/v3/search/works/";
const MAX_RESULTS_PER_QUERY = 8;
const TIMEOUT_MS = 8000;
const OPEN_THRESHOLD = 2;
const COOLDOWN_MS = 120_000;

let consecutiveFailures = 0;
let circuitOpenSince: number | null = null;

interface CoreAuthor {
  name?: string | null;
}

interface CoreWork {
  id?: number | string | null;
  doi?: string | null;
  title?: string | null;
  abstract?: string | null;
  authors?: CoreAuthor[] | null;
  yearPublished?: number | null;
  citationCount?: number | null;
  downloadUrl?: string | null;
  documentType?: string | null;
}

interface CoreSearchResponse {
  results?: CoreWork[];
}

function isCircuitOpen(): boolean {
  if (circuitOpenSince === null) return false;
  if (Date.now() - circuitOpenSince > COOLDOWN_MS) {
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
      "CORE circuit opened — skipping CORE for cooldown period",
    );
  }
}

function recordSuccess(): void {
  if (consecutiveFailures > 0 || circuitOpenSince !== null) {
    logger.info("CORE circuit reset — requests succeeding again");
  }
  consecutiveFailures = 0;
  circuitOpenSince = null;
}

function getHeaders(): Record<string, string> {
  const apiKey = process.env.CORE_API_KEY;
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function normaliseDoi(rawDoi: string | null | undefined): string | null {
  if (!rawDoi) return null;
  return rawDoi.replace(/^https?:\/\/doi\.org\//i, "").trim() || null;
}

function mapWork(work: CoreWork, query: string): RetrievedPaper | null {
  const title = work.title?.trim();
  const abstract = work.abstract?.trim();
  if (!title || !abstract || abstract.length < 50) return null;

  return {
    doi: normaliseDoi(work.doi),
    externalId: `core:${String(work.id ?? title.slice(0, 40))}`,
    title,
    abstract,
    authors: (work.authors ?? []).map((a) => a.name?.trim() ?? "").filter(Boolean),
    year: work.yearPublished ?? null,
    studyType: work.documentType ?? null,
    isRetracted: false,
    citationCount: work.citationCount ?? null,
    citationNormalizedPercentile: null,
    openAccessPdfUrl: work.downloadUrl ?? null,
    source: "core",
    retrievedByQuery: [query],
    sources: ["core"],
  };
}

export async function searchCore(query: string): Promise<RetrievedPaper[]> {
  if (isCircuitOpen()) {
    logger.debug({ query }, "CORE circuit open — skipping request");
    return [];
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(MAX_RESULTS_PER_QUERY));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: getHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        recordFailure();
      }
      logger.warn({ status: response.status, query }, "CORE API error");
      return [];
    }

    const data = (await response.json()) as CoreSearchResponse;
    const papers = (data.results ?? []).map((work) => mapWork(work, query)).filter(Boolean) as RetrievedPaper[];
    if (papers.length > 0) {
      recordSuccess();
    }
    return papers;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      logger.warn({ query }, "CORE request timed out");
      recordFailure();
    } else {
      logger.warn({ err, query }, "CORE fetch error");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
