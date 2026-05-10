import type {
  RankedPaper,
  ResearchPlan,
  RetrievalJudgment,
  RetrievalIssue,
  RetrievalQualityScoreComponents,
  PaperJudgment,
  RepairRecommendation,
  IssueSeverity,
} from "./types";

// ─── Guideline detection ───────────────────────────────────────────────────────

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
  /\bSCCM\b/,
  /\bISCCM\b/,
  /\bESCMID\b/,
  /\bEASL\b/,
  /\bACG\b.*\bguideline/i,
  /\bAGA\b.*\bguideline/i,
  /\bPRISMA\b.*statement/i,
  /\bCONSORT\b.*statement/i,
];

export function isGuidelineTitle(title: string): boolean {
  return GUIDELINE_TITLE_PATTERNS.some((p) => p.test(title));
}

// ─── Disease bleed detection ───────────────────────────────────────────────────

export const DISEASE_TITLE_TERMS = [
  "nonalcoholic fatty liver", "nafld", "nash", "steatohepatitis",
  "hepatitis", "cirrhosis", "liver disease",
  "kidney disease", "chronic kidney", "renal failure", "dialysis",
  "heart failure", "atrial fibrillation", "coronary artery disease",
  "cancer", "oncology", "chemotherapy", "tumor", "malignant",
  "hiv", "aids", "tuberculosis", "malaria",
  "schizophrenia", "bipolar disorder", "autism spectrum",
  "multiple sclerosis", "rheumatoid arthritis", "lupus", "psoriasis",
  "icu patients", "critically ill", "intensive care",
];

function normalizedQuestionLower(plan: ResearchPlan): string {
  return (plan.normalizedEnglishQuestion || plan.userQuestion).toLowerCase();
}

function hasDiseaseBleed(title: string, userQuestion: string): boolean {
  const titleLower = title.toLowerCase();
  const questionLower = userQuestion.toLowerCase();
  return DISEASE_TITLE_TERMS.some(
    (term) => titleLower.includes(term) && !questionLower.includes(term),
  );
}

// ─── Entity conflation detection ──────────────────────────────────────────────

// Maps primary entity → entities that should NOT dominate when primary is the target
const CONFLATION_PAIRS: Record<string, string[]> = {
  "omega-6": ["omega-3", "fish oil", "eicosapentaenoic", " epa ", " dha "],
  "linoleic acid": ["omega-3", "fish oil", "eicosapentaenoic"],
  "seed oil": ["fish oil", "omega-3", "eicosapentaenoic", " epa "],
  "nmn": [" nr ", "nicotinamide riboside"],
  "nicotinamide mononucleotide": ["nicotinamide riboside", " nr "],
};

function detectEntityConflationRisk(paper: RankedPaper, entities: string[]): boolean {
  const text = `${paper.title} ${paper.abstract}`.toLowerCase();
  for (const entity of entities) {
    const conflators = CONFLATION_PAIRS[entity.toLowerCase()];
    if (!conflators) continue;
    const primaryPresent = text.includes(entity.toLowerCase());
    const conflatorPresent = conflators.some((c) => text.includes(c.toLowerCase()));
    if (conflatorPresent && !primaryPresent) return true;
  }
  return false;
}

// ─── Entity match helpers ─────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function titleEntityMatch(title: string, entities: string[]): number {
  if (entities.length === 0) return 0.5;
  const titleTokens = tokenize(title);
  let matches = 0;
  for (const entity of entities) {
    const entityTokens = tokenize(entity);
    // Entity matches if any of its tokens appear in the title
    if ([...entityTokens].some((t) => titleTokens.has(t))) matches++;
  }
  return matches / entities.length;
}

function abstractEntityMatch(abstract: string, entities: string[]): number {
  if (entities.length === 0 || abstract.trim().length === 0) return 0.5;
  const text = abstract.toLowerCase();
  let matches = 0;
  for (const entity of entities) {
    if (text.includes(entity.toLowerCase())) matches++;
  }
  return matches / entities.length;
}

// ─── Per-paper judgment ───────────────────────────────────────────────────────

