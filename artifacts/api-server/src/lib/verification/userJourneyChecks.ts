import type { RankedPaper } from "../search/types";

export interface SearchJourneyExpectation {
  requiredTerms: string[];
  requiredTitleTerms?: string[];
  forbiddenTerms?: string[];
  minMatchingTopPapers?: number;
  topPaperWindow?: number;
}

export interface CheckResult {
  ok: boolean;
  failures: string[];
}

function normalize(text: string): string {
  return text.toLowerCase();
}

function includesAny(text: string, terms: string[]): boolean {
  const normalizedText = normalize(text);
  return terms.some((term) => normalizedText.includes(term.toLowerCase()));
}

export function checkSearchRelevance(
  papers: RankedPaper[],
  expectation: SearchJourneyExpectation,
): CheckResult {
  const failures: string[] = [];
  const topWindow = expectation.topPaperWindow ?? 5;
  const minMatching = expectation.minMatchingTopPapers ?? Math.min(3, topWindow);
  const topPapers = papers.slice(0, topWindow);

  if (topPapers.length === 0) {
    return { ok: false, failures: ["No papers returned."] };
  }

  const matchingCount = topPapers.filter((paper) =>
    includesAny(`${paper.title} ${paper.abstract}`, expectation.requiredTerms),
  ).length;

  if (matchingCount < minMatching) {
    failures.push(
      `Only ${matchingCount}/${topPapers.length} top papers matched required terms: ${expectation.requiredTerms.join(", ")}.`,
    );
  }

  if (expectation.requiredTitleTerms?.length) {
    const titleMatchCount = topPapers.filter((paper) =>
      includesAny(paper.title, expectation.requiredTitleTerms!),
    ).length;

    if (titleMatchCount < minMatching) {
      failures.push(
        `Only ${titleMatchCount}/${topPapers.length} top paper titles matched required title terms: ${expectation.requiredTitleTerms.join(", ")}.`,
      );
    }
  }

  if (expectation.forbiddenTerms?.length) {
    const offending = topPapers.find((paper) =>
      includesAny(paper.title, expectation.forbiddenTerms!),
    );
    if (offending) {
      failures.push(
        `Top paper set included an off-topic title: "${offending.title}".`,
      );
    }
  }

  return { ok: failures.length === 0, failures };
}

export function checkFriendlyQaAnswer(answer: string): CheckResult {
  const failures: string[] = [];
  const trimmed = answer.trim();

  if (!trimmed) {
    return { ok: false, failures: ["Answer was empty."] };
  }

  const lower = trimmed.toLowerCase();
  const sentenceCount = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;

  if (sentenceCount < 2 || sentenceCount > 6) {
    failures.push(`Expected 2-6 sentences, got ${sentenceCount}.`);
  }

  if (/^(great|good|interesting)\s+question\b/i.test(trimmed)) {
    failures.push('Answer opens with "Great question" style phrasing.');
  }

  if (/\b(notably|importantly|furthermore)\b/i.test(trimmed)) {
    failures.push('Answer uses banned academic transition language.');
  }

  if (/^\s*[-*]\s+/m.test(trimmed)) {
    failures.push("Answer contains bullet formatting.");
  }

  if (/^\s*#{1,6}\s+/m.test(trimmed)) {
    failures.push("Answer contains markdown headers.");
  }

  if (/\[(doc|general)\]/i.test(trimmed)) {
    failures.push("Answer leaked provenance labels.");
  }

  if (/\bas an ai\b/i.test(lower)) {
    failures.push('Answer contains "as an AI" style phrasing.');
  }

  if (/\bstatistically significant\b/i.test(lower)) {
    failures.push('Answer sounds too academic ("statistically significant").');
  }

  return { ok: failures.length === 0, failures };
}
