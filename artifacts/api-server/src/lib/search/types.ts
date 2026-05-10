export type IntentType =
  | "claim_check"
  | "topic_exploration"
  | "dose_question"
  | "paper_search"
  | "paper_explanation";

export interface ResearchPlan {
  intentType: IntentType;
  userQuestion: string;
  entities: string[];
  hiddenGoals: string[];
  queryVariants: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  desiredEvidenceTypes: string[];
  followUpQuestions: string[];
}

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

export interface RetrievedPaper {
  doi: string | null;
  externalId: string;
  title: string;
  abstract: string;
  authors: string[];
  year: number | null;
  studyType: string | null;
  isRetracted: boolean;
  citationCount: number | null;
  citationNormalizedPercentile: number | null;
  openAccessPdfUrl: string | null;
  source: "semantic_scholar" | "openalex" | "europe_pmc";
  retrievedByQuery: string[];
  sources: string[];
  /** True when a paper was kept despite a short/missing abstract, relying on title+DOI metadata */
  limitedMetadata?: boolean;
}

export interface RankedPaper extends RetrievedPaper {
  studyDesign: StudyDesign;
  populationType: PopulationType;
  evidenceScore: number;
  evidenceBucket: EvidenceBucket;
  plainSummary: string;
  relevanceScore?: number; // 0–1 from Cohere Rerank; absent when reranker is skipped
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

// ─── Retrieval judgment ────────────────────────────────────────────────────────

export type IssueSeverity = "critical" | "major" | "minor";

export type RetrievalIssueKind =
  | "off_topic_high_citation"
  | "guideline_or_consensus_pollution"
  | "population_mismatch"
  | "intervention_or_entity_conflation"
  | "missing_canonical_evidence_likely"
  | "weak_abstract_or_metadata"
  | "evidence_type_mismatch";

export interface RetrievalIssue {
  kind: RetrievalIssueKind;
  severity: IssueSeverity;
  description: string;
  affectedPaperIds?: string[];
}

export interface PaperJudgment {
  externalId: string;
  topicalRelevance: number;
  isOffTopic: boolean;
  isGuideline: boolean;
  hasPopulationMismatch: boolean;
  entityConflationRisk: boolean;
  note?: string;
}

export type RepairStrategy =
  | "tighten_around_intervention"
  | "add_population_context"
  | "enforce_entity_precision"
  | "target_canonical_evidence"
  | "bias_to_evidence_type";

export interface RepairRecommendation {
  strategy: RepairStrategy;
  reason: string;
  suggestedTerms?: string[];
  exclusionTerms?: string[];
}

export interface RetrievalQualityScoreComponents {
  top5TopicalAlignment: number;
  interventionMatch: number;
  populationMatch: number;
  evidenceTypeBonus: number;
  offTopicPenalty: number;
  guidelinePollutionPenalty: number;
  entityConflationPenalty: number;
  diseaseBleedPenalty: number;
  total: number;
}

export type RetrievalQuality = "strong" | "acceptable" | "weak" | "failed";

export interface RetrievalJudgment {
  quality: RetrievalQuality;
  qualityScore: RetrievalQualityScoreComponents;
  /** Backward-compat convenience field — same as qualityScore.total */
  topicalRelevanceScore: number;
  offTopicCount: number;
  issues: RetrievalIssue[];
  perPaperJudgments: PaperJudgment[];
  repairRecommendations: RepairRecommendation[];
  shouldTriggerRepair: boolean;
  triggerReason: string | null;
  confidence: "high" | "medium" | "low";
}

// ─── Evidence spans / provenance ─────────────────────────────────────────────

export type SupportType = "strongly_supported" | "partially_supported" | "related_evidence";

export interface SourceSnippet {
  /** Unique ID: `<claimId>_<externalId>_<paragraphIndex>` */
  snippetId: string;
  paperExternalId: string;
  paperTitle: string;
  paperYear: number | null;
  doi: string | null;
  openAccessPdfUrl: string | null;
  /** Sentence index within the abstract */
  paragraphIndex: number;
  /** Exact sentence extracted verbatim from the abstract */
  text: string;
  /** 0–1 keyword overlap score */
  confidence: number;
  supportType: SupportType;
}

export interface EvidenceSpan {
  claimId: string;
  claimText: string;
  /** Top supporting snippets across all retrieved papers, sorted by confidence desc */
  evidence: SourceSnippet[];
}

export interface GroundingDiagnostics {
  totalClaims: number;
  claimsWithDirectSupport: number;
  claimsWithAnySupport: number;
  avgSnippetConfidence: number;
}

// ─── Grounding ────────────────────────────────────────────────────────────────

export interface GroundingFlag {
  claim: string;
  supported: boolean;
  papersChecked: number;
  matchedIn?: string; // externalId of the paper that grounded it
}

export interface GroundingResult {
  flags: GroundingFlag[];
  causalOverreach: boolean;
  unsupportedNumericClaims: number;
  studiesShowViolations: number;
  /** Count of model-prior leakage phrases (broad consensus language not derivable from the retrieved set) */
  modelPriorLeakage: number;
}

// ─── Pipeline debug metadata ───────────────────────────────────────────────────

export interface PipelineLatency {
  planMs: number;
  retrieveMs: number;
  dedupeMs: number;
  rankMs: number;
  judgeMs: number;
  repairMs: number | null;
  synthesisMs: number;
  totalMs: number;
}

export interface DebugMetadata {
  latency: PipelineLatency;
  retrievalJudgment: RetrievalJudgment;
  repairTriggered: boolean;
  repairStrategy: string | null;
  repairQueriesUsed: string[];
  repairTriggerReason: string | null;
  originalQualityScore: number | null;
  repairedQualityScore: number | null;
  scoreImprovement: number | null;
  keepRepairedReason: string | null;
  grounding: GroundingResult | null;
  groundingDiagnostics: GroundingDiagnostics | null;
  paperCountBeforeRepair: number | null;
  paperCountAfterRepair: number | null;
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
  /**
   * Indicates the depth of source material reviewed.
   * Currently always "abstracts_only" — full-text retrieval is not yet implemented.
   */
  coverageNote: "abstracts_only" | "partial_full_text" | "full_text";
  debugMetadata?: DebugMetadata;
}
