import { beforeEach, describe, expect, it, vi } from "vitest";

const callLLMMock = vi.fn();

vi.mock("../src/lib/openRouterProvider", () => ({
  callLLM: callLLMMock,
  isDemoMode: false,
}));

function structuredJson() {
  return JSON.stringify({
    paperMetadata: {
      title: "Creatine and cognition",
      authors: ["A Author"],
      journal: "Journal of Tests",
      publicationYear: "2024",
    },
    study: {
      type: "Systematic review",
      population: "Healthy adults",
      interventionOrExposure: "Creatine supplementation",
      outcomes: "Cognitive performance",
      mainResult: "Some studies suggest benefits in specific contexts.",
      claimType: "theoretical",
    },
    findings: [
      {
        finding: "Creatine may help under demanding conditions.",
        sourceContext: "Results",
        populationOrSample: "Healthy adults",
        effectDirection: "Positive",
        supportLevel: "Moderate",
        plainMeaning: "Benefits seem narrower than a broad brain-health promise.",
      },
    ],
    evidenceSignals: {
      studyType: "Systematic review",
      sampleSize: "31 studies",
      controls: "Varied by included study",
      statisticalDetail: "Mixed designs",
      effectSizes: "Not visible in the uploaded text.",
      replication: "Included multiple studies.",
      publicationBiasRisk: "Not clear from uploaded text.",
      fundingVisibility: "Not visible in the uploaded text.",
      generalisability: "Likely depends on population and fasting protocol.",
    },
    trust: {
      rating: "Moderate",
      confidenceLevel: "medium",
      citationUse: "Use as a balanced evidence overview.",
      reason: "Multiple studies point in a similar direction, but the evidence is mixed and indirect.",
      supportingSignals: ["Systematic review", "Multiple included studies"],
    },
    limitations: [
      {
        severity: "Important limitation",
        limitation: "The included studies vary a lot.",
        whyItMatters: "That makes the overall pattern harder to interpret cleanly.",
        practicalConsequence: "Treat the result as suggestive rather than definitive.",
        whatWouldStrengthenIt: "More comparable trials.",
      },
    ],
    methodologicalConcerns: [],
    nonClaims: ["This does not prove a broad benefit for everyone."],
    misreadings: [
      {
        misleadingClaim: "Creatine is a general brain-health fix.",
        whatThePaperSupports: "The signal looks more specific than that.",
        whyTheDistinctionMatters: "Context matters for whether the effect shows up.",
      },
    ],
    suggestedQuestions: [
      "Would this still matter in everyday life?",
      "Is the effect specific to demanding cognitive situations?",
    ],
    relevance: {
      whyItMatters: "This helps separate broad hype from narrower evidence.",
      practicalMeaning: "Useful as a clue, not a blanket promise.",
      actionability: "Interesting but too early",
      actionabilityReasoning: "The evidence is suggestive but not decisive.",
      caution: "Do not treat this alone as proof.",
    },
    methodologySnapshot: {
      design: "Systematic review",
      searchSource: "Scientific literature",
      inclusionExclusionCriteria: "Human fasting studies",
      numberOfStudiesOrParticipants: "31 studies",
      analysisMethod: "Narrative synthesis",
      prismaMetaAnalysisStatistics: "",
    },
    keyTerms: [],
    missingInfo: [],
    disclaimer: "",
  });
}

function editorialJson() {
  return JSON.stringify({
    openingHook: "People love turning a simple habit into a miracle cure, but the interesting question is whether the evidence actually holds up once you look past the hype.",
    orientation: "The review suggests a real signal, but it looks much narrower and more conditional than the broad health claims fasting often attracts.",
    findings: [
      {
        heading: "The story is more specific",
        body: "The interesting part is not that fasting magically fixes everything. It is that some benefits seem to show up in particular biological or cognitive contexts rather than as a universal upgrade.",
      },
    ],
    trustNarrative: "The best reason to take this seriously is that the review pulls together multiple studies instead of leaning on one flashy result. The catch is that those studies are mixed enough that the cleanest interpretation is still a cautious one.",
    questionsWorthAsking: [
      "Would this still matter outside ideal study conditions?",
      "Which kind of person is actually most likely to notice a benefit?",
    ],
    deeperDive: {
      howDesignedTitle: "How the study was designed",
      howDesignedBody: "The authors gathered the available studies and looked for a pattern across them rather than running a new experiment.",
      cantTellUsTitle: "What this study can't tell us",
      cantTellUsBody: "It cannot cleanly tell you which exact fasting pattern works best for which exact outcome.",
      biggerPictureTitle: "Where this fits in the bigger picture",
      biggerPictureBody: "This is the kind of paper that helps sort real signals from overstated wellness claims.",
      technicallyCuriousTitle: "For the technically curious",
      technicallyCuriousBody: "The evidence base is heterogeneous, so interpretation depends heavily on study design and outcome choice.",
    },
  });
}