function judgeOnePaper(paper: RankedPaper, plan: ResearchPlan): PaperJudgment {
  const titleRelevance = titleEntityMatch(paper.title, plan.entities);
  const abstractRelevance = abstractEntityMatch(paper.abstract, plan.entities);
  const topicalRelevance = titleRelevance * 0.65 + abstractRelevance * 0.35;

  const isOffTopic = topicalRelevance < 0.15;
  const isGuideline = isGuidelineTitle(paper.title);
  const questionLower = normalizedQuestionLower(plan);
  const diseaseInQuestion = DISEASE_TITLE_TERMS.some((t) => questionLower.includes(t));
  // Population mismatch: disease-specific title when query is about a general population/condition
  // Don't gate on titleRelevance — the intervention may still appear in the title despite wrong population
  const hasPopulationMismatch = !diseaseInQuestion && hasDiseaseBleed(paper.title, plan.normalizedEnglishQuestion || plan.userQuestion);
  const entityConflationRisk = detectEntityConflationRisk(paper, plan.entities);

  let note: string | undefined;
  if (isOffTopic && (paper.citationNormalizedPercentile ?? 0) > 0.8) {
    note = "off-topic high-citation paper";
  } else if (isGuideline) {
    note = "guideline/consensus document (should have been filtered)";
  } else if (hasPopulationMismatch) {
    note = "disease-specific population, query is general";
  } else if (entityConflationRisk) {
    note = "conflation risk — different entity from query";
  }

  return {
    externalId: paper.externalId,
    topicalRelevance,
    isOffTopic,
    isGuideline,
    hasPopulationMismatch,
    entityConflationRisk,
    note,
  };
}

export function filterTopicallyWeakPapers(
  papers: RankedPaper[],
  plan: ResearchPlan,
): RankedPaper[] {
  if (papers.length <= 5) return papers;

  const filtered = papers.filter((paper) => {
    const judgment = judgeOnePaper(paper, plan);
    const relevance = paper.relevanceScore ?? 0.5;

    if (judgment.isOffTopic && relevance < 0.2) {
      return false;
    }

    if (judgment.entityConflationRisk && relevance < 0.2) {
      return false;
    }

    if (judgment.hasPopulationMismatch && relevance < 0.16) {
      return false;
    }

    return true;
  });

  return filtered.length >= 5 ? filtered : papers;
}

// ─── P2: Retrieval quality score ──────────────────────────────────────────────

export function computeRetrievalQualityScore(
  papers: RankedPaper[],
  plan: ResearchPlan,
): RetrievalQualityScoreComponents {
  const top5 = papers.slice(0, 5);

  if (top5.length === 0) {
    return {
      top5TopicalAlignment: 0,
      interventionMatch: 0,
      populationMatch: 0,
      evidenceTypeBonus: 0,
      offTopicPenalty: 0,
      guidelinePollutionPenalty: 0,
      entityConflationPenalty: 0,
      diseaseBleedPenalty: 0,
      total: 0,
    };
  }

  // top5TopicalAlignment: title-weighted entity match over top 5
  const top5TopicalAlignment =
    top5.reduce((sum, p) => {
      const tMatch = titleEntityMatch(p.title, plan.entities);
      const aMatch = abstractEntityMatch(p.abstract, plan.entities);
      return sum + tMatch * 0.65 + aMatch * 0.35;
    }, 0) / top5.length;

  // interventionMatch: primary entity in top-5 titles
  const primaryEntity = plan.entities[0] ?? "";
  const interventionMatch = primaryEntity
    ? top5.filter((p) => p.title.toLowerCase().includes(primaryEntity.toLowerCase())).length /
      top5.length
    : 0.5;

  // populationMatch: human papers in top 5 (only penalise for human-focused queries)
  const questionLower = normalizedQuestionLower(plan);
  const isHumanFocused =
    !DISEASE_TITLE_TERMS.some((t) => questionLower.includes(t)) &&
    plan.intentType !== "paper_explanation";
  const populationMatch = isHumanFocused
    ? top5.filter((p) => p.populationType === "human" || p.populationType === "unknown").length /
      top5.length
    : 1.0;

  // evidenceTypeBonus: meta-analyses/RCTs in top 5 (for evidence queries)
  const evidenceIntentTypes: typeof plan.intentType[] = [
    "claim_check", "topic_exploration", "dose_question",
  ];
  const evidenceTypeBonus =
    evidenceIntentTypes.includes(plan.intentType)
      ? Math.min(
          top5.filter(
            (p) => p.studyDesign === "meta_analysis" || p.studyDesign === "systematic_review" || p.studyDesign === "rct",
          ).length / 3,
          1,
        )
      : 0.5;

  // Penalties (applied to top-5)
  const offTopicInTop5 = top5.filter(
    (p) => titleEntityMatch(p.title, plan.entities) < 0.15 && abstractEntityMatch(p.abstract, plan.entities) < 0.15,
  );
  const offTopicPenalty = -Math.min(offTopicInTop5.length * 0.08, 0.30);

  const guidelinesInTop5 = top5.filter((p) => isGuidelineTitle(p.title));
  const guidelinePollutionPenalty = -Math.min(guidelinesInTop5.length * 0.12, 0.30);

  const conflationInTop5 = top5.filter((p) => detectEntityConflationRisk(p, plan.entities));
  const entityConflationPenalty = -Math.min(conflationInTop5.length * 0.08, 0.15);

  const diseaseBleedInTop5 = top5.filter(
    (p) => !DISEASE_TITLE_TERMS.some((t) => questionLower.includes(t)) && hasDiseaseBleed(p.title, plan.normalizedEnglishQuestion || plan.userQuestion),
  );
  const diseaseBleedPenalty = -Math.min(diseaseBleedInTop5.length * 0.07, 0.21);

  const base =
    top5TopicalAlignment * 0.35 +
    interventionMatch * 0.20 +
    populationMatch * 0.15 +
    evidenceTypeBonus * 0.10;

  const total = Math.max(
    0,
    Math.min(
      1,
      base + offTopicPenalty + guidelinePollutionPenalty + entityConflationPenalty + diseaseBleedPenalty,
    ),
  );

  return {
    top5TopicalAlignment,
    interventionMatch,
    populationMatch,
    evidenceTypeBonus,
    offTopicPenalty,
    guidelinePollutionPenalty,
    entityConflationPenalty,
    diseaseBleedPenalty,
    total,
  };
}

