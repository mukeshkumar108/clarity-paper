import { logger } from "../logger";
import type { RetrievedPaper } from "./types";

const BASE_URL = "https://api.unpaywall.org/v2";
const TIMEOUT_MS = 5_000;
const MAX_ENRICH_PAPERS = 12;

function getEmail(): string {
  return process.env.UNPAYWALL_EMAIL ?? "research@clarity.app";
}

interface UnpaywallResponse {
  is_oa?: boolean;
  best_oa_location?: {
    url_for_pdf?: string | null;
    url?: string | null;
  } | null;
}

async function fetchOAUrl(doi: string): Promise<string | null> {
  const url = `${BASE_URL}/${encodeURIComponent(doi)}?email=${encodeURIComponent(getEmail())}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as UnpaywallResponse;
    if (!data.is_oa) return null;
    return data.best_oa_location?.url_for_pdf ?? data.best_oa_location?.url ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Enrich papers that have a DOI but no OA PDF URL via Unpaywall. Returns a new array preserving the input type. */
export async function enrichWithUnpaywall<T extends RetrievedPaper>(papers: T[]): Promise<T[]> {
  const needsEnrichment = papers
    .filter((p) => p.doi && !p.openAccessPdfUrl)
    .slice(0, MAX_ENRICH_PAPERS);

  if (needsEnrichment.length === 0) return papers;

  const results = await Promise.allSettled(
    needsEnrichment.map(async (p) => ({
      doi: p.doi!,
      url: await fetchOAUrl(p.doi!),
    })),
  );

  const urlMap = new Map<string, string>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.url) {
      urlMap.set(r.value.doi.toLowerCase(), r.value.url);
    }
  }

  if (urlMap.size === 0) return papers;

  logger.debug({ enriched: urlMap.size }, "Unpaywall enrichment: found OA URLs");

  return papers.map((p) => {
    if (!p.doi || p.openAccessPdfUrl) return p;
    const oaUrl = urlMap.get(p.doi.toLowerCase());
    return oaUrl ? { ...p, openAccessPdfUrl: oaUrl } : p;
  }) as T[];
}
