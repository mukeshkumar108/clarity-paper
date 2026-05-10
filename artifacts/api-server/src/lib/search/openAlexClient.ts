import { logger } from "../logger";
import type { RetrievedPaper } from "./types";

const BASE_URL = "https://api.openalex.org";
const MAX_RESULTS_PER_QUERY = 8;
const TIMEOUT_MS = 8000;

const SELECT_FIELDS = [
  "id",
  "doi",
  "title",
  "abstract_inverted_index",
  "authorships",
  "publication_year",
  "cited_by_count",
  "citation_normalized_percentile",
  "type",
  "is_retracted",
  "open_access",
].join(",");

function getEmail(): string {
  return process.env.OPENALEX_EMAIL ?? "research@clarity.app";
}

function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string {
  if (!invertedIndex) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

interface OAPaper {
  id: string;
  doi?: string | null;
  title?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
  publication_year?: number | null;
  cited_by_count?: number | null;
  citation_normalized_percentile?: { value?: number } | null;
  type?: string | null;
  is_retracted?: boolean | null;
  open_access?: { oa_url?: string | null; is_oa?: boolean } | null;
}

function normaliseDoi(rawDoi: string | null | undefined): string | null {
  if (!rawDoi) return null;
  return rawDoi.replace(/^https?:\/\/doi\.org\//i, "").trim() || null;
}

function mapPaper(paper: OAPaper, query: string): RetrievedPaper {
  const abstract = reconstructAbstract(paper.abstract_inverted_index);
  const doi = normaliseDoi(paper.doi);
  const oaUrl = paper.open_access?.oa_url ?? null;

  return {
    doi,
    externalId: paper.id,
    title: paper.title ?? "",
    abstract,
    authors: (paper.authorships ?? [])
      .map((a) => a.author?.display_name ?? "")
      .filter(Boolean),
    year: paper.publication_year ?? null,
    studyType: paper.type ?? null,
    isRetracted: paper.is_retracted ?? false,
    citationCount: paper.cited_by_count ?? null,
    citationNormalizedPercentile:
      paper.citation_normalized_percentile?.value ?? null,
    openAccessPdfUrl: oaUrl,
    source: "openalex",
    retrievedByQuery: [query],
    sources: ["openalex"],
  };
}

/** Lookup a single work by DOI to get a fresh is_retracted flag. Returns null on error. */
export async function checkRetractionStatus(doi: string): Promise<boolean | null> {
  const normDoi = normaliseDoi(doi);
  if (!normDoi) return null;

  const url = new URL(`${BASE_URL}/works/https://doi.org/${encodeURIComponent(normDoi)}`);
  url.searchParams.set("select", "is_retracted");
  url.searchParams.set("mailto", getEmail());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { is_retracted?: boolean | null };
    return data.is_retracted ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchOpenAlex(query: string): Promise<RetrievedPaper[]> {
  const url = new URL(`${BASE_URL}/works`);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(MAX_RESULTS_PER_QUERY));
  url.searchParams.set("select", SELECT_FIELDS);
  url.searchParams.set("mailto", getEmail());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, query },
        "OpenAlex API error",
      );
      return [];
    }

    const data = (await response.json()) as {
      results?: OAPaper[];
    };

    return (data.results ?? [])
      .filter((p) => p.title && p.abstract_inverted_index)
      .map((p) => mapPaper(p, query));
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      logger.warn({ query }, "OpenAlex request timed out");
    } else {
      logger.warn({ err, query }, "OpenAlex fetch error");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
