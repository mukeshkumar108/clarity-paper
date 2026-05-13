import type { RetrievedPaper, RankedPaper, StudyDesign, PopulationType, EvidenceBucket, EvidenceSnapshot, ResearchPlan } from "./types";
import { classifyStudyDesign, classifyPopulationType, looksConflicting } from "./evidenceClassifier";
import { evaluateEvidenceFit } from "./evidenceFit";

const DESIGN_SCORES: Record<StudyDesign, number> = {
  meta_analysis: 1.0,
  systematic_review: 0.95,
  rct: 0.80,
  cohort: 0.55,
  cross_sectional: 0.40,
  case_report: 0.15,
  editorial: 0.05,
  unknown: 0.35,
};

const POPULATION_SCORES: Record<PopulationType, number> = {
  human: 1.0,
  animal: 0.3,
  in_vitro: 0.1,
  unknown: 0.5,
};

function recencyScore(year: number | null): number {
  if (!year) return 0.5;
  const yearsOld = Math.max(0, new Date().getFullYear() - year);
  return 1 / (1 + 0.1 * yearsOld);
}

function citationScore(
  normalizedPercentile: number | null,
  citationCount: number | null,
  year: number | null,
): number {
  if (normalizedPercentile !== null) return normalizedPercentile;
  if (citationCount === null) return 0.3;
  const yearsOld = Math.max(1, new Date().getFullYear() - (year ?? 2015));
  const velocity = citationCount / yearsOld;
  return Math.min(1, velocity / 50);
}

function outcomeFitScore(title: string, abstract: string, entities: string[]): number {
  if (entities.length === 0) return 0.5;
  const text = `${title} ${abstract}`.toLowerCase();
  let matches = 0;
  for (const entity of entities) {
    if (text.includes(entity.toLowerCase())) matches++;
  }
  return 0.3 + (0.7 * matches) / entities.length;
}

interface ScoreInput {
  studyDesign: StudyDesign;
  populationType: PopulationType;
  year: number | null;
  citationCount: number | null;
  citationNormalizedPercentile: number | null;
  entities: string[];
  title: string;
  abstract: string;
  desiredEvidenceTypes?: string[];
}

const DESIGN_TO_LABEL: Record<StudyDesign, string> = {
  meta_analysis: "meta-analysis",
  systematic_review: "systematic review",
  rct: "randomized controlled trial",
  cohort: "cohort",
  cross_sectional: "cross-sectional",
  case_report: "case report",
  editorial: "editorial",
  unknown: "unknown",
};

export function computeEvidenceScore(input: ScoreInput): number {
  const designScore = DESIGN_SCORES[input.studyDesign];
  const recency = recencyScore(input.year);
  const citation = citationScore(
    input.citationNormalizedPercentile,
    input.citationCount,
    input.year,
  );
  const humanPop = POPULATION_SCORES[input.populationType];
  const outcomeFit = outcomeFitScore(input.title, input.abstract, input.entities);

  let score =
    designScore * 0.35 +
    recency * 0.20 +
    citation * 0.10 +
    humanPop * 0.20 +
    outcomeFit * 0.15;

  // P2: Soft penalty for papers not matching desired evidence types
  if (input.desiredEvidenceTypes?.length) {
    const designLabel = DESIGN_TO_LABEL[input.studyDesign];
    const matchesDesired = input.desiredEvidenceTypes.some(
      (type) =>
        designLabel.includes(type.toLowerCase()) ||
        input.studyDesign.includes(type.toLowerCase()) ||
        type.toLowerCase().includes(designLabel),
    );
    if (!matchesDesired) {
      score *= 0.85;
    }
  }

  return Math.min(1, Math.max(0, score));
}

export function assignEvidenceBucket(
  studyDesign: StudyDesign,
  populationType: PopulationType,
  evidenceScore: number,
): EvidenceBucket {
  if (studyDesign === "editorial") return "background";

  if (populationType === "animal" || populationType === "in_vitro") {
    return "mechanistic";
  }

  const isHighDesign =
    studyDesign === "meta_analysis" ||
    studyDesign === "systematic_review" ||
    studyDesign === "rct";

  if (isHighDesign && populationType === "human" && evidenceScore >= 0.55) {
    return "strongest";
  }

  if (populationType === "human" || populationType === "unknown") {
    return "human_observational";
  }

  return "background";
}

