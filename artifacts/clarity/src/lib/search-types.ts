// Shared types for the search feature — mirrors server types for the frontend

export type IntentType =
  | "claim_check"
  | "topic_exploration"
  | "dose_question"
  | "paper_search"
  | "paper_explanation";

export type StudyDesign =
  | "meta_analysis"
  | "systematic_review"
  | "rct"
  | "cohort"
  | "cross_sectional"
  | "case_report"
  | "editorial"
  | "unknown";

export type PopulationType = "human" | "animal" | "in_vitro" | "unknown";

export type EvidenceBucket =
  | "strongest"
  | "human_observational"
  | "mechanistic"
  | "background"
  | "conflicting";

/** P5 taxonomy — more epistemically honest than direct/indirect/contextual */
export type SupportType = "strongly_supported" | "partially_supported" | "related_evidence";

export interface ResearchPlan {
  intentType: IntentType;
  userQuestion: string;
  entities: string[];
  hiddenGoals: string[];
  queryVariants: string[];
  followUpQuestions: string[];
}

export interface RankedPaper {
  doi: string | null;
  externalId: string;
  title: string;
  abstract: string;
  authors: string[];
  year: number | null;
  studyType: string | null;
  isRetracted: boolean;
  citationCount: number | null;
  openAccessPdfUrl: string | null;
  source: "semantic_scholar" | "openalex" | "europe_pmc";
  retrievedByQuery: string[];
  sources: string[];
  studyDesign: StudyDesign;
  populationType: PopulationType;
  evidenceScore: number;
  evidenceBucket: EvidenceBucket;
  plainSummary: string;
}

export interface EvidenceSnapshot {
  metaAnalyses: number;
  rcts: number;
  humanObservational: number;
  mechanistic: number;
  conflicting: number;
  totalPapers: number;
  overallConfidence: "preliminary" | "promising" | "moderate" | "strong";
}

/** A verbatim passage from a paper abstract that supports (or challenges) a synthesis claim */
export interface SourceSnippet {
  snippetId: string;
  paperExternalId: string;
  paperTitle: string;
  paperYear: number | null;
  doi: string | null;
  openAccessPdfUrl: string | null;
  paragraphIndex: number;
  /** Exact sentence extracted verbatim from the abstract */
  text: string;
  confidence: number;
  supportType: SupportType;
}

/** One synthesis claim linked to its supporting abstract passages */
export interface EvidenceSpan {
  claimId: string;
  claimText: string;
  evidence: SourceSnippet[];
}

export interface SearchResult {
  sessionId: number;
  query: string;
  plan: ResearchPlan;
  synthesisText: string;
  confidence: string;
  noEvidence: boolean;
  evidenceSnapshot: EvidenceSnapshot;
  papers: RankedPaper[];
  followUpOptions: string[];
  evidenceSpans: EvidenceSpan[];
  /** Always "abstracts_only" until full-text retrieval is implemented */
  coverageNote: "abstracts_only" | "partial_full_text" | "full_text";
}

// ─── SSE streaming events ─────────────────────────────────────────────────────

export type SearchStreamEvent =
  | { type: "papers"; papers: RankedPaper[]; evidenceSnapshot: EvidenceSnapshot; noEvidence: boolean }
  | { type: "synthesis"; synthesisText: string; confidence: string; evidenceSpans: EvidenceSpan[]; followUpOptions: string[]; coverageNote: "abstracts_only" }
  | { type: "done"; sessionId: number }
  | { type: "error"; message: string };

export interface SearchSessionSummary {
  id: number;
  query: string;
  confidence: string;
  createdAt: string;
}