// ─── Issue detection (P1) ─────────────────────────────────────────────────────

function detectOffTopicHighCitation(
  top5judgments: PaperJudgment[],
  papers: RankedPaper[],
): RetrievalIssue | null {
  const offTopicIds = top5judgments
    .filter((j) => j.isOffTopic)
    .map((j) => j.externalId);
  if (offTopicIds.length === 0) return null;

  const offTopicPapers = papers.filter((p) => offTopicIds.includes(p.externalId));
  const highCitation = offTopicPapers.filter(
    (p) => (p.citationNormalizedPercentile ?? 0) > 0.75 || (p.citationCount ?? 0) > 150,
  );

  if (highCitation.length === 0 && offTopicIds.length < 2) return null;

  // Always major — high citation authority on an off-topic paper is a signal, not a blocker.
  // Trigger logic uses score thresholds to decide whether to repair.
  return {
    kind: "off_topic_high_citation",
    severity: "major" as IssueSeverity,
    description: `${offTopicIds.length} off-topic paper(s) in top 5${highCitation.length > 0 ? `, ${highCitation.length} with high citation authority` : ""}`,
    affectedPaperIds: offTopicIds,
  };
}

function detectGuidelinePollution(top5judgments: PaperJudgment[]): RetrievalIssue | null {
  const guidelineIds = top5judgments.filter((j) => j.isGuideline).map((j) => j.externalId);
  if (guidelineIds.length === 0) return null;
  return {
    kind: "guideline_or_consensus_pollution",
    severity: "critical",
    description: `${guidelineIds.length} clinical guideline/consensus document(s) in top 5 (should have been filtered)`,
    affectedPaperIds: guidelineIds,
  };
}

function detectPopulationMismatch(
  top5judgments: PaperJudgment[],
  papers: RankedPaper[],
  plan: ResearchPlan,
): RetrievalIssue | null {
  const mismatchIds = top5judgments
    .filter((j) => j.hasPopulationMismatch)
    .map((j) => j.externalId);
  if (mismatchIds.length < 2) return null;

  const animalOrInVitro = papers
    .slice(0, 5)
    .filter((p) => p.populationType === "animal" || p.populationType === "in_vitro");

  const allIds = [...new Set([...mismatchIds, ...animalOrInVitro.map((p) => p.externalId)])];
  const severity: IssueSeverity = allIds.length >= 3 ? "major" : "minor";
  return {
    kind: "population_mismatch",
    severity,
    description: `${allIds.length} top-5 paper(s) have population mismatch (disease-specific or animal when query is general)`,
    affectedPaperIds: allIds,
  };
}

