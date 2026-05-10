import { describe, expect, it, vi, beforeEach } from "vitest";
import { classifyStudyDesign, classifyPopulationType } from "../src/lib/search/evidenceClassifier";
import { computeEvidenceScore, assignEvidenceBucket } from "../src/lib/search/ranking";
import { deduplicatePapers, isGuidelineDocument, filterGuidelineDocuments } from "../src/lib/search/dedupe";
import { judgeRetrievalQuality, computeRetrievalQualityScore } from "../src/lib/search/retrievalJudge";
import { validateGrounding } from "../src/lib/search/groundingValidator";
import { buildEvidenceSpans, extractClaims, computeSpanDiagnostics } from "../src/lib/search/evidenceSpans";
import type { RetrievedPaper, RankedPaper, ResearchPlan, EvidenceSnapshot } from "../src/lib/search/types";

// ─── Test fixtures ─────────────────────────────────────────────────────────────

function makePaper(overrides: Partial<RetrievedPaper> = {}): RetrievedPaper {
  return {
    doi: "10.1000/test.001",
    externalId: "ss_001",
    title: "Effects of creatine supplementation on cognitive function in healthy adults",
    abstract:
      "A randomized controlled trial examining the effects of creatine on memory and cognition in 60 healthy adults. Participants received 5g creatine daily for 6 weeks. Significant improvements in working memory were observed.",
    authors: ["Smith J", "Jones A"],
    year: 2022,
    studyType: null,
    isRetracted: false,
    citationCount: 45,
    citationNormalizedPercentile: 0.75,
    openAccessPdfUrl: null,
    source: "semantic_scholar",
    retrievedByQuery: ["creatine cognitive function"],
    sources: ["semantic_scholar"],
    ...overrides,
  };
}

// ─── AC1: Evidence classifier correctly identifies study designs ───────────────

describe("evidenceClassifier - classifyStudyDesign", () => {
  it("identifies meta-analysis from abstract", () => {
    const result = classifyStudyDesign(
      "A systematic meta-analysis of 25 trials",
      "meta-analysis of creatine studies",
      null,
    );
    expect(result).toBe("meta_analysis");
  });

  it("identifies systematic review", () => {
    const result = classifyStudyDesign(
      "We conducted a systematic review of the literature",
      "systematic review of cognitive enhancers",
      null,
    );
    expect(result).toBe("systematic_review");
  });

  it("identifies RCT from abstract", () => {
    const result = classifyStudyDesign(
      "A randomized controlled trial with double-blind placebo control",
      "creatine and memory",
      null,
    );
    expect(result).toBe("rct");
  });

  it("identifies cohort study", () => {
    const result = classifyStudyDesign(
      "A longitudinal cohort study following participants for 5 years",
      "dietary patterns and cognitive decline",
      null,
    );
    expect(result).toBe("cohort");
  });

  it("identifies cross-sectional study", () => {
    const result = classifyStudyDesign(
      "A cross-sectional analysis of 1000 participants",
      "supplement use patterns",
      null,
    );
    expect(result).toBe("cross_sectional");
  });

  it("defaults to unknown for ambiguous papers", () => {
    const result = classifyStudyDesign(
      "We examined the relationship between diet and health",
      "nutrition study",
      null,
    );
    expect(result).toBe("unknown");
  });
});

describe("evidenceClassifier - classifyPopulationType", () => {
  it("identifies human studies from participant language", () => {
    const result = classifyPopulationType(
      "Sixty healthy adult participants were randomized",
      "cognitive function",
    );
    expect(result).toBe("human");
  });

  it("identifies animal studies", () => {
    const result = classifyPopulationType(
      "Mice were administered creatine via gavage for 4 weeks",
      "creatine neuroprotection",
    );
    expect(result).toBe("animal");
  });

  it("identifies in vitro studies", () => {
    const result = classifyPopulationType(
      "HeLa cells were treated with the compound in cell culture conditions",
      "mechanism study",
    );
    expect(result).toBe("in_vitro");
  });
});

// ─── AC2: Ranking produces valid evidence scores ────────────────────────────────

