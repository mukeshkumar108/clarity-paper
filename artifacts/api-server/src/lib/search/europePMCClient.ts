import { logger } from "../logger";
import type { RetrievedPaper } from "./types";

const BASE_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const MAX_RESULTS_PER_QUERY = 8;
const TIMEOUT_MS = 10_000;

interface EPMCArticle {
  id?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  abstractText?: string;
  authorString?: string;
  firstPublicationDate?: string; // "YYYY-MM-DD"
  citedByCount?: number;
  pubTypeList?: { pubType?: string[] };
  isOpenAccess?: "Y" | "N";
  fullTextUrlList?: {
    fullTextUrl?: Array<{ url?: string; documentStyle?: string; availability?: string }>;
  };
}

function extractYear(date?: string): number | null {
  if (!date) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return isNaN(y) ? null : y;
}

function parseAuthors(authorString?: string): string[] {
  if (!authorString) return [];
  return authorString
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

function openAccessPdfUrl(article: EPMCArticle): string | null {
  const urls = article.fullTextUrlList?.fullTextUrl ?? [];
  const pdf = urls.find(
    (u) => u.documentStyle === "pdf" && (u.availability === "Open access" || article.isOpenAccess === "Y"),
  );
  return pdf?.url ?? null;
}

function mapStudyType(pubTypes: string[] | undefined): string | null {
  if (!pubTypes || pubTypes.length === 0) return null;
  const types = pubTypes.map((t) => t.toLowerCase());
  if (types.some((t) => t.includes("meta-analysis"))) return "Meta-Analysis";
  if (types.some((t) => t.includes("systematic review"))) return "Systematic Review";
  if (types.some((t) => t.includes("randomized controlled trial") || t.includes("randomised controlled trial"))) return "Randomized Controlled Trial";
  if (types.some((t) => t.includes("clinical trial"))) return "Clinical Trial";
  if (types.some((t) => t.includes("review"))) return "Review";
  return pubTypes[0] ?? null;
}

function mapArticle(article: EPMCArticle, query: string): RetrievedPaper | null {
  const title = article.title?.trim();
  const abstract = article.abstractText?.trim();
  if (!title || !abstract || abstract.length < 50) return null;

  const doi = article.doi?.replace(/^https?:\/\/doi\.org\//i, "").trim() ?? null;
  const externalId = article.id ?? article.pmid ?? doi ?? title.slice(0, 40);

  return {
    doi,
    externalId: `epmc:${externalId}`,
    title,
    abstract,
    authors: parseAuthors(article.authorString),
    year: extractYear(article.firstPublicationDate),
    studyType: mapStudyType(article.pubTypeList?.pubType),
    isRetracted: false,
    citationCount: article.citedByCount ?? null,
    citationNormalizedPercentile: null,
    openAccessPdfUrl: openAccessPdfUrl(article),
    source: "europe_pmc",
    retrievedByQuery: [query],
    sources: ["europe_pmc"],
  };
}

export async function searchEuropePMC(query: string): Promise<RetrievedPaper[]> {
  const url = new URL(BASE_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("resulttype", "core");
  url.searchParams.set("pageSize", String(MAX_RESULTS_PER_QUERY));
  url.searchParams.set("cursorMark", "*");
  // Restrict to journal articles with abstracts
  url.searchParams.set("synonym", "TRUE");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn({ status: response.status, query }, "EuropePMC API error");
      return [];
    }

    const data = (await response.json()) as {
      resultList?: { result?: EPMCArticle[] };
    };

    const articles = data.resultList?.result ?? [];
    const papers: RetrievedPaper[] = [];
    for (const a of articles) {
      const mapped = mapArticle(a, query);
      if (mapped) papers.push(mapped);
    }
    return papers;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      logger.warn({ query }, "EuropePMC request timed out");
    } else {
      logger.warn({ err, query }, "EuropePMC fetch error");
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
