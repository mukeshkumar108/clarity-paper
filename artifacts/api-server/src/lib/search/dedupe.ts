import type { RetrievedPaper } from "./types";

const GUIDELINE_TITLE_PATTERNS = [
  /\bpractice\s+(guideline|guidance|parameter)\b/i,
  /\bclinical\s+(guideline|practice\s+guideline|recommendation)\b/i,
  /\bguideline\b.*\bmanagement\b/i,
  /\bconsensus\s+(statement|report|document)\b/i,
  /\bposition\s+(paper|statement)\b/i,
  /\bexpert\s+(panel|consensus|opinion)\b/i,
  /\brecommendation(s)?\s+for\b/i,
  // Society acronyms — match both compact (ASPEN) and period-separated (A.S.P.E.N.) forms
  /\bA\.?S\.?P\.?E\.?N\.?\b/,
  /\bAASLD\b/,
  /\bE\.?S\.?P\.?E\.?N\.?\b/,
  /\bSCCM\b/,    // Society of Critical Care Medicine
  /\bISCCM\b/,   // Indian Society of Critical Care Medicine
  /\bESCMID\b/,  // European Society of Clinical Microbiology
  /\bESCO\b/i,   // European Society of Clinical Oncology nutritional guidance
  /\bEASL\b/,    // European Association for Study of the Liver
  /\bACG\b.*\bguideline/i, // American College of Gastroenterology
  /\bAGA\b.*\bguideline/i, // American Gastroenterological Association
];

export function isGuidelineDocument(title: string): boolean {
  return GUIDELINE_TITLE_PATTERNS.some((p) => p.test(title));
}

export function filterGuidelineDocuments(papers: RetrievedPaper[]): RetrievedPaper[] {
  return papers.filter((p) => !isGuidelineDocument(p.title));
}

function normaliseDoi(doi: string | null): string | null {
  if (!doi) return null;
  return doi
    .toLowerCase()
    .replace(/^https?:\/\/doi\.org\//i, "")
    .trim();
}

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normaliseTitle(a);
  const nb = normaliseTitle(b);
  if (na === nb) return 1;

  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

function bestAbstract(a: string, b: string): string {
  return a.trim().length >= b.trim().length ? a : b;
}

function mergePapers(primary: RetrievedPaper, duplicate: RetrievedPaper): RetrievedPaper {
  const mergedSources = [...new Set([...primary.sources, ...duplicate.sources])];
  const mergedQueries = [...new Set([...primary.retrievedByQuery, ...duplicate.retrievedByQuery])];
  const abstract = bestAbstract(primary.abstract, duplicate.abstract);
  const hasGoodAbstract = abstract.trim().length > 50;
  return {
    ...primary,
    abstract,
    sources: mergedSources,
    retrievedByQuery: mergedQueries,
    citationNormalizedPercentile:
      primary.citationNormalizedPercentile ?? duplicate.citationNormalizedPercentile,
    openAccessPdfUrl: primary.openAccessPdfUrl ?? duplicate.openAccessPdfUrl,
    authors: primary.authors.length >= duplicate.authors.length ? primary.authors : duplicate.authors,
    year: primary.year ?? duplicate.year,
    limitedMetadata: !hasGoodAbstract || undefined,
  };
}

const MIN_ABSTRACT_LENGTH = 50;

export function deduplicatePapers(papers: RetrievedPaper[]): RetrievedPaper[] {
  // Remove retracted papers outright; keep short-abstract papers provisionally
  const filtered = papers.filter((p) => !p.isRetracted);

  const seen = new Map<string, RetrievedPaper>();

  for (const paper of filtered) {
    const doiKey = normaliseDoi(paper.doi);

    if (doiKey) {
      const existing = seen.get(`doi:${doiKey}`);
      if (existing) {
        seen.set(`doi:${doiKey}`, mergePapers(existing, paper));
      } else {
        const hasGoodAbstract = paper.abstract.trim().length > MIN_ABSTRACT_LENGTH;
        seen.set(`doi:${doiKey}`, { ...paper, limitedMetadata: !hasGoodAbstract || undefined });
      }
      continue;
    }

    // No DOI: check title similarity against existing entries
    let matched = false;
    for (const [key, existing] of seen.entries()) {
      if (titleSimilarity(paper.title, existing.title) >= 0.85) {
        seen.set(key, mergePapers(existing, paper));
        matched = true;
        break;
      }
    }

    if (!matched) {
      const hasGoodAbstract = paper.abstract.trim().length > MIN_ABSTRACT_LENGTH;
      seen.set(`id:${paper.externalId}`, { ...paper, limitedMetadata: !hasGoodAbstract || undefined });
    }
  }

  // After merging, drop papers that still lack a usable abstract AND have no DOI
  // (DOI-keyed papers with limited metadata are kept — they're identifiable)
  return Array.from(seen.values()).filter((p) => {
    if (p.abstract.trim().length > MIN_ABSTRACT_LENGTH) return true;
    return p.doi !== null; // keep if DOI-indexed even with thin abstract
  });
}