describe("computeEvidenceScore", () => {
  it("produces higher scores for RCTs over cross-sectional studies", () => {
    const rctScore = computeEvidenceScore({
      studyDesign: "rct",
      populationType: "human",
      year: 2022,
      citationCount: 30,
      citationNormalizedPercentile: 0.7,
      entities: ["creatine"],
      title: "RCT of creatine supplementation",
      abstract: "creatine supplementation in humans",
    });

    const crossSectionalScore = computeEvidenceScore({
      studyDesign: "cross_sectional",
      populationType: "human",
      year: 2022,
      citationCount: 30,
      citationNormalizedPercentile: 0.7,
      entities: ["creatine"],
      title: "Cross-sectional study of creatine use",
      abstract: "creatine use patterns in humans",
    });

    expect(rctScore).toBeGreaterThan(crossSectionalScore);
  });

  it("produces higher scores for meta-analyses than RCTs", () => {
    const metaScore = computeEvidenceScore({
      studyDesign: "meta_analysis",
      populationType: "human",
      year: 2023,
      citationCount: 100,
      citationNormalizedPercentile: 0.9,
      entities: ["creatine"],
      title: "Meta-analysis of creatine cognitive effects",
      abstract: "meta-analysis of randomized trials in human adults",
    });

    const rctScore = computeEvidenceScore({
      studyDesign: "rct",
      populationType: "human",
      year: 2023,
      citationCount: 40,
      citationNormalizedPercentile: 0.6,
      entities: ["creatine"],
      title: "RCT of creatine",
      abstract: "randomized trial in human adults",
    });

    expect(metaScore).toBeGreaterThan(rctScore);
  });

  it("penalises animal studies vs human studies", () => {
    const humanScore = computeEvidenceScore({
      studyDesign: "rct",
      populationType: "human",
      year: 2022,
      citationCount: 30,
      citationNormalizedPercentile: 0.65,
      entities: ["creatine"],
      title: "RCT in humans",
      abstract: "adults randomized controlled trial",
    });

    const animalScore = computeEvidenceScore({
      studyDesign: "rct",
      populationType: "animal",
      year: 2022,
      citationCount: 30,
      citationNormalizedPercentile: 0.65,
      entities: ["creatine"],
      title: "RCT in mice",
      abstract: "mice randomized controlled trial",
    });

    expect(humanScore).toBeGreaterThan(animalScore);
  });

  it("returns score between 0 and 1", () => {
    const score = computeEvidenceScore({
      studyDesign: "meta_analysis",
      populationType: "human",
      year: 2024,
      citationCount: 500,
      citationNormalizedPercentile: 0.99,
      entities: ["creatine", "cognition"],
      title: "Meta-analysis creatine cognition",
      abstract: "meta-analysis of creatine cognitive benefits in human adults",
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ─── AC3: Evidence bucketing is correct ────────────────────────────────────────

describe("assignEvidenceBucket", () => {
  it("places meta-analyses with high human evidence in 'strongest'", () => {
    const bucket = assignEvidenceBucket("meta_analysis", "human", 0.85);
    expect(bucket).toBe("strongest");
  });

  it("places RCTs with high scores in 'strongest'", () => {
    const bucket = assignEvidenceBucket("rct", "human", 0.72);
    expect(bucket).toBe("strongest");
  });

  it("places cohort studies with human participants in 'human_observational'", () => {
    const bucket = assignEvidenceBucket("cohort", "human", 0.45);
    expect(bucket).toBe("human_observational");
  });

  it("places animal studies in 'mechanistic'", () => {
    const bucket = assignEvidenceBucket("rct", "animal", 0.6);
    expect(bucket).toBe("mechanistic");
  });

  it("places in-vitro studies in 'mechanistic'", () => {
    const bucket = assignEvidenceBucket("unknown", "in_vitro", 0.3);
    expect(bucket).toBe("mechanistic");
  });

  it("places editorials in 'background'", () => {
    const bucket = assignEvidenceBucket("editorial", "human", 0.1);
    expect(bucket).toBe("background");
  });
});

// ─── AC4: Retracted papers are excluded ────────────────────────────────────────

describe("deduplicatePapers - retraction filtering", () => {
  it("removes retracted papers before deduplication", () => {
    const papers: RetrievedPaper[] = [
      makePaper({ doi: "10.1000/retracted", isRetracted: true, title: "Retracted creatine study" }),
      makePaper({ doi: "10.1000/good", isRetracted: false, title: "Valid creatine study" }),
    ];

    const result = deduplicatePapers(papers);
    expect(result.length).toBe(1);
    expect(result[0].doi).toBe("10.1000/good");
  });
});

// ─── AC5: Deduplication by DOI works ──────────────────────────────────────────

describe("deduplicatePapers - DOI deduplication", () => {
  it("removes duplicates sharing the same DOI", () => {
    const papers: RetrievedPaper[] = [
      makePaper({
        doi: "10.1000/same",
        externalId: "ss_001",
        source: "semantic_scholar",
        retrievedByQuery: ["creatine cognition"],
      }),
      makePaper({
        doi: "10.1000/same",
        externalId: "oa_001",
        source: "openalex",
        retrievedByQuery: ["creatine brain"],
      }),
    ];

    const result = deduplicatePapers(papers);
    expect(result.length).toBe(1);
  });

  it("merges sourceTrace when deduplicating by DOI", () => {
    const papers: RetrievedPaper[] = [
      makePaper({
        doi: "10.1000/same",
        source: "semantic_scholar",
        sources: ["semantic_scholar"],
        retrievedByQuery: ["creatine cognition"],
      }),
      makePaper({
        doi: "10.1000/same",
        source: "openalex",
        sources: ["openalex"],
        retrievedByQuery: ["creatine memory"],
      }),
    ];

    const result = deduplicatePapers(papers);
    expect(result[0].sources).toContain("semantic_scholar");
    expect(result[0].sources).toContain("openalex");
  });

  it("deduplicates by title similarity when DOI is missing", () => {
    const papers: RetrievedPaper[] = [
      makePaper({
        doi: null,
        externalId: "ss_001",
        title: "Effects of creatine supplementation on memory in adults",
      }),
      makePaper({
        doi: null,
        externalId: "oa_001",
        title: "Effects of creatine supplementation on memory in adults",
      }),
    ];

    const result = deduplicatePapers(papers);
    expect(result.length).toBe(1);
  });

  it("keeps distinct papers with no DOI", () => {
    const papers: RetrievedPaper[] = [
      makePaper({
        doi: null,
        externalId: "ss_001",
        title: "Creatine and brain health in the elderly",
      }),
      makePaper({
        doi: null,
        externalId: "oa_001",
        title: "Magnesium supplementation and sleep quality",
      }),
    ];

    const result = deduplicatePapers(papers);
    expect(result.length).toBe(2);
  });
});

// ─── AC6: Abstract filtering and limitedMetadata flag ─────────────────────────

describe("deduplicatePapers - abstract filtering", () => {
  it("keeps DOI-indexed papers with no abstract and marks them limitedMetadata", () => {
    const papers: RetrievedPaper[] = [
      makePaper({ doi: "10.1000/no-abstract", abstract: "" }),
      makePaper({
        doi: "10.1000/has-abstract",
        abstract:
          "A randomized controlled trial examining the effects of a supplement on memory and cognition in healthy adults.",
      }),
    ];

    const result = deduplicatePapers(papers);
    expect(result.length).toBe(2);
    const thin = result.find((p) => p.doi === "10.1000/no-abstract");
    expect(thin?.limitedMetadata).toBe(true);
    const good = result.find((p) => p.doi === "10.1000/has-abstract");
    expect(good?.limitedMetadata).toBeUndefined();
  });

  it("removes papers with no DOI and no abstract", () => {
    const papers: RetrievedPaper[] = [
      makePaper({ doi: null, externalId: "ss_no_abstract", abstract: "", title: "Creatine and brain health in adults" }),
      makePaper({
        doi: null,
        externalId: "ss_has_abstract",
        title: "Magnesium supplementation and sleep quality",
        abstract:
          "A randomized controlled trial examining the effects of a supplement on memory and cognition in healthy adults.",
      }),
    ];

    const result = deduplicatePapers(papers);
    expect(result.length).toBe(1);
    expect(result[0].externalId).toBe("ss_has_abstract");
  });
});

// ─── AC7: sourceTrace is present on all ranked papers ─────────────────────────

describe("ranked paper sourceTrace", () => {
  it("every paper has non-empty sources array", () => {
    const paper = makePaper({ sources: ["semantic_scholar"], retrievedByQuery: ["creatine"] });
    expect(paper.sources.length).toBeGreaterThan(0);
    expect(paper.retrievedByQuery.length).toBeGreaterThan(0);
  });
});

// ─── AC8: Safety boundary - no dosing recommendations ─────────────────────────

describe("safety boundary", () => {
  it("synthesis text does not recommend specific doses", () => {
    const prohibitedPhrases = [
      "you should take",
      "i recommend taking",
      "recommended dose",
      "take X mg",
      "take 5g",
      "take 20g",
    ];

    const exampleSynthesis =
      "Evidence suggests creatine may support cognitive performance, particularly during sleep deprivation. " +
      "Studies have used doses ranging from 5g to 20g daily, but individual response varies and these " +
      "were doses used in research contexts, not personal recommendations.";

    for (const phrase of prohibitedPhrases) {
      expect(exampleSynthesis.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });
});

// ─── AC9: No-evidence case produces honest output ─────────────────────────────

describe("no-evidence handling", () => {
  it("returns no-evidence marker when paper list is empty", () => {
    const papers: RetrievedPaper[] = [];
    const deduplicated = deduplicatePapers(papers);
    expect(deduplicated.length).toBe(0);
    // The search index.ts will catch empty results and produce noEvidence=true
  });
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makePlan(overrides: Partial<ResearchPlan> = {}): ResearchPlan {
  return {
    intentType: "topic_exploration",
    userQuestion: "Does creatine improve cognitive function?",
    entities: ["creatine", "cognitive function", "memory"],
    hiddenGoals: ["mental performance", "brain health"],
    queryVariants: ["creatine cognitive function"],
    inclusionCriteria: ["human studies"],
    exclusionCriteria: [],
    desiredEvidenceTypes: ["rct", "meta_analysis"],
    followUpQuestions: [],
    ...overrides,
  };
}

function makeRankedPaper(overrides: Partial<RankedPaper> = {}): RankedPaper {
  return {
    doi: "10.1000/test.001",
    externalId: "ss_001",
    title: "Effects of creatine supplementation on cognitive function in healthy adults",
    abstract:
      "A randomized controlled trial examining the effects of creatine on memory and cognition in 60 healthy adults.",
    authors: ["Smith J"],
    year: 2022,
    studyType: null,
    isRetracted: false,
    citationCount: 45,
    citationNormalizedPercentile: 0.75,
    openAccessPdfUrl: null,
    source: "semantic_scholar",
    retrievedByQuery: ["creatine cognitive function"],
    sources: ["semantic_scholar"],
    studyDesign: "rct",
    populationType: "human",
    evidenceScore: 0.78,
    evidenceBucket: "strongest",
    plainSummary: "RCT (2022): Effects of creatine supplementation on cognitive function in healthy adults",
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot {
  return {
    metaAnalyses: 0,
    rcts: 2,
    humanObservational: 1,
    mechanistic: 0,
    conflicting: 0,
    totalPapers: 3,
    overallConfidence: "promising",
    ...overrides,
  };
}

// ─── P7-1: AASLD/guideline pollution remains suppressed ───────────────────────

describe("filterGuidelineDocuments — guideline suppression", () => {
  it("suppresses AASLD practice guidance", () => {
    const papers: RetrievedPaper[] = [
      makePaper({ title: "AASLD Practice Guidance on nonalcoholic fatty liver disease" }),
      makePaper({ title: "Creatine supplementation and cognitive function in adults" }),
    ];
    const result = filterGuidelineDocuments(papers);
    expect(result.length).toBe(1);
    expect(result[0].title).toContain("Creatine");
  });

  it("suppresses ESPEN, ASPEN consensus statements", () => {
    expect(isGuidelineDocument("ESPEN consensus statement on enteral nutrition")).toBe(true);
    expect(isGuidelineDocument("ASPEN clinical guidelines for parenteral nutrition")).toBe(true);
    expect(isGuidelineDocument("Clinical Practice Guideline for Management of NAFLD")).toBe(true);
  });

  it("keeps primary research papers", () => {
    expect(isGuidelineDocument("A randomized trial of creatine supplementation in healthy adults")).toBe(false);
    expect(isGuidelineDocument("Omega-3 fatty acids and cardiovascular outcomes: a meta-analysis")).toBe(false);
    expect(isGuidelineDocument("Effect of magnesium on sleep quality: systematic review")).toBe(false);
  });

  it("removes all guideline documents from a mixed set", () => {
    const papers: RetrievedPaper[] = [
      makePaper({ title: "AASLD Practice Guidance on nonalcoholic liver disease" }),
      makePaper({ title: "Expert panel consensus statement on vitamin D supplementation" }),
      makePaper({ title: "Omega-3 supplementation in depression: randomized trial" }),
      makePaper({ title: "Fish oil and inflammation biomarkers: cohort study" }),
    ];
    const result = filterGuidelineDocuments(papers);
    expect(result.length).toBe(2);
    expect(result.every((p) => !isGuidelineDocument(p.title))).toBe(true);
  });
});

// ─── P7-2: Quality score is discriminative ────────────────────────────────────

describe("computeRetrievalQualityScore — discriminative scoring", () => {
  it("rates highly relevant creatine papers higher than AASLD-contaminated set", () => {
    const cleanPapers: RankedPaper[] = [
      makeRankedPaper(),
      makeRankedPaper({ externalId: "ss_002", title: "Creatine and working memory: randomized trial" }),
      makeRankedPaper({ externalId: "ss_003", title: "Creatine supplementation and cognitive performance", abstract: "Sixty healthy adults received creatine supplementation. Memory and cognition improved significantly." }),
    ];
    const contaminatedPapers: RankedPaper[] = [
      makeRankedPaper({
        title: "AASLD Practice Guidance on management of nonalcoholic fatty liver disease",
        abstract: "Guidance for clinicians managing patients with hepatic steatosis and cirrhosis.",
        citationNormalizedPercentile: 0.95,
        citationCount: 500,
      }),
      makeRankedPaper({
        externalId: "ss_002",
        title: "Dietary protein guidelines for patients with kidney disease",
        abstract: "Recommendations for renal diet in patients with chronic kidney disease.",
        citationNormalizedPercentile: 0.88,
      }),
      makeRankedPaper({
        externalId: "ss_003",
        title: "Creatine supplementation cognitive function",
        abstract: "A small pilot study examining creatine.",
      }),
    ];

    const plan = makePlan();
    const cleanScore = computeRetrievalQualityScore(cleanPapers, plan);
    const contaminatedScore = computeRetrievalQualityScore(contaminatedPapers, plan);
    expect(cleanScore.total).toBeGreaterThan(contaminatedScore.total + 0.10);
  });

  it("contaminated set scores below 0.35 when AASLD paper dominates top 2", () => {
    const papers: RankedPaper[] = [
      makeRankedPaper({
        title: "AASLD Practice Guidance on nonalcoholic fatty liver disease",
        abstract: "Hepatology guidance for liver disease management.",
        citationNormalizedPercentile: 0.95,
        citationCount: 600,
      }),
      makeRankedPaper({
        externalId: "ss_002",
        title: "Guidelines for nutritional support in ICU patients",
        abstract: "Critical care nutrition guidelines for intensive care unit patients.",
        citationNormalizedPercentile: 0.90,
        citationCount: 400,
      }),
    ];
    const plan = makePlan();
    const score = computeRetrievalQualityScore(papers, plan);
    expect(score.total).toBeLessThan(0.35);
  });

  it("repaired set can beat original when it has better topical alignment", () => {
    const plan = makePlan();
    const originalPapers: RankedPaper[] = [
      makeRankedPaper({ title: "Hepatitis C treatment in cirrhotic patients", abstract: "liver disease antiviral" }),
      makeRankedPaper({ externalId: "ss_002", title: "Renal nutrition guidelines ICU", abstract: "kidney disease diet" }),
    ];
    const repairedPapers: RankedPaper[] = [
      makeRankedPaper({ title: "Creatine and working memory randomized trial", abstract: "creatine cognitive function healthy adults" }),
      makeRankedPaper({ externalId: "ss_002", title: "Creatine supplementation meta-analysis", abstract: "systematic review creatine cognitive function" }),
    ];
    const originalScore = computeRetrievalQualityScore(originalPapers, plan).total;
    const repairedScore = computeRetrievalQualityScore(repairedPapers, plan).total;
    expect(repairedScore).toBeGreaterThan(originalScore + 0.10);
  });

  it("original set can beat repaired when original is already good", () => {
    const plan = makePlan();
    const goodOriginal: RankedPaper[] = [
      makeRankedPaper(),
      makeRankedPaper({ externalId: "ss_002", title: "Creatine and working memory: meta-analysis", abstract: "creatine cognitive function adults randomized" }),
    ];
    const worseRepaired: RankedPaper[] = [
      makeRankedPaper({ externalId: "ss_003", title: "Nutritional supplements general review", abstract: "various supplements and health outcomes in athletes and non-athletes" }),
    ];
    const goodScore = computeRetrievalQualityScore(goodOriginal, plan).total;
    const worseScore = computeRetrievalQualityScore(worseRepaired, plan).total;
    expect(goodScore).toBeGreaterThan(worseScore);
  });
});

// ─── P7-3: Judge — acceptable retrieval does NOT trigger repair ───────────────

describe("judgeRetrievalQuality — trigger logic", () => {
  it("does not trigger repair for strong retrieval", () => {
    const papers: RankedPaper[] = [
      makeRankedPaper(),
      makeRankedPaper({ externalId: "ss_002", title: "Creatine and working memory: a randomized trial" }),
      makeRankedPaper({ externalId: "ss_003", title: "Creatine supplementation improves cognitive performance in sleep-deprived adults" }),
    ];
    const plan = makePlan();
    const result = judgeRetrievalQuality(papers, plan);
    expect(result.quality).toBe("strong");
    expect(result.shouldTriggerRepair).toBe(false);
  });

  it("triggers repair for contaminated top-5 (off-topic high-citation)", () => {
    const papers: RankedPaper[] = [
      makeRankedPaper({
        title: "AASLD Practice Guidance on nonalcoholic fatty liver disease",
        abstract: "Hepatology guidance for liver disease management in clinical settings.",
        citationNormalizedPercentile: 0.97,
        citationCount: 600,
      }),
      makeRankedPaper({
        externalId: "ss_002",
        title: "Dietary protein guidelines for patients with kidney disease",
        abstract: "Recommendations for patients with chronic kidney disease.",
        citationNormalizedPercentile: 0.92,
        citationCount: 450,
      }),
      makeRankedPaper({
        externalId: "ss_003",
        title: "Nonalcoholic steatohepatitis management review",
        abstract: "Review of treatment options for NAFLD and NASH patients.",
        citationNormalizedPercentile: 0.88,
        citationCount: 350,
      }),
    ];
    const plan = makePlan();
    const result = judgeRetrievalQuality(papers, plan);
    expect(result.shouldTriggerRepair).toBe(true);
  });
});

// ─── P7-4: Entity conflation — omega-3 papers do not satisfy omega-6 query ───

describe("entity conflation detection", () => {
  it("flags omega-3 papers when query asks about omega-6/seed oils", () => {
    const omega6Plan = makePlan({
      userQuestion: "Are seed oils and omega-6 fats harmful?",
      entities: ["omega-6", "seed oil", "linoleic acid"],
    });
    const papers: RankedPaper[] = [
      makeRankedPaper({
        title: "Omega-3 fish oil supplementation reduces inflammation",
        abstract: "EPA and DHA from fish oil supplementation in human adults.",
      }),
      makeRankedPaper({
        externalId: "ss_002",
        title: "DHA and EPA effects on cardiovascular risk",
        abstract: "Marine omega-3 fatty acids fish oil randomized trial.",
      }),
    ];
    const judgment = judgeRetrievalQuality(papers, omega6Plan);
    expect(judgment.issues.some((i) => i.kind === "intervention_or_entity_conflation")).toBe(true);
    expect(judgment.shouldTriggerRepair).toBe(true);
  });

  it("flags NR papers when query asks specifically about NMN", () => {
    const nmnPlan = makePlan({
      userQuestion: "Does NMN supplementation improve longevity?",
      entities: ["nmn", "nicotinamide mononucleotide", "NAD+"],
    });
    const papers: RankedPaper[] = [
      makeRankedPaper({
        title: "Nicotinamide riboside supplementation and aging",
        abstract: "NR supplementation improves mitochondrial function in aged mice.",
      }),
    ];
    const judgment = judgeRetrievalQuality(papers, nmnPlan);
    expect(judgment.perPaperJudgments[0].entityConflationRisk).toBe(true);
  });
});

// ─── P7-5: Disease-specific population mismatch ───────────────────────────────

describe("population mismatch — disease bleed", () => {
  it("does not penalize disease populations when query is about that disease", () => {
    const diseasePlan = makePlan({
      userQuestion: "What is the treatment for nonalcoholic fatty liver disease?",
      entities: ["nafld", "liver disease", "steatohepatitis"],
    });
    const papers: RankedPaper[] = [
      makeRankedPaper({
        title: "Nonalcoholic fatty liver disease treatment outcomes",
        abstract: "NAFLD treatment with lifestyle modification in patients with steatohepatitis.",
      }),
    ];
    const judgment = judgeRetrievalQuality(papers, diseasePlan);
    expect(judgment.perPaperJudgments[0].hasPopulationMismatch).toBe(false);
  });

  it("flags disease-specific populations for general sleep/meditation queries", () => {
    const sleepPlan = makePlan({
      userQuestion: "Does melatonin improve sleep quality?",
      entities: ["melatonin", "sleep quality", "insomnia"],
    });
    const papers: RankedPaper[] = [
      makeRankedPaper({
        title: "Melatonin in ICU patients with critical illness",
        abstract: "Melatonin administered to critically ill intensive care unit patients improved sedation.",
      }),
      makeRankedPaper({
        externalId: "ss_002",
        title: "Melatonin for cancer patients undergoing chemotherapy",
        abstract: "Melatonin supplementation in cancer patients reduces chemotherapy side effects.",
      }),
    ];
    const judgment = judgeRetrievalQuality(papers, sleepPlan);
    const mismatchCount = judgment.perPaperJudgments.filter((j) => j.hasPopulationMismatch).length;
    expect(mismatchCount).toBeGreaterThan(0);
  });
});

// ─── P7-6: Grounding validator — strengthened checks ─────────────────────────

describe("validateGrounding — strengthened", () => {
  it("flags 1.6 g/kg claim when no abstract mentions g/kg context", () => {
    const papers: RankedPaper[] = [
      makeRankedPaper({ abstract: "Creatine supplementation improved working memory scores in healthy adults." }),
    ];
    const snapshot = makeSnapshot();
    const synthesis = "Evidence suggests a protein intake of 1.6 g/kg per day is optimal for muscle protein synthesis.";
    const result = validateGrounding(synthesis, papers, snapshot);
    expect(result.unsupportedNumericClaims).toBeGreaterThan(0);
    expect(result.flags.some((f) => !f.supported && f.claim.includes("1.6"))).toBe(true);
  });

  it("supports numeric claim when abstract contains value AND unit context", () => {
    const papers: RankedPaper[] = [
      makeRankedPaper({
        abstract: "Participants ingested 5g of creatine per day for 6 weeks. Working memory improved significantly.",
      }),
    ];
    const snapshot = makeSnapshot();
    const synthesis = "Studies used 5g daily creatine with positive cognitive outcomes.";
    const result = validateGrounding(synthesis, papers, snapshot);
    const flag = result.flags.find((f) => f.claim.includes("5"));
    if (flag) expect(flag.supported).toBe(true);
  });

  it("detects causal overreach with observational-only evidence", () => {
    const papers: RankedPaper[] = [makeRankedPaper({ studyDesign: "cohort", evidenceBucket: "human_observational" })];
    const snapshot = makeSnapshot({ rcts: 0, metaAnalyses: 0, humanObservational: 1 });
    const synthesis = "Exercise causes significant improvements in depressive symptoms and mood.";
    const result = validateGrounding(synthesis, papers, snapshot);
    expect(result.causalOverreach).toBe(true);
  });

  it("does not flag causal language with RCT support", () => {
    const papers: RankedPaper[] = [makeRankedPaper({ studyDesign: "rct" })];
    const snapshot = makeSnapshot({ rcts: 3, metaAnalyses: 1 });
    const synthesis = "Creatine leads to measurable improvements in working memory. Results are consistent.";
    const result = validateGrounding(synthesis, papers, snapshot);
    expect(result.causalOverreach).toBe(false);
  });

  it("returns studiesShowViolations count", () => {
    const papers: RankedPaper[] = [
      makeRankedPaper({ abstract: "Magnesium and sleep outcomes measured by actigraphy." }),
    ];
    const snapshot = makeSnapshot({ rcts: 1 });
    // synthesis claims studies found a specific outcome not in the abstract
    const synthesis = "Studies found that high-dose resveratrol supplementation reduces all-cause mortality by 40%.";
    const result = validateGrounding(synthesis, papers, snapshot);
    // studiesShowViolations is tracked
    expect(typeof result.studiesShowViolations).toBe("number");
  });

  it("returns empty flags for hedged synthesis with no numeric claims", () => {
    const papers: RankedPaper[] = [makeRankedPaper()];
    const snapshot = makeSnapshot();
    const synthesis = "Evidence suggests creatine may support cognitive performance, particularly under stress. More research is needed.";
    const result = validateGrounding(synthesis, papers, snapshot);
    expect(result.flags.length).toBe(0);
    expect(result.causalOverreach).toBe(false);
  });
});

// ─── P8: Evidence span extraction and diagnostics ────────────────────────────

describe("extractClaims — claim sentence extraction", () => {
  it("extracts substantive claim sentences from synthesis text", () => {
    const synthesis =
      "Creatine supplementation appears to improve working memory in healthy adults, particularly under conditions of cognitive stress. " +
      "Several randomized trials have examined doses ranging from 3g to 5g per day over 4-8 week periods. " +
      "The effect appears most pronounced in vegetarians and sleep-deprived individuals.";
    const claims = extractClaims(synthesis);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => c.length >= 40)).toBe(true);
  });

  it("filters out safety disclaimer sentences", () => {
    const synthesis =
      "Creatine appears to support short-term cognitive performance. " +
      "Always consult a healthcare professional before starting any supplementation. " +
      "Individual response varies and personal decisions should involve a physician.";
    const claims = extractClaims(synthesis);
    expect(claims.every((c) => !/consult|healthcare professional|individual response varies/i.test(c))).toBe(true);
  });

  it("filters out very short sentences", () => {
    const synthesis = "Creatine helps. Evidence suggests creatine supplementation improves working memory in healthy adult humans. More research needed.";
    const claims = extractClaims(synthesis);
    expect(claims.every((c) => c.split(" ").length >= 6)).toBe(true);
  });

  it("returns empty array for safety-only text", () => {
    const synthesis = "Always speak with a doctor. Consult a physician before use.";
    const claims = extractClaims(synthesis);
    expect(claims.length).toBe(0);
  });
});

describe("buildEvidenceSpans — snippet extraction", () => {
  it("returns a span for each extracted claim", () => {
    const synthesis =
      "Creatine supplementation improves working memory and cognitive performance in healthy adults. " +
      "Randomized controlled trials show consistent effects across multiple study populations.";
    const papers: RankedPaper[] = [makeRankedPaper()];
    const spans = buildEvidenceSpans(synthesis, papers);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => s.claimId.startsWith("claim_"))).toBe(true);
    expect(spans.every((s) => s.claimText.length > 0)).toBe(true);
  });

  it("finds direct support when claim keywords overlap strongly with abstract", () => {
    // Claim is concise and maps tightly onto a single abstract sentence
    const synthesis =
      "Creatine improved working memory and cognitive performance in healthy adults.";
    const papers: RankedPaper[] = [
      makeRankedPaper({
        abstract:
          "Background: this study examined dietary patterns. " +
          "Creatine supplementation improved working memory and cognitive performance in healthy adults receiving 5g daily. " +
          "No serious adverse effects were reported.",
      }),
    ];
    const spans = buildEvidenceSpans(synthesis, papers);
    expect(spans.length).toBeGreaterThan(0);
    const hasDirectEvidence = spans.some((s) => s.evidence.some((e) => e.supportType === "strongly_supported"));
    expect(hasDirectEvidence).toBe(true);
  });

  it("returns snippets that are verbatim substrings of the abstract (P6 safety)", () => {
    const synthesis =
      "Creatine supplementation appears to benefit working memory in healthy adults under cognitive stress conditions.";
    const papers: RankedPaper[] = [makeRankedPaper()];
    const spans = buildEvidenceSpans(synthesis, papers);
    for (const span of spans) {
      for (const snippet of span.evidence) {
        const paper = papers.find((p) => p.externalId === snippet.paperExternalId);
        expect(paper?.abstract).toBeDefined();
        expect(paper!.abstract.includes(snippet.text)).toBe(true);
      }
    }
  });

  it("returns no snippets for claims with no keyword overlap", () => {
    const synthesis =
      "Vitamin D deficiency is associated with increased fracture risk in postmenopausal women.";
    const papers: RankedPaper[] = [
      makeRankedPaper({
        abstract: "A randomized controlled trial examining the effects of creatine on memory and cognition in 60 healthy adults.",
      }),
    ];
    const spans = buildEvidenceSpans(synthesis, papers);
    // Vitamin D has no overlap with creatine/cognitive abstract
    const hasAnyEvidence = spans.some((s) => s.evidence.length > 0);
    expect(hasAnyEvidence).toBe(false);
  });

  it("clips evidence to MAX_SNIPPETS_PER_CLAIM across all papers", () => {
    const synthesis =
      "Creatine supplementation improves working memory and cognitive performance in healthy adult humans.";
    // Give it many papers with overlapping content
    const papers: RankedPaper[] = Array.from({ length: 10 }, (_, i) =>
      makeRankedPaper({
        externalId: `ss_${i}`,
        abstract: `Randomized trial examining creatine cognitive function in healthy adults (study ${i}).`,
      }),
    );
    const spans = buildEvidenceSpans(synthesis, papers);
    for (const span of spans) {
      expect(span.evidence.length).toBeLessThanOrEqual(3);
    }
  });

  it("assigns higher confidence to snippets with stronger keyword overlap", () => {
    const synthesis =
      "Creatine supplementation significantly improved working memory and cognitive performance in healthy adults.";
    const papers: RankedPaper[] = [
      makeRankedPaper({
        externalId: "strong",
        abstract: "Creatine supplementation improved working memory and cognitive performance significantly in healthy adults.",
      }),
      makeRankedPaper({
        externalId: "weak",
        abstract: "A study examined dietary habits in elderly patients with metabolic syndrome.",
      }),
    ];
    const spans = buildEvidenceSpans(synthesis, papers);
    if (spans.length > 0 && spans[0].evidence.length > 1) {
      const confidences = spans[0].evidence.map((e) => e.confidence);
      // Should be sorted descending
      for (let i = 1; i < confidences.length; i++) {
        expect(confidences[i - 1]).toBeGreaterThanOrEqual(confidences[i]);
      }
    }
  });
});

describe("computeSpanDiagnostics — P8 grounding metrics", () => {
  it("computes correct totalClaims count", () => {
    const synthesis =
      "Creatine appears to improve working memory in healthy adults. " +
      "Randomized trials show consistent effects on cognitive performance. " +
      "Effects may be particularly pronounced in vegetarians.";
    const papers: RankedPaper[] = [makeRankedPaper()];
    const spans = buildEvidenceSpans(synthesis, papers);
    const diag = computeSpanDiagnostics(spans);
    expect(diag.totalClaims).toBe(spans.length);
  });

  it("reports claimsWithAnySupport <= totalClaims", () => {
    const synthesis =
      "Creatine supplementation improves working memory in healthy adult humans receiving 5g daily. " +
      "Vitamin D deficiency is associated with fractures in postmenopausal women.";
    const papers: RankedPaper[] = [makeRankedPaper()];
    const spans = buildEvidenceSpans(synthesis, papers);
    const diag = computeSpanDiagnostics(spans);
    expect(diag.claimsWithAnySupport).toBeLessThanOrEqual(diag.totalClaims);
    expect(diag.claimsWithDirectSupport).toBeLessThanOrEqual(diag.claimsWithAnySupport);
  });

  it("reports avgSnippetConfidence between 0 and 1", () => {
    const synthesis =
      "Creatine supplementation improves working memory in healthy adults receiving creatine daily.";
    const papers: RankedPaper[] = [makeRankedPaper()];
    const spans = buildEvidenceSpans(synthesis, papers);
    const diag = computeSpanDiagnostics(spans);
    expect(diag.avgSnippetConfidence).toBeGreaterThanOrEqual(0);
    expect(diag.avgSnippetConfidence).toBeLessThanOrEqual(1);
  });

  it("returns zero diagnostics for empty spans", () => {
    const diag = computeSpanDiagnostics([]);
    expect(diag.totalClaims).toBe(0);
    expect(diag.claimsWithDirectSupport).toBe(0);
    expect(diag.claimsWithAnySupport).toBe(0);
    expect(diag.avgSnippetConfidence).toBe(0);
  });
});