function deriveOneLiner(title: string, year: number | null, studyDesign: StudyDesign): string {
  const designLabel: Record<StudyDesign, string> = {
    meta_analysis: "Meta-analysis",
    systematic_review: "Systematic review",
    rct: "Randomized trial",
    cohort: "Cohort study",
    cross_sectional: "Cross-sectional study",
    case_report: "Case report",
    editorial: "Editorial",
    unknown: "Study",
  };
  const label = designLabel[studyDesign] ?? "Study";
  return `${label}${year ? ` (${year})` : ""}: ${title}`;
}

const BUCKET_ORDER: EvidenceBucket[] = [
  "strongest",
  "human_observational",
  "conflicting",
  "mechanistic",
  "background",
];

// relevanceScores: optional map of externalId → Cohere relevance score (0–1).
// When present, used as a within-bucket tie-breaker alongside evidence score.
// Evidence bucket hierarchy is never overridden by relevance.
// P1: Evidence-fit sort priority: fit → bucket → within-bucket score.
const FIT_ORDER: Record<string, number> = { direct: 0, adjacent: 1, weak: 2, mismatch: 3 };

export function rankPapers(
  papers: Array<RetrievedPaper & { relevanceScore?: number }>,
  plan: ResearchPlan,
): RankedPaper[] {
  const entities = plan.entities;
  const ranked: RankedPaper[] = papers.map((paper) => {
    const studyDesign = classifyStudyDesign(paper.abstract, paper.title, paper.studyType);
    const populationType = classifyPopulationType(paper.abstract, paper.title);
    const evidenceScore = computeEvidenceScore({
      studyDesign,
      populationType,
      year: paper.year,
      citationCount: paper.citationCount,
      citationNormalizedPercentile: paper.citationNormalizedPercentile,
      entities,
      title: paper.title,
      abstract: paper.abstract,
      desiredEvidenceTypes: plan.desiredEvidenceTypes,
    });

    let evidenceBucket = assignEvidenceBucket(studyDesign, populationType, evidenceScore);

    if (evidenceBucket === "human_observational" && looksConflicting(paper.abstract)) {
      evidenceBucket = "conflicting";
    }

    const plainSummary = deriveOneLiner(paper.title, paper.year, studyDesign);

    const preFitPaper: RankedPaper = {
      ...paper,
      studyDesign,
      populationType,
      evidenceScore,
      evidenceBucket,
      plainSummary,
      relevanceScore: paper.relevanceScore,
    };

    // P1: Evidence-fit evaluation
    const evidenceFit = evaluateEvidenceFit(preFitPaper, plan);

    return {
      ...preFitPaper,
      evidenceFit,
    };
  });

  // P1 sort: evidence-fit first, then bucket order, then within-bucket blended score.
  // Relevance defaults to 0.5 when Cohere rerank was skipped — neutral, no distortion.
  ranked.sort((a, b) => {
    const fitDiff = (FIT_ORDER[a.evidenceFit?.overall ?? "weak"] ?? 2) -
                    (FIT_ORDER[b.evidenceFit?.overall ?? "weak"] ?? 2);
    if (fitDiff !== 0) return fitDiff;
    const bucketDiff =
      BUCKET_ORDER.indexOf(a.evidenceBucket) - BUCKET_ORDER.indexOf(b.evidenceBucket);
    if (bucketDiff !== 0) return bucketDiff;
    const aScore = a.evidenceScore * 0.7 + (a.relevanceScore ?? 0.5) * 0.3;
    const bScore = b.evidenceScore * 0.7 + (b.relevanceScore ?? 0.5) * 0.3;
    return bScore - aScore;
  });

  return ranked.slice(0, 10);
}

export function buildEvidenceSnapshot(papers: RankedPaper[]): EvidenceSnapshot {
  const metaAnalyses = papers.filter(
    (p) => p.studyDesign === "meta_analysis" || p.studyDesign === "systematic_review",
  ).length;
  const rcts = papers.filter((p) => p.studyDesign === "rct").length;
  const humanObservational = papers.filter(
    (p) => p.evidenceBucket === "human_observational",
  ).length;
  const mechanistic = papers.filter((p) => p.evidenceBucket === "mechanistic").length;
  const conflicting = papers.filter((p) => p.evidenceBucket === "conflicting").length;

  let overallConfidence: EvidenceSnapshot["overallConfidence"] = "preliminary";
  if (metaAnalyses >= 2 && rcts >= 3) {
    overallConfidence = "strong";
  } else if (metaAnalyses >= 1 || rcts >= 2) {
    overallConfidence = "moderate";
  } else if (rcts >= 1 || humanObservational >= 2) {
    overallConfidence = "promising";
  }

  return {
    metaAnalyses,
    rcts,
    humanObservational,
    mechanistic,
    conflicting,
    totalPapers: papers.length,
    overallConfidence,
  };
}