describe("editorial resilience", () => {
  beforeEach(() => {
    callLLMMock.mockReset();
    vi.resetModules();
    process.env.OPENROUTER_FAST_STRUCTURED_MODEL = "primary-fast-structured-model";
    process.env.OPENROUTER_FAST_EDITORIAL_MODEL = "primary-fast-editorial-model";
    delete process.env.OPENROUTER_FAST_MODEL;
    process.env.OPENROUTER_EDITORIAL_BACKUP_MODEL = "backup-editorial-model";
    process.env.OPENROUTER_SEARCH_MODEL = "primary-search-model";
    process.env.OPENROUTER_SEARCH_BACKUP_MODEL = "backup-search-model";
  });

  it("retries the document editorial pass with backup model before succeeding", async () => {
    callLLMMock
      .mockResolvedValueOnce(structuredJson())
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(editorialJson());

    const { analyseDocument } = await import("../src/lib/documentAnalysisService");
    const result = await analyseDocument("paper text", "research_paper", "", "", "English", {
      fastMode: true,
    });

    expect(result.editorialView.openingHook).toMatch(/People love turning a simple habit/);
    expect(callLLMMock).toHaveBeenCalledTimes(3);
    expect(callLLMMock.mock.calls[0]?.[3]?.model).toBe("primary-fast-structured-model");
    expect(callLLMMock.mock.calls[1]?.[3]?.model).toBe("primary-fast-editorial-model");
    expect(callLLMMock.mock.calls[2]?.[3]?.model).toBe("backup-editorial-model");
  });

  it("fails over to the backup editorial model when primary fails", async () => {
    callLLMMock
      .mockResolvedValueOnce(structuredJson())
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(editorialJson());

    const { analyseDocument } = await import("../src/lib/documentAnalysisService");
    const result = await analyseDocument("paper text", "research_paper", "", "", "English", {
      fastMode: true,
    });

    expect(result.editorialView.orientation).toMatch(/real signal/);
    expect(callLLMMock).toHaveBeenCalledTimes(3);
    expect(callLLMMock.mock.calls[2]?.[3]?.model).toBe("backup-editorial-model");
  });

  it("throws when all editorial attempts fail instead of silently flattening the output", async () => {
    callLLMMock
      .mockResolvedValueOnce(structuredJson())
      .mockRejectedValueOnce(new Error("timeout-primary"))
      .mockRejectedValueOnce(new Error("timeout-backup"));

    const { analyseDocument } = await import("../src/lib/documentAnalysisService");

    await expect(
      analyseDocument("paper text", "research_paper", "", "", "English", {
        fastMode: true,
      }),
    ).rejects.toThrow(/EDITORIAL_SYNTHESIS_FAILED/);
  });

  it("retries search synthesis and then uses the backup model", async () => {
    callLLMMock
      .mockRejectedValueOnce(new Error("timeout-1"))
      .mockResolvedValueOnce(
        JSON.stringify({
          synthesisText:
            "The evidence does point to a real effect here, but it looks narrower and messier than the broad claim people usually make.",
          confidence: "moderate",
          noEvidence: false,
          paperSummaries: [{ externalId: "paper-1", summary: "This review found a mixed but real signal." }],
          followUpOptions: ["Would this hold up in healthy adults?", "Does the effect depend on context?"],
        }),
      );

    const { synthesisePapers } = await import("../src/lib/search/synthesizer");
    const result = await synthesisePapers(
      {
        intentType: "topic_exploration",
        userQuestion: "does creatine help the brain",
        detectedLanguage: "English",
        responseLanguage: "English",
        normalizedEnglishQuestion: "does creatine help the brain",
        entities: ["creatine"],
        hiddenGoals: [],
        directQueryVariants: [],
        contextQueryVariants: [],
        queryVariants: [],
        inclusionCriteria: [],
        exclusionCriteria: [],
        desiredEvidenceTypes: [],
        followUpQuestions: ["Would this hold up in healthy adults?", "Does the effect depend on context?"],
      },
      [
        {
          doi: "10.1000/test.1",
          externalId: "paper-1",
          title: "Creatine review",
          abstract: "A review of creatine and cognition in adults with mixed but promising results.",
          authors: ["Author A"],
          year: 2024,
          studyType: "Review",
          isRetracted: false,
          citationCount: 10,
          citationNormalizedPercentile: 0.5,
          openAccessPdfUrl: null,
          source: "openalex",
          retrievedByQuery: ["creatine cognition"],
          sources: ["openalex"],
          studyDesign: "systematic_review",
          populationType: "human",
          evidenceScore: 0.7,
          evidenceBucket: "strongest",
          plainSummary: "Systematic review (2024): Creatine review",
          relevanceScore: 0.7,
        },
      ],
      {
        metaAnalyses: 1,
        rcts: 0,
        humanObservational: 0,
        mechanistic: 0,
        conflicting: 0,
        totalPapers: 1,
        overallConfidence: "moderate",
      },
    );

    expect(result.synthesisText).toMatch(/narrower and messier/);
    expect(callLLMMock).toHaveBeenCalledTimes(2);
    expect(callLLMMock.mock.calls[1]?.[3]?.model).toBe("backup-search-model");
  });
});
