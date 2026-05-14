import type { RankedPaper } from "./types";

export interface Contradiction {
  paperA: {
    externalId: string;
    title: string;
    findingSummary: string;
  };
  paperB: {
    externalId: string;
    title: string;
    findingSummary: string;
  };
  /** What the papers disagree about */
  dimension: string;
  /** Why they might disagree (design, population, timing, measurement) */
  likelyReason: string;
}

const POSITIVE_LANGUAGE = [
  "significant improvement", "significant reduction", "significant increase",
  "significant decrease", "effective", "beneficial", "improved", "reduced",
  "superior", "greater", "better", "positive", "favorable",
];

const NULL_LANGUAGE = [
  "no significant", "did not improve", "did not affect", "did not reduce",
  "no difference", "no effect", "failed to", "not significant",
  "no evidence", "not associated",
];

function summarizeFinding(abstract: string, limit: number = 120): string {
  const sentences = abstract.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const hasSignal = POSITIVE_LANGUAGE.some((p) => s.toLowerCase().includes(p)) ||
      NULL_LANGUAGE.some((p) => s.toLowerCase().includes(p));
    if (hasSignal) return s.trim().slice(0, limit);
  }
  return sentences[0]?.trim().slice(0, limit) ?? "";
}

function isPositiveFinding(abstract: string): boolean {
  return POSITIVE_LANGUAGE.some((p) => abstract.toLowerCase().includes(p));
}

function isNullFinding(abstract: string): boolean {
  return NULL_LANGUAGE.some((p) => abstract.toLowerCase().includes(p));
}

function inferReason(paperA: RankedPaper, paperB: RankedPaper): string {
  if (paperA.studyDesign !== paperB.studyDesign) {
    return `different study designs (${paperA.studyDesign} vs ${paperB.studyDesign})`;
  }
  if (paperA.populationType !== paperB.populationType) {
    return `different populations (${paperA.populationType} vs ${paperB.populationType})`;
  }
  if (paperA.year && paperB.year && Math.abs(paperA.year - paperB.year) >= 5) {
    return `studies published ${Math.abs(paperA.year - paperB.year)} years apart`;
  }
  return "different study conditions or outcome measurements";
}

/**
 * Detect contradictions between pairs of papers in the ranked set.
 * Only checks papers with fit >= "adjacent" and in the same broad domain.
 */
export function detectContradictions(papers: RankedPaper[]): Contradiction[] {
  const candidates = papers.filter(
    (p) =>
      p.evidenceFit?.overall === "direct" ||
      p.evidenceFit?.overall === "adjacent",
  );

  const contradictions: Contradiction[] = [];
  const paired = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const pairKey = [a.externalId, b.externalId].sort().join("::");
      if (paired.has(pairKey)) continue;

      // Only flag if one paper is positive and the other is null/contradictory
      const aPositive = isPositiveFinding(a.abstract);
      const aNull = isNullFinding(a.abstract);
      const bPositive = isPositiveFinding(b.abstract);
      const bNull = isNullFinding(b.abstract);

      if ((aPositive && bNull) || (aNull && bPositive)) {
        paired.add(pairKey);
        contradictions.push({
          paperA: {
            externalId: a.externalId,
            title: a.title,
            findingSummary: summarizeFinding(a.abstract),
          },
          paperB: {
            externalId: b.externalId,
            title: b.title,
            findingSummary: summarizeFinding(b.abstract),
          },
          dimension: "direction of effect",
          likelyReason: inferReason(a, b),
        });
      }
    }
  }

  return contradictions.slice(0, 3);
}