function detectEntityConflation(
  top5judgments: PaperJudgment[],
  plan: ResearchPlan,
): RetrievalIssue | null {
  const conflationIds = top5judgments.filter((j) => j.entityConflationRisk).map((j) => j.externalId);
  if (conflationIds.length === 0) return null;

  const hasKnownPair = plan.entities.some((e) => CONFLATION_PAIRS[e.toLowerCase()]);
  if (!hasKnownPair) return null;

  return {
    kind: "intervention_or_entity_conflation",
    severity: conflationIds.length >= 2 ? "critical" : "major",
    description: `${conflationIds.length} top-5 paper(s) appear to cover a different entity than the one queried`,
    affectedPaperIds: conflationIds,
  };
}

function detectMissingCanonicalEvidence(
  top5judgments: PaperJudgment[],
  papers: RankedPaper[],
  plan: ResearchPlan,
): RetrievalIssue | null {
  // Flag when top-3 papers all have low title relevance for an evidence-seeking query
  const evidenceIntents: typeof plan.intentType[] = ["claim_check", "topic_exploration", "dose_question"];
  if (!evidenceIntents.includes(plan.intentType)) return null;

  const top3 = top5judgments.slice(0, 3);
  if (top3.length < 2) return null;

  const allLow = top3.every((j) => j.topicalRelevance < 0.25);
  if (!allLow) return null;

  return {
    kind: "missing_canonical_evidence_likely",
    severity: "major",
    description: "Top-3 papers all have low topical relevance — canonical papers for this query may not have been retrieved",
    affectedPaperIds: top3.map((j) => j.externalId),
  };
}

function detectEvidenceTypeMismatch(
  papers: RankedPaper[],
  plan: ResearchPlan,
): RetrievalIssue | null {
  const top5 = papers.slice(0, 5);
  if (top5.length === 0) return null;

  // Clinical query but only mechanistic papers
  const clinicalIntents: typeof plan.intentType[] = ["claim_check", "dose_question"];
  if (clinicalIntents.includes(plan.intentType)) {
    const mechanisticCount = top5.filter(
      (p) => p.populationType === "animal" || p.populationType === "in_vitro",
    ).length;
    if (mechanisticCount >= 4) {
      return {
        kind: "evidence_type_mismatch",
        severity: "major",
        description: `${mechanisticCount}/5 top papers are animal/in-vitro but query asks for clinical evidence`,
        affectedPaperIds: top5
          .filter((p) => p.populationType === "animal" || p.populationType === "in_vitro")
          .map((p) => p.externalId),
      };
    }
  }

  return null;
}

// ─── Repair recommendations (P3 input) ────────────────────────────────────────

function buildRepairRecommendations(
  issues: RetrievalIssue[],
  plan: ResearchPlan,
): RepairRecommendation[] {
  const recs: RepairRecommendation[] = [];

  for (const issue of issues) {
    switch (issue.kind) {
      case "off_topic_high_citation":
      case "guideline_or_consensus_pollution":
        recs.push({
          strategy: "tighten_around_intervention",
          reason: issue.description,
          suggestedTerms: plan.entities.slice(0, 2),
          exclusionTerms: ["guideline", "practice guidance", "consensus", "management of"],
        });
        break;

      case "population_mismatch":
        recs.push({
          strategy: "add_population_context",
          reason: issue.description,
          suggestedTerms: ["healthy adults", "general population", "randomized trial"],
          exclusionTerms: DISEASE_TITLE_TERMS.slice(0, 8),
        });
        break;

      case "intervention_or_entity_conflation": {
        const conflationExclusions: string[] = [];
        for (const entity of plan.entities) {
          const conflators = CONFLATION_PAIRS[entity.toLowerCase()];
          if (conflators) conflationExclusions.push(...conflators);
        }
        recs.push({
          strategy: "enforce_entity_precision",
          reason: issue.description,
          suggestedTerms: plan.entities,
          exclusionTerms: conflationExclusions,
        });
        break;
      }

      case "missing_canonical_evidence_likely":
        recs.push({
          strategy: "target_canonical_evidence",
          reason: issue.description,
          suggestedTerms: [
            `${plan.entities[0] ?? ""} systematic review meta-analysis`,
            `${plan.entities[0] ?? ""} randomized controlled trial`,
          ],
        });
        break;

      case "evidence_type_mismatch":
        recs.push({
          strategy: "bias_to_evidence_type",
          reason: issue.description,
          suggestedTerms: ["randomized controlled trial", "clinical trial", "human study", "systematic review"],
        });
        break;
    }
  }

  return recs;
}

