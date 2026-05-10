import { logger } from "../logger";

// Cohere Rerank 4 Fast via OpenRouter — adds semantic relevance scoring to the
// paper set after deduplication. Evidence bucket hierarchy is unchanged; relevance
// is used as a within-bucket tie-breaker and as a soft filter for clearly
// off-topic papers (relevance < LOW_RELEVANCE_THRESHOLD).
//
// Override model via OPENROUTER_RERANK_MODEL. Set to "disabled" to skip entirely.
// Cost: ~$0.002 per search for up to 50 papers.

const RERANK_MODEL =
  process.env.OPENROUTER_RERANK_MODEL ?? "cohere/rerank-4-fast";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Papers below this score are discarded — they're semantically unrelated to the
// query even if their evidence quality is high. Kept low to avoid false negatives.
const LOW_RELEVANCE_THRESHOLD = 0.08;
const LOW_RELEVANCE_TEXT_GUARD_THRESHOLD = 0.12;
const QUERY_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "what", "when",
  "where", "which", "does", "actually", "help", "helps", "real", "hype", "how",
  "about", "effects", "benefits", "benefit", "impact", "health", "paper", "papers",
  "study", "studies",
]);

interface RerankApiResult {
  index: number;
  relevance_score: number;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !QUERY_STOPWORDS.has(token));
}

function hasMeaningfulQueryOverlap(
  queryTokens: string[],
  title: string,
  abstract: string,
): boolean {
  if (queryTokens.length === 0) return true;
  const text = `${title} ${abstract}`.toLowerCase();
  return queryTokens.some((token) => text.includes(token));
}

export async function rerankByRelevance<
  T extends { title: string; abstract: string },
>(
  query: string,
  papers: T[],
): Promise<Array<T & { relevanceScore: number }>> {
  if (papers.length === 0) {
    return [];
  }

  if (!OPENROUTER_API_KEY || RERANK_MODEL === "disabled") {
    return papers.map((p) => ({ ...p, relevanceScore: 0.5 }));
  }

  try {
    const queryTokens = tokenizeQuery(query);
    const documents = papers.map(
      (p) => `${p.title}\n${p.abstract.slice(0, 800)}`,
    );

    const response = await fetch(`${OPENROUTER_BASE_URL}/rerank`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://clarity-paper.vercel.app",
        "X-Title": "Clarity Paper",
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents,
        top_n: papers.length,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Rerank API ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as { results: RerankApiResult[] };
    const scoreMap = new Map(
      data.results.map((r) => [r.index, r.relevance_score]),
    );

    const withScores = papers.map((p, i) => ({
      ...p,
      relevanceScore: scoreMap.get(i) ?? 0.5,
    }));

    const before = withScores.length;
    const filtered = withScores.filter((p) => {
      if (p.relevanceScore < LOW_RELEVANCE_THRESHOLD) {
        return false;
      }

      if (
        p.relevanceScore < LOW_RELEVANCE_TEXT_GUARD_THRESHOLD &&
        !hasMeaningfulQueryOverlap(queryTokens, p.title, p.abstract)
      ) {
        return false;
      }

      return true;
    });
    const removed = before - filtered.length;

    logger.info(
      { model: RERANK_MODEL, papersIn: before, papersOut: filtered.length, removed },
      "Cohere rerank complete",
    );

    return filtered;
  } catch (err) {
    logger.warn({ err }, "Cohere rerank failed — skipping, returning unfiltered papers");
    return papers.map((p) => ({ ...p, relevanceScore: 0.5 }));
  }
}