// ─── Trigger logic (P4) ───────────────────────────────────────────────────────

function shouldTriggerRepair(
  issues: RetrievalIssue[],
  scoreComponents: RetrievalQualityScoreComponents,
  paperCount: number,
): { trigger: boolean; reason: string | null } {
  if (paperCount === 0) {
    return { trigger: true, reason: "no papers retrieved" };
  }

  const hasCritical = issues.some((i) => i.severity === "critical");
  if (hasCritical) {
    const critical = issues.filter((i) => i.severity === "critical");
    return { trigger: true, reason: `critical issue(s): ${critical.map((i) => i.kind).join(", ")}` };
  }

  if (scoreComponents.total < 0.28) {
    return { trigger: true, reason: `quality score too low (${scoreComponents.total.toFixed(2)} < 0.28)` };
  }

  // Major intervention conflation always triggers (even at good scores)
  const conflation = issues.find(
    (i) => i.kind === "intervention_or_entity_conflation" && i.severity === "major",
  );
  if (conflation) {
    return { trigger: true, reason: `intervention/entity conflation detected` };
  }

  return { trigger: false, reason: null };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function judgeRetrievalQuality(
  papers: RankedPaper[],
  plan: ResearchPlan,
): RetrievalJudgment {
  if (papers.length === 0) {
    const emptyScore: RetrievalQualityScoreComponents = {
      top5TopicalAlignment: 0, interventionMatch: 0, populationMatch: 0,
      evidenceTypeBonus: 0, offTopicPenalty: 0, guidelinePollutionPenalty: 0,
      entityConflationPenalty: 0, diseaseBleedPenalty: 0, total: 0,
    };
    return {
      quality: "failed",
      qualityScore: emptyScore,
      topicalRelevanceScore: 0,
      offTopicCount: 0,
      issues: [],
      perPaperJudgments: [],
      repairRecommendations: [],
      shouldTriggerRepair: true,
      triggerReason: "no papers retrieved",
      confidence: "low",
    };
  }

  const top5 = papers.slice(0, 5);
  const perPaperJudgments = top5.map((p) => judgeOnePaper(p, plan));

  const qualityScore = computeRetrievalQualityScore(papers, plan);

  const issues: RetrievalIssue[] = [];

  const offTopicIssue = detectOffTopicHighCitation(perPaperJudgments, papers);
  if (offTopicIssue) issues.push(offTopicIssue);

  const guidelineIssue = detectGuidelinePollution(perPaperJudgments);
  if (guidelineIssue) issues.push(guidelineIssue);

  const populationIssue = detectPopulationMismatch(perPaperJudgments, papers, plan);
  if (populationIssue) issues.push(populationIssue);

  const conflationIssue = detectEntityConflation(perPaperJudgments, plan);
  if (conflationIssue) issues.push(conflationIssue);

  const missingIssue = detectMissingCanonicalEvidence(perPaperJudgments, papers, plan);
  if (missingIssue) issues.push(missingIssue);

  const evidenceTypeIssue = detectEvidenceTypeMismatch(papers, plan);
  if (evidenceTypeIssue) issues.push(evidenceTypeIssue);

  let quality: RetrievalJudgment["quality"];
  if (qualityScore.total >= 0.58) quality = "strong";
  else if (qualityScore.total >= 0.36) quality = "acceptable";
  else if (qualityScore.total >= 0.10) quality = "weak";
  else quality = "failed";

  const { trigger, reason } = shouldTriggerRepair(issues, qualityScore, papers.length);

  const repairRecommendations = trigger ? buildRepairRecommendations(issues, plan) : [];

  const offTopicCount = perPaperJudgments.filter((j) => j.isOffTopic).length;
  const confidence: RetrievalJudgment["confidence"] =
    papers.length >= 5 ? "high" : papers.length >= 2 ? "medium" : "low";

  return {
    quality,
    qualityScore,
    topicalRelevanceScore: qualityScore.total,
    offTopicCount,
    issues,
    perPaperJudgments,
    repairRecommendations,
    shouldTriggerRepair: trigger,
    triggerReason: reason,
    confidence,
  };
}
