import { z } from "zod";

const MISSING = "Not visible in the uploaded text.";

export const trustRatingValues = [
  "Strong",
  "Moderate",
  "Limited",
  "Early / exploratory",
  "Weak evidence",
  "Overclaimed / misleading",
] as const;

export const nuancedTrustLabelValues = [
  "Early but interesting",
  "Directionally supportive",
  "Promising but limited",
  "Moderate support",
  "Stronger evidence",
  "Contested / uncertain",
] as const;

export const actionabilityValues = [
  "Act on it now",
  "Maybe useful, low-risk",
  "Interesting but too early",
  "Do not act on this alone",
] as const;

export const findingSupportValues = [
  "Strong",
  "Moderate",
  "Limited",
  "Theoretical / speculative",
] as const;

export const limitationSeverityValues = [
  "Major limitation",
  "Important limitation",
  "Minor / transparency note",
] as const;

export const claimTypeValues = [
  "causal",
  "correlational",
  "theoretical",
  "speculative",
] as const;

export const confidenceValues = ["low", "medium", "high"] as const;

const maybeString = z.string().trim().optional().default("");
const stringArray = z.array(z.string().trim()).optional().default([]);

const llmTrustRatingSchema = z
  .object({
    rating: z.enum(trustRatingValues).optional(),
    reason: maybeString,
    confidenceLevel: z.enum(confidenceValues).optional(),
    citationUse: maybeString,
  })
  .optional()
  .default({});

const llmWhatShowsSchema = z
  .object({
    studyType: maybeString,
    population: maybeString,
    interventionOrExposure: maybeString,
    outcomesMeasured: maybeString,
    observedResult: maybeString,
    claimType: z.enum(claimTypeValues).optional(),
  })
  .optional()
  .default({});

const llmKeyFindingSchema = z.object({
  finding: maybeString,
  populationOrSample: maybeString,
  strengthOfSupport: z.enum(findingSupportValues).optional(),
  plainEnglishMeaning: maybeString,
  sourceText: z.string().trim().optional().nullable(),
});

const llmEvidenceQualitySchema = z
  .object({
    studyType: maybeString,
    sampleSize: maybeString,
    controls: maybeString,
  })
  .optional()
  .default({});

const llmLimitationSchema = z.object({
  limitation: maybeString,
  whyItMatters: maybeString,
});

const llmMisreadingSchema = z.object({
  misleadingClaim: maybeString,
  whatThePaperSupports: maybeString,
});

const llmRealWorldMeaningSchema = z
  .object({
    summary: maybeString,
    sensibleInterpretation: maybeString,
    whatToAvoid: maybeString,
    citationGuidance: maybeString,
  })
  .optional()
  .default({});

const llmPracticalUseSchema = z
  .object({
    recommendation: z.enum(actionabilityValues).optional(),
    reasoning: maybeString,
    caution: maybeString,
  })
  .optional()
  .default({});

const llmWhoAppliesSchema = z
  .object({
    likelyAppliesTo: stringArray,
    mayNotApplyTo: stringArray,
    uncertainty: maybeString,
  })
  .optional()
  .default({});

const llmQuestionSchema = z.object({
  question: maybeString,
  whyAskThis: maybeString,
});

const llmFurtherReadingSchema = z
  .object({
    note: maybeString,
    suggestions: stringArray,
  })
  .optional()
  .default({});

const llmMethodologySnapshotSchema = z
  .object({
    design: maybeString,
    numberOfStudiesOrParticipants: maybeString,
    analysisMethod: maybeString,
  })
  .optional()
  .default({});

const llmKeyTermSchema = z.object({
  term: maybeString,
});

const llmMissingInfoSchema = z.object({
  item: maybeString,
});

export const structuredAnalysisSchema = z.object({
  paperMetadata: z
    .object({
      title: maybeString,
      authors: z.array(z.string().trim()).optional().default([]),
      journal: maybeString,
      publicationYear: maybeString,
    })
    .optional()
    .default({}),
  study: z.object({
    type: maybeString,
    population: maybeString,
    interventionOrExposure: maybeString,
    outcomes: maybeString,
    mainResult: maybeString,
    claimType: z.enum(claimTypeValues).optional(),
  }),
  findings: z
    .array(
      z.object({
        finding: maybeString,
        populationOrSample: maybeString,
        supportLevel: z.enum(findingSupportValues).optional(),
        plainMeaning: maybeString,
        sourceText: z.string().trim().optional().nullable(),
      }),
    )
    .optional()
    .default([]),
  evidenceSignals: z.object({
    studyType: maybeString,
    sampleSize: maybeString,
    controls: maybeString,
  }),
  trust: z.object({
    rating: z.enum(trustRatingValues).optional(),
    confidenceLevel: z.enum(confidenceValues).optional(),
    citationUse: maybeString,
    reason: maybeString,
    supportingSignals: stringArray,
  }),
  limitations: z
    .array(
      z.object({
        limitation: maybeString,
        whyItMatters: maybeString,
      }),
    )
    .optional()
    .default([]),
  nonClaims: stringArray,
  misreadings: z
    .array(
      z.object({
        misleadingClaim: maybeString,
        whatThePaperSupports: maybeString,
      }),
    )
    .optional()
    .default([]),
  suggestedQuestions: stringArray,
  relevance: z.object({
    whyItMatters: maybeString,
    practicalMeaning: maybeString,
  }),
  methodologySnapshot: llmMethodologySnapshotSchema,
  keyTerms: z.array(llmKeyTermSchema).optional().default([]),
  missingInfo: z.array(llmMissingInfoSchema).optional().default([]),
  disclaimer: maybeString,
});

export const editorialSummarySchema = z.object({
  openingHook: maybeString,
  orientation: maybeString,
  findings: z
    .array(
      z.object({
        heading: maybeString,
        body: maybeString,
      }),
    )
    .optional()
    .default([]),
  trustNarrative: maybeString,
  questionsWorthAsking: z.array(z.string().trim()).optional().default([]),
  deeperDive: z
    .object({
      howDesignedTitle: maybeString,
      howDesignedBody: maybeString,
      cantTellUsTitle: maybeString,
      cantTellUsBody: maybeString,
      biggerPictureTitle: maybeString,
      biggerPictureBody: maybeString,
      technicallyCuriousTitle: maybeString,
      technicallyCuriousBody: maybeString,
    })
    .optional()
    .default({}),
});

export const llmAnalysisSchema = z.object({
  bottomLine: maybeString,
  trustRating: llmTrustRatingSchema,
  whatPaperActuallyShows: llmWhatShowsSchema,
  whatItDoesNotShow: stringArray,
  keyFindings: z.array(llmKeyFindingSchema).optional().default([]),
  evidenceQuality: llmEvidenceQualitySchema,
  limitationsAndGotchas: z.array(llmLimitationSchema).optional().default([]),
  commonMisreadings: z.array(llmMisreadingSchema).optional().default([]),
  realWorldMeaning: llmRealWorldMeaningSchema,
  practicalUse: llmPracticalUseSchema,
  whoThisAppliesTo: llmWhoAppliesSchema,
  questionsToAskBeforeTrustingIt: z.array(llmQuestionSchema).optional().default([]),
  furtherReading: llmFurtherReadingSchema,
  methodologySnapshot: llmMethodologySnapshotSchema,
  keyTerms: z.array(llmKeyTermSchema).optional().default([]),
  missingInfo: z.array(llmMissingInfoSchema).optional().default([]),
  disclaimer: maybeString,
});

export type LlmAnalysisDraft = z.infer<typeof llmAnalysisSchema>;
export type StructuredAnalysisDraft = z.infer<typeof structuredAnalysisSchema>;
export type EditorialSummaryDraft = z.infer<typeof editorialSummarySchema>;

export type NormalizedAnalysis = {
  paperMetadata?: {
    title: string;
    authors: string[];
    journal: string;
    publicationYear: string;
  };
  bottomLine: string;
  whatTheyActuallyStudied: string;
  editorialView: {
    openingHook: string;
    orientation: string;
    findings: Array<{
      heading: string;
      body: string;
    }>;
    trustNarrative: string;
    questionsWorthAsking: string[];
    deeperDive: {
      howDesignedTitle: string;
      howDesignedBody: string;
      cantTellUsTitle: string;
      cantTellUsBody: string;
      biggerPictureTitle: string;
      biggerPictureBody: string;
      technicallyCuriousTitle: string;
      technicallyCuriousBody: string;
    };
  };
  primarySummary: {
    bottomLine: string;
    insightNarrative: string;
    whyThisMatters: string;
    trustSignal: {
      label: (typeof nuancedTrustLabelValues)[number];
      summary: string;
      confidenceLevel: (typeof confidenceValues)[number];
    };
    mainTakeaways: string[];
    suggestedQuestions: string[];
  };
  suggestedQuestions: string[];
  trustRating: {
    rating: (typeof trustRatingValues)[number];
    reason: string;
    confidenceLevel: (typeof confidenceValues)[number];
    citationUse: string;
  };
  takeaway: string;
  practicalRelevance: string;
  whatPaperActuallyShows: {
    studyType: string;
    population: string;
    interventionOrExposure: string;
    outcomesMeasured: string;
    observedResult: string;
    claimType: (typeof claimTypeValues)[number];
  };
  whatItDoesNotShow: string[];
  keyFindings: Array<{
    finding: string;
    sourceInPaper: string;
    populationOrSample: string;
    effectDirection: string;
    strengthOfSupport: (typeof findingSupportValues)[number];
    plainEnglishMeaning: string;
    sourceText?: string | null;
  }>;
  evidenceQuality: {
    studyType: string;
    sampleSize: string;
    controlsOrComparisonGroups: string;
    statisticalDetail: string;
    effectSizes: string;
    replication: string;
    publicationBiasRisk: string;
    fundingConflictVisibility: string;
    generalisability: string;
  };
  limitationsAndGotchas: Array<{
    severity: (typeof limitationSeverityValues)[number];
    limitation: string;
    whyItMatters: string;
    practicalConsequence: string;
    whatWouldStrengthenIt: string;
  }>;
  commonMisreadings: Array<{
    misleadingClaim: string;
    whatThePaperSupports: string;
    whyTheDistinctionMatters: string;
  }>;
  realWorldMeaning: {
    summary: string;
    sensibleInterpretation: string;
    whatToAvoid: string;
    citationGuidance: string;
  };
  practicalUse: {
    recommendation: (typeof actionabilityValues)[number];
    reasoning: string;
    caution: string;
  };
  whoThisAppliesTo: {
    likelyAppliesTo: string[];
    mayNotApplyTo: string[];
    uncertainty: string;
  };
  questionsToAskBeforeTrustingIt: Array<{
    question: string;
    whyAskThis: string;
  }>;
  furtherReading: {
    note: string;
    suggestions: string[];
  };
  methodologySnapshot: {
    design: string;
    searchSource: string;
    inclusionExclusionCriteria: string;
    numberOfStudiesOrParticipants: string;
    analysisMethod: string;
    prismaMetaAnalysisStatistics: string;
  };
  keyTerms: Array<{
    term: string;
    simpleEnglish: string;
  }>;
  missingInfo: Array<{
    item: string;
    whyItMatters: string;
  }>;
  disclaimer: string;
  confidenceLevel: (typeof confidenceValues)[number];
  briefSummary: string;
  plainEnglishSummary: string;
};

type StoredAnalysisRecord = {
  briefSummary?: unknown;
  plainEnglishSummary?: unknown;
  documentType?: unknown;
  keyPoints?: unknown;
  keyFindings?: unknown;
  methodology?: unknown;
  limitations?: unknown;
  gotchas?: unknown;
  conflictingInterests?: unknown;
  practicalApplications?: unknown;
  unusualTerms?: unknown;
  missingInfo?: unknown;
  questionsToAsk?: unknown;
  confidenceLevel?: unknown;
  confidenceNotes?: unknown;
};

function isStoredNormalizedAnalysis(value: unknown): value is NormalizedAnalysis {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NormalizedAnalysis>;
  return (
    typeof candidate.bottomLine === "string" &&
    typeof candidate.whatTheyActuallyStudied === "string" &&
    Boolean(candidate.editorialView) &&
    typeof candidate.editorialView?.openingHook === "string" &&
    Boolean(candidate.primarySummary) &&
    typeof candidate.primarySummary?.insightNarrative === "string" &&
    Array.isArray(candidate.suggestedQuestions) &&
    Boolean(candidate.trustRating) &&
    typeof candidate.trustRating?.reason === "string"
  );
}

export function normalizeAnalysisDraft(
  draft: LlmAnalysisDraft,
  context: { documentType: string; text: string },
): NormalizedAnalysis {
  const evidenceQuality = normalizeEvidenceQuality(draft.evidenceQuality, context.text, context.documentType);
  const confidenceLevel = deriveConfidenceLevel(
    draft.trustRating?.confidenceLevel,
    evidenceQuality,
    draft.limitationsAndGotchas,
  );
  const trustRating = normalizeTrustRating(draft, evidenceQuality, confidenceLevel);
  const whatPaperActuallyShows = normalizeWhatShows(draft, evidenceQuality, context.documentType);
  const limitationsAndGotchas = normalizeLimitations(draft.limitationsAndGotchas, evidenceQuality, context.text);
  const missingInfo = normalizeMissingInfo(draft.missingInfo, evidenceQuality, context.text);
  const whatItDoesNotShow = normalizeWhatItDoesNotShow(
    draft.whatItDoesNotShow,
    whatPaperActuallyShows,
    limitationsAndGotchas,
  );
  const keyFindings = normalizeKeyFindings(draft.keyFindings, whatPaperActuallyShows, trustRating);
  const commonMisreadings = normalizeMisreadings(
    draft.commonMisreadings,
    keyFindings,
    whatItDoesNotShow,
    whatPaperActuallyShows,
  );
  const realWorldMeaning = normalizeRealWorldMeaning(draft.realWorldMeaning, trustRating, whatPaperActuallyShows);
  const practicalUse = normalizePracticalUse(draft.practicalUse, trustRating, context.documentType);
  const whoThisAppliesTo = normalizeWhoApplies(draft.whoThisAppliesTo, whatPaperActuallyShows);
  const questionsToAskBeforeTrustingIt = normalizeQuestions(
    draft.questionsToAskBeforeTrustingIt,
    missingInfo,
    limitationsAndGotchas,
  );
  const furtherReading = normalizeFurtherReading(draft.furtherReading, context.documentType);
  const methodologySnapshot = normalizeMethodologySnapshot(
    draft.methodologySnapshot,
    evidenceQuality,
    context.documentType,
  );
  const keyTerms = normalizeKeyTerms(draft.keyTerms);
  const bottomLine = normalizeBottomLine(draft.bottomLine, whatPaperActuallyShows, trustRating);
  const whatTheyActuallyStudied = normalizeWhatTheyStudied(whatPaperActuallyShows, evidenceQuality);
  const takeaway = normalizeTakeaway(draft, trustRating, whatPaperActuallyShows, realWorldMeaning, practicalUse);
  const practicalRelevance = normalizePracticalRelevance(trustRating, realWorldMeaning, practicalUse, context.documentType);
  const suggestedQuestions = normalizeSuggestedQuestions(
    draft.questionsToAskBeforeTrustingIt,
    whatPaperActuallyShows,
    evidenceQuality,
    limitationsAndGotchas,
    keyFindings,
    context.documentType,
  );
  const primarySummary = normalizePrimarySummary(
    bottomLine,
    trustRating,
    whatPaperActuallyShows,
    keyFindings,
    realWorldMeaning,
    takeaway,
    suggestedQuestions,
    limitationsAndGotchas,
    context.documentType,
  );
  const disclaimer = normalizeDisclaimer(draft.disclaimer);

  return {
    bottomLine,
    whatTheyActuallyStudied,
    editorialView: buildFallbackEditorialView(
      bottomLine,
      suggestedQuestions,
      trustRating,
      keyFindings,
      whatTheyActuallyStudied,
      methodologySnapshot,
      whatItDoesNotShow,
      practicalRelevance,
    ),
    primarySummary,
    suggestedQuestions,
    trustRating,
    takeaway,
    practicalRelevance,
    whatPaperActuallyShows,
    whatItDoesNotShow,
    keyFindings,
    evidenceQuality,
    limitationsAndGotchas,
    commonMisreadings,
    realWorldMeaning,
    practicalUse,
    whoThisAppliesTo,
    questionsToAskBeforeTrustingIt,
    furtherReading,
    methodologySnapshot,
    keyTerms,
    missingInfo,
    disclaimer,
    confidenceLevel,
    briefSummary: bottomLine,
    plainEnglishSummary: realWorldMeaning.summary,
  };
}

export function buildAnalysisFromPasses(
  structured: StructuredAnalysisDraft,
  editorial: EditorialSummaryDraft,
  context: { documentType: string; text: string },
): NormalizedAnalysis {
  const hasEditorialContent = [
    editorial.openingHook,
    editorial.orientation,
    editorial.trustNarrative,
    ...editorial.questionsWorthAsking,
  ]
    .map(cleanText)
    .some(Boolean);
  const effectiveEditorial = hasEditorialContent ? editorial : createFallbackEditorialFromStructured(structured);
  const draft = llmAnalysisSchema.parse({
    bottomLine: [effectiveEditorial.orientation, effectiveEditorial.openingHook].map(cleanText).filter(Boolean).join(" "),
    trustRating: {
      rating: structured.trust.rating,
      reason: structured.trust.reason,
      confidenceLevel: structured.trust.confidenceLevel,
      citationUse: structured.trust.citationUse,
    },
    whatPaperActuallyShows: {
      studyType: structured.study.type,
      population: structured.study.population,
      interventionOrExposure: structured.study.interventionOrExposure,
      outcomesMeasured: structured.study.outcomes,
      observedResult: structured.study.mainResult,
      claimType: structured.study.claimType,
    },
    whatItDoesNotShow: structured.nonClaims,
    keyFindings: structured.findings.map((item) => ({
      finding: item.finding,
      sourceInPaper: "",
      populationOrSample: item.populationOrSample,
      effectDirection: "",
      strengthOfSupport: item.supportLevel,
      plainEnglishMeaning: item.plainMeaning,
      sourceText: item.sourceText,
    })),
    evidenceQuality: {
      studyType: structured.evidenceSignals.studyType,
      sampleSize: structured.evidenceSignals.sampleSize,
      controlsOrComparisonGroups: structured.evidenceSignals.controls,
      statisticalDetail: "",
      effectSizes: "",
      replication: "",
      publicationBiasRisk: "",
      fundingConflictVisibility: "",
      generalisability: "",
    },
    limitationsAndGotchas: structured.limitations.map((item) => ({
      severity: "Important limitation" as const,
      limitation: item.limitation,
      whyItMatters: item.whyItMatters,
      practicalConsequence: "",
      whatWouldStrengthenIt: "",
    })),
    commonMisreadings: structured.misreadings.map((item) => ({
      misleadingClaim: item.misleadingClaim,
      whatThePaperSupports: item.whatThePaperSupports,
      whyTheDistinctionMatters: "",
    })),
    realWorldMeaning: {
      summary: effectiveEditorial.orientation || structured.relevance.whyItMatters,
      sensibleInterpretation: effectiveEditorial.trustNarrative,
      whatToAvoid: structured.nonClaims[0],
      citationGuidance: structured.trust.citationUse,
    },
    practicalUse: {
      recommendation: undefined,
      reasoning: "",
      caution: "",
    },
    questionsToAskBeforeTrustingIt: dedupeStrings([
      ...structured.suggestedQuestions,
      ...effectiveEditorial.questionsWorthAsking,
    ]).map((question) => ({ question, whyAskThis: "Questions worth exploring" })),
    furtherReading: {
      note: "",
      suggestions: [],
    },
    methodologySnapshot: structured.methodologySnapshot,
    keyTerms: structured.keyTerms,
    missingInfo: structured.missingInfo,
    disclaimer: structured.disclaimer,
  });

  const normalized = normalizeAnalysisDraft(draft, context);
  const editorialQuestions = effectiveEditorial.questionsWorthAsking.map(cleanText).filter(Boolean);
  const dedupedQuestions = dedupeStrings(
    editorialQuestions.length > 0
      ? editorialQuestions
      : [
          ...structured.suggestedQuestions,
          ...normalized.suggestedQuestions,
        ],
  ).slice(0, 4);
  const trustLabel = deriveNuancedTrustLabel(
    normalized.trustRating,
    normalized.whatPaperActuallyShows,
    normalized.limitationsAndGotchas,
  );
  const editorialTakeaways = effectiveEditorial.findings
    .map((item) => cleanText(item.heading) || cleanText(item.body))
    .filter(Boolean);
  const editorialView = buildEditorialView(
    effectiveEditorial,
    normalized,
    dedupedQuestions,
  );

  return {
    ...normalized,
    paperMetadata: {
      title: structured.paperMetadata?.title ?? "",
      authors: structured.paperMetadata?.authors ?? [],
      journal: structured.paperMetadata?.journal ?? "",
      publicationYear: structured.paperMetadata?.publicationYear ?? "",
    },
    bottomLine: constrainBottomLine(editorialView.orientation || normalized.bottomLine),
    editorialView,
    primarySummary: {
      bottomLine: constrainBottomLine(editorialView.orientation || normalized.primarySummary.bottomLine),
      insightNarrative: constrainNarrative(
        [
          cleanText(editorialView.openingHook),
          cleanText(editorialView.orientation),
          [
            ...editorialView.findings.map((item) => [cleanText(item.heading), cleanText(item.body)].filter(Boolean).join("\n")),
          ]
            .filter(Boolean)
            .join("\n\n"),
          cleanText(editorialView.trustNarrative),
        ]
          .filter(Boolean)
          .join("\n\n") || normalized.primarySummary.insightNarrative,
      ),
      whyThisMatters: constrainBottomLine(editorialView.openingHook || normalized.primarySummary.whyThisMatters),
      trustSignal: {
        label: trustLabel,
        summary: constrainBottomLine(editorialView.trustNarrative || normalized.primarySummary.trustSignal.summary),
        confidenceLevel: normalized.trustRating.confidenceLevel,
      },
      mainTakeaways: dedupeStrings(
        editorialTakeaways.length > 0
          ? editorialTakeaways
          : normalized.primarySummary.mainTakeaways,
      ).filter(Boolean).slice(0, 3),
      suggestedQuestions: dedupedQuestions,
    },
    suggestedQuestions: dedupedQuestions,
    takeaway: constrainBottomLine(editorialView.trustNarrative || normalized.takeaway),
    practicalRelevance: constrainBottomLine(editorialView.deeperDive.biggerPictureBody || normalized.practicalRelevance),
  };
}

function createFallbackEditorialFromStructured(structured: StructuredAnalysisDraft): EditorialSummaryDraft {
  const studyType = cleanText(structured.study.type) || "study";
  const mainResult = cleanText(structured.study.mainResult) || "The paper reports a potentially interesting signal.";
  const mainFinding = cleanText(structured.findings[0]?.plainMeaning) || cleanText(structured.findings[0]?.finding);
  const whyThisMatters = cleanText(structured.relevance.whyItMatters) || cleanText(structured.relevance.practicalMeaning);
  const trust = cleanText(structured.trust.reason) || "The evidence is still early and should be treated cautiously.";
  const sample = cleanText(structured.evidenceSignals.sampleSize);
  const limitation = cleanText(structured.limitations[0]?.limitation);
  return {
    openingHook:
      whyThisMatters ||
      "This paper points to an interesting signal, but you need a little context to know how much weight to put on it.",
    orientation: synthesizeEditorialBottomLine(studyType, mainResult, mainFinding, sample, limitation),
    findings: dedupeBy(
      structured.findings
        .slice(0, 4)
        .map((item) => ({
          heading: cleanText(item.finding),
          body: cleanText(item.plainMeaning) || cleanText(item.finding),
        }))
        .filter((item) => item.heading || item.body),
      (item) => `${item.heading}-${item.body}`,
    ),
    trustNarrative: synthesizeEditorialTrust(trust, sample, limitation, studyType),
    questionsWorthAsking: synthesizeCuriousQuestions(structured),
    deeperDive: {
      howDesignedTitle: "How the study was designed",
      howDesignedBody:
        cleanText(structured.methodologySnapshot.design) ||
        cleanText(structured.study.type) ||
        "The paper describes the setup, but the design details are limited in the available text.",
      cantTellUsTitle: "What this study can't tell us",
      cantTellUsBody:
        cleanText(structured.limitations[0]?.whyItMatters) ||
        cleanText(structured.nonClaims[0]) ||
        "It leaves important open questions about how broadly the result applies.",
      biggerPictureTitle: "Where this fits in the bigger picture",
      biggerPictureBody:
        cleanText(structured.relevance.practicalMeaning) ||
        "Treat this as one useful piece of evidence, not a final answer on its own.",
      technicallyCuriousTitle: "For the technically curious",
      technicallyCuriousBody: synthesizeTechnicalCuriousBody(structured),
    },
  };
}

function synthesizeEditorialBottomLine(
  studyType: string,
  mainResult: string,
  mainFinding: string,
  sample: string,
  limitation: string,
): string {
  const normalizedMainResult = mainResult.replace(/\.$/, "");
  const sampleText = humanizeSampleSize(sample);
  const setupText = sampleText ? ` In a ${studyType.toLowerCase()} involving ${sampleText},` : "";
  const findingText = mainFinding
    ? ` ${lowercaseFirst(mainFinding.replace(/\.$/, ""))}.`
    : ` ${normalizedMainResult}.`;
  const caveatText = limitation
    ? ` Still, ${lowercaseFirst(limitation.replace(/\.$/, ""))}.`
    : "";
  return constrainBottomLine(`${normalizedMainResult}.${setupText}${findingText}${caveatText}`.replace(/\.\s+\./g, "."));
}

function synthesizeEditorialTrust(
  trust: string,
  sample: string,
  limitation: string,
  studyType: string,
): string {
  const samplePhrase = humanizeSampleSize(sample) || `one ${studyType.toLowerCase()}`;
  const limitationPhrase = limitation ? ` The biggest constraint is ${lowercaseFirst(limitation.replace(/\.$/, ""))}.` : "";
  return constrainBottomLine(`This is interesting, but it is still early evidence. It comes from ${samplePhrase}, so it is better treated as suggestive than conclusive.${limitationPhrase} ${trust}`.trim());
}

function synthesizeCuriousQuestions(structured: StructuredAnalysisDraft): string[] {
  const questions: string[] = [];
  const result = cleanText(structured.study.mainResult).toLowerCase();
  const outcome = cleanText(structured.study.outcomes).toLowerCase();

  if (/sleep|depriv/i.test(result + " " + outcome)) {
    questions.push("Would this still matter with normal sleep restriction instead of a full night without sleep?");
    questions.push("Is the effect actually noticeable in real life, or mainly on lab-based tasks?");
  }

  if (structured.evidenceSignals.sampleSize) {
    questions.push("Would the same effect show up in a much larger study?");
  }

  questions.push("What kind of person would be most likely to benefit if this signal is real?");
  return dedupeStrings(questions).slice(0, 4);
}

function humanizeSampleSize(sample: string): string {
  if (!sample) return "";
  const match = sample.match(/\b(?:n\s*=\s*)?(\d+)\b/i);
  if (!match) return sample;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return sample;
  if (/participants|people|adults|subjects|patients|volunteers/i.test(sample)) {
    return sample.replace(/\bn\s*=\s*\d+\b/i, `${count}`).trim();
  }
  return `${count} people`;
}

function buildEditorialView(
  editorial: EditorialSummaryDraft,
  normalized: NormalizedAnalysis,
  dedupedQuestions: string[],
): NormalizedAnalysis["editorialView"] {
  const findings = editorial.findings
    .map((item) => ({
      heading: cleanText(item.heading),
      body: cleanText(item.body),
    }))
    .filter((item) => item.heading || item.body)
    .slice(0, 5);

  return {
    openingHook:
      cleanText(editorial.openingHook) ||
      normalized.primarySummary.whyThisMatters ||
      normalized.bottomLine,
    orientation:
      constrainBottomLine(cleanText(editorial.orientation) || normalized.bottomLine),
    findings,
    trustNarrative:
      cleanText(editorial.trustNarrative) || normalized.primarySummary.trustSignal.summary,
    questionsWorthAsking: dedupedQuestions,
    deeperDive: {
      howDesignedTitle: cleanText(editorial.deeperDive?.howDesignedTitle) || "How the study was designed",
      howDesignedBody: cleanText(editorial.deeperDive?.howDesignedBody) || "",
      cantTellUsTitle: cleanText(editorial.deeperDive?.cantTellUsTitle) || "What this study can't tell us",
      cantTellUsBody: cleanText(editorial.deeperDive?.cantTellUsBody) || "",
      biggerPictureTitle: cleanText(editorial.deeperDive?.biggerPictureTitle) || "Where this fits in the bigger picture",
      biggerPictureBody: cleanText(editorial.deeperDive?.biggerPictureBody) || "",
      technicallyCuriousTitle:
        cleanText(editorial.deeperDive?.technicallyCuriousTitle) || "For the technically curious",
      technicallyCuriousBody:
        cleanText(editorial.deeperDive?.technicallyCuriousBody) ||
        synthesizeTechnicalCuriousBodyFromNormalized(normalized),
    },
  };
}

function buildFallbackEditorialView(
  bottomLine: string,
  suggestedQuestions: string[],
  trustRating: NormalizedAnalysis["trustRating"],
  keyFindings: NormalizedAnalysis["keyFindings"],
  whatTheyActuallyStudied: string,
  methodologySnapshot: NormalizedAnalysis["methodologySnapshot"],
  whatItDoesNotShow: string[],
  practicalRelevance: string,
): NormalizedAnalysis["editorialView"] {
  return {
    openingHook: bottomLine,
    orientation: bottomLine,
    findings: keyFindings.slice(0, 4).map((item) => ({
      heading: item.finding,
      body: item.plainEnglishMeaning,
    })),
    trustNarrative: trustRating.reason,
    questionsWorthAsking: suggestedQuestions.slice(0, 4),
    deeperDive: {
      howDesignedTitle: "How the study was designed",
      howDesignedBody: methodologySnapshot.design || whatTheyActuallyStudied,
      cantTellUsTitle: "What this study can't tell us",
      cantTellUsBody: whatItDoesNotShow.slice(0, 3).join(" "),
      biggerPictureTitle: "Where this fits in the bigger picture",
      biggerPictureBody: practicalRelevance,
      technicallyCuriousTitle: "For the technically curious",
      technicallyCuriousBody: synthesizeTechnicalCuriousBodyFromNormalized({
        evidenceQuality: {
          studyType: "",
          sampleSize: "",
          controlsOrComparisonGroups: "",
          statisticalDetail: "",
          effectSizes: "",
          replication: "",
          publicationBiasRisk: "",
          fundingConflictVisibility: "",
          generalisability: "",
        },
        limitationsAndGotchas: [],
        trustRating,
        methodologySnapshot,
      }),
    },
  };
}

function synthesizeTechnicalCuriousBody(structured: StructuredAnalysisDraft): string {
  const hasAnyTechnicalSignal = [
    cleanText(structured.study.type),
    cleanText(structured.methodologySnapshot.design),
    cleanText(structured.evidenceSignals.sampleSize),
    cleanText(structured.evidenceSignals.controls),
    cleanText(structured.limitations[0]?.limitation),
  ].some(Boolean);

  if (!hasAnyTechnicalSignal) {
    return "The available text does not give enough technical detail to go much deeper than the main explanation.";
  }

  const sample = cleanText(structured.evidenceSignals.sampleSize);
  const limitation = cleanText(structured.limitations[0]?.whyItMatters) || cleanText(structured.limitations[0]?.limitation);

  return [
    cleanText(structured.methodologySnapshot.design) || cleanText(structured.study.type),
    sample ? `The sample context is ${sample}.` : "",
    limitation ? `The main technical constraint is ${lowercaseFirst(limitation.replace(/\.$/, ""))}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function synthesizeTechnicalCuriousBodyFromNormalized(
  normalized: Pick<
    NormalizedAnalysis,
    "evidenceQuality" | "limitationsAndGotchas" | "trustRating" | "methodologySnapshot"
  >,
): string {
  const evidence = normalized.evidenceQuality;
  const limitation =
    cleanText(normalized.limitationsAndGotchas[0]?.whyItMatters) ||
    cleanText(normalized.limitationsAndGotchas[0]?.limitation);

  const sentences = [
    cleanText(normalized.methodologySnapshot.design) ||
      cleanText(evidence.studyType) ||
      "",
    cleanText(evidence.sampleSize) ? `The sample context is ${cleanText(evidence.sampleSize)}.` : "",
    cleanText(evidence.controlsOrComparisonGroups)
      ? `The comparison structure was ${lowercaseFirst(cleanText(evidence.controlsOrComparisonGroups).replace(/\.$/, ""))}.`
      : "",
    cleanText(evidence.statisticalDetail)
      ? `The statistical detail available here is ${lowercaseFirst(cleanText(evidence.statisticalDetail).replace(/\.$/, ""))}.`
      : "",
    cleanText(evidence.effectSizes)
      ? `Effect sizes are described as ${lowercaseFirst(cleanText(evidence.effectSizes).replace(/\.$/, ""))}.`
      : "",
    cleanText(evidence.replication)
      ? `Replication looks like ${lowercaseFirst(cleanText(evidence.replication).replace(/\.$/, ""))}.`
      : "",
    limitation ? `The main technical constraint is ${lowercaseFirst(limitation.replace(/\.$/, ""))}.` : "",
    cleanText(normalized.trustRating.citationUse) || "",
  ].filter(Boolean);

  return sentences.join(" ") || "The deeper technical picture is limited in the available text, so the main value here is the study design and the shape of the signal rather than a full statistical breakdown.";
}

export function normalizeStoredAnalysis(
  record: StoredAnalysisRecord,
  documentType = "unknown",
): NormalizedAnalysis {
  const keyPoints = asObject(record.keyPoints);
  const conflictingInterests = asObject(record.conflictingInterests);
  const practicalApplications = asObject(record.practicalApplications);
  const methodology = asObject(record.methodology);
  const storedNormalized =
    (keyPoints && isStoredNormalizedAnalysis((keyPoints as Record<string, unknown>).analysisV2)
      ? ((keyPoints as Record<string, unknown>).analysisV2 as NormalizedAnalysis)
      : null) ||
    (practicalApplications && isStoredNormalizedAnalysis((practicalApplications as Record<string, unknown>).analysisV2)
      ? ((practicalApplications as Record<string, unknown>).analysisV2 as NormalizedAnalysis)
      : null);

  if (storedNormalized) {
    return storedNormalized;
  }

  if (keyPoints || conflictingInterests || practicalApplications || methodology) {
    const draft = llmAnalysisSchema.parse({
      bottomLine: asString(record.briefSummary),
      trustRating: conflictingInterests?.trustRating,
      whatPaperActuallyShows: keyPoints?.whatPaperActuallyShows,
      whatItDoesNotShow: keyPoints?.whatItDoesNotShow,
      keyFindings: asArray(record.keyFindings),
      evidenceQuality: conflictingInterests?.evidenceQuality,
      limitationsAndGotchas: asArray(record.limitations),
      commonMisreadings: asArray(record.gotchas),
      realWorldMeaning: practicalApplications?.realWorldMeaning,
      practicalUse: practicalApplications?.practicalUse,
      whoThisAppliesTo: keyPoints?.whoThisAppliesTo,
      questionsToAskBeforeTrustingIt: asArray(record.questionsToAsk),
      furtherReading: practicalApplications?.furtherReading,
      methodologySnapshot: methodology?.methodologySnapshot,
      keyTerms: asArray(record.unusualTerms),
      missingInfo: asArray(record.missingInfo),
      disclaimer: asString(record.confidenceNotes),
    });

    return normalizeAnalysisDraft(draft, {
      documentType,
      text: [asString(record.briefSummary), asString(record.plainEnglishSummary)].filter(Boolean).join("\n\n"),
    });
  }

  return normalizeLegacyStoredAnalysis(record, documentType);
}

export function createLegacyNormalizedAnalysisForTest(
  record: StoredAnalysisRecord,
  documentType = "unknown",
): NormalizedAnalysis {
  return normalizeLegacyStoredAnalysis(record, documentType);
}

export function packAnalysisForStorage(analysis: NormalizedAnalysis) {
  return {
    briefSummary: analysis.briefSummary,
    plainEnglishSummary: analysis.plainEnglishSummary,
    documentType: analysis.whatPaperActuallyShows.studyType || "unknown",
    keyPoints: {
      analysisV2: analysis,
      whatPaperActuallyShows: analysis.whatPaperActuallyShows,
      whatItDoesNotShow: analysis.whatItDoesNotShow,
      whoThisAppliesTo: analysis.whoThisAppliesTo,
    },
    keyFindings: analysis.keyFindings,
    methodology: {
      methodologySnapshot: analysis.methodologySnapshot,
    },
    limitations: analysis.limitationsAndGotchas,
    gotchas: analysis.commonMisreadings,
    conflictingInterests: {
      trustRating: analysis.trustRating,
      evidenceQuality: analysis.evidenceQuality,
    },
    practicalApplications: {
      analysisV2: analysis,
      realWorldMeaning: analysis.realWorldMeaning,
      practicalUse: analysis.practicalUse,
      furtherReading: analysis.furtherReading,
    },
    unusualTerms: analysis.keyTerms,
    missingInfo: analysis.missingInfo,
    questionsToAsk: analysis.questionsToAskBeforeTrustingIt,
    confidenceLevel: analysis.confidenceLevel,
    confidenceNotes: analysis.disclaimer,
  };
}

function normalizeLegacyStoredAnalysis(record: StoredAnalysisRecord, documentType: string): NormalizedAnalysis {
  const legacyKeyFindings = asArray(record.keyFindings);
  const legacyFindingsText = legacyKeyFindings
    .map((item: any) => [asString(item?.finding), asString(item?.explanation)].filter(Boolean).join(": "))
    .filter(Boolean)
    .join(" ");
  const synthesizedBottomLine =
    asString(record.briefSummary) ||
    asString(record.plainEnglishSummary) ||
    legacyFindingsText ||
    "This paper reports a signal, but the strength of the evidence needs context.";
  const draft = llmAnalysisSchema.parse({
    bottomLine: synthesizedBottomLine,
    whatPaperActuallyShows: {
      studyType: asString(record.documentType) || documentType,
      observedResult: asString(record.plainEnglishSummary) || legacyFindingsText || MISSING,
    },
    keyFindings: legacyKeyFindings.map((item: any) => ({
      finding: asString(item?.finding),
      plainEnglishMeaning: asString(item?.explanation),
      sourceText: typeof item?.sourceText === "string" ? item.sourceText : null,
      effectDirection: asString(item?.significance),
      strengthOfSupport: legacyConfidenceToSupport(item?.confidence),
      sourceInPaper: MISSING,
      populationOrSample: MISSING,
    })),
    evidenceQuality: {
      studyType: asString(record.documentType) || documentType || MISSING,
    },
    limitationsAndGotchas: asArray(record.limitations).map((item: any) => ({
      severity: legacySeverityToLimitation(item?.severity),
      limitation: asString(item?.limitation),
      whyItMatters: asString(item?.impact),
      practicalConsequence: "This should lower confidence by a measured amount, not erase the paper's signal.",
      whatWouldStrengthenIt: "Clearer methods, larger samples, better controls, or replication would strengthen confidence.",
    })),
    commonMisreadings: [],
    realWorldMeaning: {
      summary: asString(record.plainEnglishSummary) || synthesizedBottomLine,
    },
    questionsToAskBeforeTrustingIt: asArray(record.questionsToAsk),
    keyTerms: asArray(record.unusualTerms).map((item: any) => ({
      term: asString(item?.term),
      simpleEnglish: asString(item?.whyItMayBeUnusual),
    })),
    missingInfo: sanitizeLegacyVisibilityItems(asArray(record.missingInfo)),
    disclaimer: asString(record.confidenceNotes),
    trustRating: {
      confidenceLevel: normalizeConfidenceLevel(asString(record.confidenceLevel)),
    },
  });

  return normalizeAnalysisDraft(draft, {
    documentType,
    text: [asString(record.briefSummary), asString(record.plainEnglishSummary)].filter(Boolean).join("\n\n"),
  });
}

function sanitizeLegacyVisibilityItems(items: any[]): Array<{ item: string; whyItMatters: string }> {
  const normalized = items
    .map((item: any) => sanitizeLegacyVisibilityItem(asString(item?.item), asString(item?.whyItMatters)))
    .filter((item): item is { item: string; whyItMatters: string } => Boolean(item));

  return dedupeBy(normalized, (item) => item.item.toLowerCase());
}

function sanitizeLegacyVisibilityItem(
  rawItem: string,
  rawWhy: string,
): { item: string; whyItMatters: string } | null {
  const item = cleanText(rawItem);
  const why = cleanText(rawWhy);
  const combined = `${item} ${why}`.toLowerCase();

  if (!item && !why) return null;

  if (/funding|conflict|coi|sponsor/.test(combined)) {
    return {
      item: "Funding/COI details are not visible in the uploaded text.",
      whyItMatters: "That limits transparency, but it does not automatically imply bias or invalidate the paper.",
    };
  }

  if (/hide|selection process|prisma|screen numbers/.test(combined)) {
    return {
      item: "The full study-selection details are not fully visible in the uploaded text.",
      whyItMatters: "That limits how closely the review process can be checked from this excerpt alone.",
    };
  }

  if (/risk of bias|study quality/.test(combined)) {
    return {
      item: "The full study-quality or risk-of-bias assessment is not visible in the uploaded text.",
      whyItMatters: "That limits how precisely the included studies can be weighed from this excerpt alone.",
    };
  }

  if (/table 1|only .*studies shown|miss key findings/.test(combined)) {
    return {
      item: "Some tables or study details appear only partially visible in the uploaded text.",
      whyItMatters: "That means some study-level context may be missing from this view, even if it exists in the full paper.",
    };
  }

  return {
    item: item || "Some details are not fully visible in the uploaded text.",
    whyItMatters:
      why ||
      "That limits what can be checked from this excerpt alone, but does not automatically weaken the paper.",
  };
}

function normalizeTrustRating(
  draft: LlmAnalysisDraft,
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  confidenceLevel: NormalizedAnalysis["confidenceLevel"],
): NormalizedAnalysis["trustRating"] {
  const derivedRating = deriveTrustRating(evidenceQuality, draft.limitationsAndGotchas);
  const rating = draft.trustRating?.rating ?? derivedRating;
  const reason =
    cleanText(draft.trustRating?.reason) ||
    buildTrustReason(rating, evidenceQuality, draft.limitationsAndGotchas);
  const citationUse =
    cleanText(draft.trustRating?.citationUse) ||
    deriveCitationUse(rating);

  return {
    rating,
    reason,
    confidenceLevel,
    citationUse,
  };
}

function normalizeWhatShows(
  draft: LlmAnalysisDraft,
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  documentType: string,
): NormalizedAnalysis["whatPaperActuallyShows"] {
  return {
    studyType: fallbackText(draft.whatPaperActuallyShows?.studyType, evidenceQuality.studyType, documentType || MISSING),
    population: fallbackText(draft.whatPaperActuallyShows?.population, MISSING),
    interventionOrExposure: fallbackText(draft.whatPaperActuallyShows?.interventionOrExposure, MISSING),
    outcomesMeasured: fallbackText(draft.whatPaperActuallyShows?.outcomesMeasured, MISSING),
    observedResult: fallbackText(draft.whatPaperActuallyShows?.observedResult, draft.realWorldMeaning?.summary, MISSING),
    claimType: draft.whatPaperActuallyShows?.claimType ?? inferClaimType(evidenceQuality.studyType),
  };
}

function normalizeKeyFindings(
  findings: LlmAnalysisDraft["keyFindings"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  trustRating: NormalizedAnalysis["trustRating"],
): NormalizedAnalysis["keyFindings"] {
  const cleaned = findings
    .map((item) => ({
      finding: cleanText(item.finding),
      sourceInPaper: "",
      populationOrSample: cleanText(item.populationOrSample) || whatShows.population,
      effectDirection: "",
      strengthOfSupport: item.strengthOfSupport ?? trustRatingToSupport(trustRating.rating),
      plainEnglishMeaning: cleanText(item.plainEnglishMeaning) || cleanText(item.finding) || MISSING,
      sourceText: item.sourceText?.trim() || null,
    }))
    .filter((item) => item.finding);

  if (cleaned.length > 0) {
    return cleaned.slice(0, 6);
  }

  return [
    {
      finding: cleanText(whatShows.observedResult) || "Main reported result",
      sourceInPaper: MISSING,
      populationOrSample: whatShows.population,
      effectDirection: MISSING,
      strengthOfSupport: trustRatingToSupport(trustRating.rating),
      plainEnglishMeaning: whatShows.observedResult,
      sourceText: null,
    },
  ];
}

function normalizeEvidenceQuality(
  input: LlmAnalysisDraft["evidenceQuality"],
  text: string,
  documentType: string,
): NormalizedAnalysis["evidenceQuality"] {
  const studyType = fallbackText(input?.studyType, detectStudyType(text), documentType || MISSING);
  return {
    studyType,
    sampleSize: fallbackText(input?.sampleSize, detectSampleSize(text), MISSING),
    controlsOrComparisonGroups: fallbackText(input?.controls, detectControls(text), MISSING),
    statisticalDetail: MISSING,
    effectSizes: MISSING,
    replication: MISSING,
    publicationBiasRisk: inferPublicationBiasRisk(studyType),
    fundingConflictVisibility: MISSING,
    generalisability: MISSING,
  };
}

function normalizeLimitations(
  input: LlmAnalysisDraft["limitationsAndGotchas"],
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  text: string,
): NormalizedAnalysis["limitationsAndGotchas"] {
  const cleaned = input
    .map((item) => ({
      severity: inferLimitationSeverity(item.limitation, item.whyItMatters),
      limitation: cleanText(item.limitation),
      whyItMatters: cleanText(item.whyItMatters),
      practicalConsequence: "",
      whatWouldStrengthenIt: "",
    }))
    .filter((item) => item.limitation && item.whyItMatters);

  const derived: NormalizedAnalysis["limitationsAndGotchas"] = [];

  const sampleMatch = evidenceQuality.sampleSize.match(/\b(?:n\s*=\s*)?(\d+)\b/i);
  const sampleCount = sampleMatch ? Number(sampleMatch[1]) : null;

  if (sampleCount !== null && sampleCount > 0 && sampleCount < 50) {
    derived.push({
      severity: sampleCount < 25 ? "Major limitation" : "Important limitation",
      limitation: "Small sample size.",
      whyItMatters: "Small studies are more likely to give unstable results and can make effects look larger or cleaner than they really are.",
      practicalConsequence: "Treat the signal as preliminary rather than assuming it will hold up in bigger studies.",
      whatWouldStrengthenIt: "Larger, better-powered studies would make the result more convincing.",
    });
  }

  if (hasExplicitMissingEffectSize(text, evidenceQuality.effectSizes)) {
    derived.push({
      severity: "Important limitation",
      limitation: "Effect sizes are not clearly reported.",
      whyItMatters: "A statistically significant result can still be too small to matter in real life.",
      practicalConsequence: "Treat the effect as directionally interesting rather than assuming it is large.",
      whatWouldStrengthenIt: "Effect sizes and confidence intervals would make the practical importance clearer.",
    });
  }

  if (hasExplicitMissingFundingInfo(text)) {
    derived.push({
      severity: "Minor / transparency note",
      limitation: "Funding or COI details are not visible in the uploaded text.",
      whyItMatters: "That limits transparency, but it does not by itself imply bias or invalidate the paper.",
      practicalConsequence: "Keep it as a small note rather than a major reason to discount the findings.",
      whatWouldStrengthenIt: "A visible funding and competing-interests statement would make transparency clearer.",
    });
  }

  if (/systematic review/i.test(evidenceQuality.studyType) && !/meta-analysis/i.test(text.toLowerCase())) {
    derived.push({
      severity: "Important limitation",
      limitation: "This appears to be a systematic review without a meta-analysis.",
      whyItMatters: "A review can summarize evidence without quantifying the overall effect size across studies.",
      practicalConsequence: "Use it to understand the landscape, not to claim a precise pooled effect.",
      whatWouldStrengthenIt: "A meta-analysis or clearer quantitative synthesis would strengthen the evidence.",
    });
  }

  if (/no control group/i.test(text)) {
    derived.push({
      severity: "Major limitation",
      limitation: "No control group is described.",
      whyItMatters: "Without a comparison group, it is hard to tell whether the reported change came from the intervention or from time, expectation, or chance.",
      practicalConsequence: "This sharply limits how confidently the result can be interpreted as a real intervention effect.",
      whatWouldStrengthenIt: "A randomized or matched comparison group would make the claim much stronger.",
    });
  }

  if (/self-reported|questionnaire/i.test(text)) {
    derived.push({
      severity: "Important limitation",
      limitation: "The outcomes appear to rely on self-report.",
      whyItMatters: "Self-reported measures can be useful, but they are more vulnerable to expectation effects and reporting bias than objective outcomes.",
      practicalConsequence: "Interpret the result as meaningful for perception or reported experience first, not automatically as a hard biological change.",
      whatWouldStrengthenIt: "Objective outcome measures or converging results from multiple measure types would strengthen the evidence.",
    });
  }

  return dedupeBy(
    [...cleaned, ...derived],
    (item) => canonicalizeLimitationKey(item.limitation),
  ).slice(0, 4);
}

function normalizeWhatItDoesNotShow(
  input: string[],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  limitations: NormalizedAnalysis["limitationsAndGotchas"],
): string[] {
  const collected = input.map((item) => item.trim()).filter(Boolean);

  if (whatShows.claimType !== "causal") {
    collected.push("This does not prove the relationship is causal.");
  }

  if (limitations.some((item) => /short-term|two-week|follow-up|long-term/i.test(`${item.limitation} ${item.whyItMatters}`))) {
    collected.push("This does not show long-term effects unless the paper explicitly followed people over time.");
  }

  if (whatShows.population === MISSING || /mixed populations|healthy adults|students/i.test(whatShows.population)) {
    collected.push("This does not clearly show who the findings apply to.");
  }

  if (limitations.some((item) => /effect size|clinically meaningful/i.test(item.limitation + item.whyItMatters))) {
    collected.push("This does not prove the effect is large or clinically meaningful.");
  }

  return dedupeStrings(collected).slice(0, 6);
}

function normalizeMisreadings(
  input: LlmAnalysisDraft["commonMisreadings"],
  findings: NormalizedAnalysis["keyFindings"],
  whatItDoesNotShow: string[],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
): NormalizedAnalysis["commonMisreadings"] {
  const cleaned = input
    .map((item) => ({
      misleadingClaim: cleanText(item.misleadingClaim),
      whatThePaperSupports: cleanText(item.whatThePaperSupports),
      whyTheDistinctionMatters: "",
    }))
    .filter((item) => item.misleadingClaim && item.whatThePaperSupports);

  const derived: NormalizedAnalysis["commonMisreadings"] = [];
  if (whatShows.claimType !== "causal") {
    derived.push({
      misleadingClaim: "This paper proves cause and effect.",
      whatThePaperSupports: "The paper reports an association, pattern, or limited signal rather than a decisive causal answer.",
      whyTheDistinctionMatters: whatItDoesNotShow[0] ?? "Turning an association into a hard causal claim can make the science sound stronger than it is.",
    });
  }
  if (whatShows.population !== MISSING) {
    derived.push({
      misleadingClaim: "These findings apply broadly to everyone.",
      whatThePaperSupports: `The result is most directly about ${whatShows.population}.`,
      whyTheDistinctionMatters: "Generalising too far can hide who was actually studied and who may respond differently.",
    });
  }

  return dedupeBy([...cleaned, ...derived], (item) => item.misleadingClaim.toLowerCase()).slice(0, 5);
}

function normalizeRealWorldMeaning(
  input: LlmAnalysisDraft["realWorldMeaning"],
  trustRating: NormalizedAnalysis["trustRating"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
): NormalizedAnalysis["realWorldMeaning"] {
  return {
    summary:
      fallbackText(
        input?.summary,
        `${whatShows.observedResult} Overall, this looks like ${describeEvidenceStrength(trustRating.rating)} rather than a definitive answer.`,
      ) || MISSING,
    sensibleInterpretation:
      fallbackText(
        input?.sensibleInterpretation,
        `Treat this as ${deriveCitationUse(trustRating.rating).toLowerCase()}.`,
      ) || MISSING,
    whatToAvoid:
      fallbackText(
        input?.whatToAvoid,
        "Avoid treating one paper as enough to settle the question or replace stronger bodies of evidence.",
      ) || MISSING,
    citationGuidance:
      fallbackText(
        input?.citationGuidance,
        trustRating.rating === "Strong"
          ? "Reasonable to cite as central evidence if it matches the claim being made."
          : "Safer to cite as background context or weak support unless stronger corroborating evidence exists.",
      ) || MISSING,
  };
}

function normalizePracticalUse(
  input: LlmAnalysisDraft["practicalUse"],
  trustRating: NormalizedAnalysis["trustRating"],
  documentType: string,
): NormalizedAnalysis["practicalUse"] {
  const recommendation =
    input?.recommendation ??
    deriveActionability(trustRating.rating, documentType);

  return {
    recommendation,
    reasoning:
      fallbackText(
        input?.reasoning,
        `${trustRating.reason} ${recommendation === "Do not act on this alone" ? "This is not enough on its own for clinical or high-stakes decisions." : "Any action should stay proportional to the strength of evidence."}`,
      ) || MISSING,
    caution:
      fallbackText(
        input?.caution,
        "Do not change medication, treatment, or safety-critical decisions based on this paper alone.",
      ) || MISSING,
  };
}

function normalizeWhoApplies(
  input: LlmAnalysisDraft["whoThisAppliesTo"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
): NormalizedAnalysis["whoThisAppliesTo"] {
  const likelyAppliesTo = input?.likelyAppliesTo.filter(Boolean) ?? [];
  const mayNotApplyTo = input?.mayNotApplyTo.filter(Boolean) ?? [];

  if (likelyAppliesTo.length === 0) {
    likelyAppliesTo.push(whatShows.population);
  }

  if (mayNotApplyTo.length === 0) {
    mayNotApplyTo.push("People outside the studied population, if the paper does not clearly test them.");
  }

  return {
    likelyAppliesTo: dedupeStrings(likelyAppliesTo).slice(0, 4),
    mayNotApplyTo: dedupeStrings(mayNotApplyTo).slice(0, 4),
    uncertainty: fallbackText(input?.uncertainty, "Applicability is limited by the population and methods described in the uploaded text.") || MISSING,
  };
}

function normalizeQuestions(
  input: LlmAnalysisDraft["questionsToAskBeforeTrustingIt"],
  missingInfo: NormalizedAnalysis["missingInfo"],
  limitations: NormalizedAnalysis["limitationsAndGotchas"],
): NormalizedAnalysis["questionsToAskBeforeTrustingIt"] {
  const cleaned = input
    .map((item) => ({
      question: cleanText(item.question),
      whyAskThis: cleanText(item.whyAskThis),
    }))
    .filter((item) => item.question && item.whyAskThis);

  const derived = [
    ...missingInfo.slice(0, 2).map((item) => ({
      question: deriveVisibilityQuestion(item.item),
      whyAskThis: item.whyItMatters,
    })),
    ...limitations.slice(0, 2).map((item) => ({
      question: `Has this limitation been addressed in newer or stronger studies: ${item.limitation}?`,
      whyAskThis: item.whatWouldStrengthenIt,
    })),
  ];

  return dedupeBy([...cleaned, ...derived], (item) => item.question.toLowerCase()).slice(0, 6);
}

function normalizeSuggestedQuestions(
  input: LlmAnalysisDraft["questionsToAskBeforeTrustingIt"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  limitations: NormalizedAnalysis["limitationsAndGotchas"],
  findings: NormalizedAnalysis["keyFindings"],
  documentType: string,
): string[] {
  const provided = input
    .map((item) => cleanText(item.question))
    .filter(Boolean);

  const studyType = whatShows.studyType.toLowerCase();
  const findingTopic = findings[0]?.finding || whatShows.observedResult;
  const derived: string[] = [];

  if (/review|meta-analysis/.test(studyType)) {
    derived.push(`Which included studies are doing most of the work behind the claim about ${lowercaseFirst(stripTrailingPeriod(findingTopic))}?`);
  }

  if (whatShows.claimType === "correlational") {
    derived.push(`Could the pattern around ${lowercaseFirst(stripTrailingPeriod(findingTopic))} reflect confounding or reverse causality rather than a direct effect?`);
  }

  if (whatShows.claimType === "causal") {
    derived.push(`Does this study show a meaningful real-world effect, or mainly a short-term change in the measured outcome?`);
  }

  if (/health|psychology|medical|clinical|biohack|nutrition/i.test(documentType)) {
    derived.push(`How should this be used without drifting into an overclaim about treatment or cure?`);
  }

  if (limitations.some((item) => /meta-analysis|mixed|self-report|small sample/i.test(item.limitation))) {
    derived.push(`Which limitation matters most here: the sample, the design, or the way the outcomes were measured?`);
  }

  if (/systematic review/i.test(studyType)) {
    derived.push("Did the paper separate randomized trials from conceptual or observational papers clearly enough?");
  }

  if (evidenceQuality.effectSizes !== MISSING && /mentioned/i.test(evidenceQuality.effectSizes.toLowerCase())) {
    derived.push("Are the reported effects large enough to matter in practice, or just statistically detectable?");
  }

  return dedupeStrings([...provided, ...derived]).slice(0, 4);
}

function deriveVisibilityQuestion(item: string): string {
  const normalized = item.toLowerCase();
  if (normalized.includes("funding/coi")) {
    return "Are funding or COI details visible in the full paper?";
  }
  if (normalized.includes("effect size")) {
    return "Are effect sizes reported anywhere in the full paper or supplement?";
  }
  return `Is there clearer information on ${normalized.replace(/\.$/, "")}?`;
}

function normalizeFurtherReading(
  input: LlmAnalysisDraft["furtherReading"],
  documentType: string,
): NormalizedAnalysis["furtherReading"] {
  const suggestions = input?.suggestions.filter(Boolean) ?? [];
  if (suggestions.length === 0) {
    suggestions.push(
      "Look for recent meta-analyses on the same question.",
      "Look for larger randomized trials or higher-quality replications.",
      "Look for null-result or opposing papers testing the same claim.",
    );
    if (/health|nutrition|supplement|medical|clinical|biohack/i.test(documentType)) {
      suggestions.push("Look for clinical guidelines or evidence summaries from reputable medical bodies.");
    }
  }

  return {
    note:
      fallbackText(
        input?.note,
        "Look for stronger related evidence rather than assuming this paper settles the question.",
      ) || MISSING,
    suggestions: dedupeStrings(suggestions).slice(0, 5),
  };
}

function normalizePrimarySummary(
  bottomLine: string,
  trustRating: NormalizedAnalysis["trustRating"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  keyFindings: NormalizedAnalysis["keyFindings"],
  realWorldMeaning: NormalizedAnalysis["realWorldMeaning"],
  takeaway: string,
  suggestedQuestions: string[],
  limitations: NormalizedAnalysis["limitationsAndGotchas"],
  documentType: string,
): NormalizedAnalysis["primarySummary"] {
  const label = deriveNuancedTrustLabel(trustRating, whatShows, limitations);
  const whyThisMatters = normalizeWhyThisMatters(realWorldMeaning, whatShows, documentType);
  const trustSummary = normalizeTrustSignalSummary(label, trustRating, whatShows, limitations);
  const mainTakeaways = dedupeStrings(
    [
      cleanText(keyFindings[0]?.plainEnglishMeaning),
      cleanText(keyFindings[1]?.plainEnglishMeaning),
      cleanText(takeaway),
    ].filter(Boolean),
  ).slice(0, 3);

  return {
    bottomLine,
    insightNarrative: normalizeInsightNarrative(
      bottomLine,
      whyThisMatters,
      trustSummary,
      takeaway,
    ),
    whyThisMatters,
    trustSignal: {
      label,
      summary: trustSummary,
      confidenceLevel: trustRating.confidenceLevel,
    },
    mainTakeaways,
    suggestedQuestions: suggestedQuestions.slice(0, 4),
  };
}

function normalizeMethodologySnapshot(
  input: LlmAnalysisDraft["methodologySnapshot"],
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  documentType: string,
): NormalizedAnalysis["methodologySnapshot"] {
  return {
    design: fallbackText(input?.design, evidenceQuality.studyType, documentType || MISSING),
    searchSource: MISSING,
    inclusionExclusionCriteria: MISSING,
    numberOfStudiesOrParticipants: fallbackText(input?.numberOfStudiesOrParticipants, evidenceQuality.sampleSize, MISSING),
    analysisMethod: fallbackText(input?.analysisMethod, MISSING),
    prismaMetaAnalysisStatistics: inferPrismaOrStats(evidenceQuality.studyType),
  };
}

function normalizeKeyTerms(input: LlmAnalysisDraft["keyTerms"]): NormalizedAnalysis["keyTerms"] {
  const cleaned = input
    .map((item) => ({
      term: cleanText(item.term),
      simpleEnglish: "",
    }))
    .filter((item) => item.term);

  return cleaned.slice(0, 8);
}

function normalizeMissingInfo(
  input: LlmAnalysisDraft["missingInfo"],
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  text: string,
): NormalizedAnalysis["missingInfo"] {
  const cleaned = input
    .map((item) => ({
      item: cleanText(item.item),
      whyItMatters: "",
    }))
    .filter((item) => item.item);

  const derived: Array<{ item: string; whyItMatters: string }> = [];
  if (evidenceQuality.fundingConflictVisibility === MISSING && hasExplicitMissingFundingInfo(text)) {
    derived.push({
      item: "Funding/COI details are not visible in the uploaded excerpt.",
      whyItMatters: "That limits transparency, but it does not automatically weaken the study's findings on its own.",
    });
  }

  return dedupeBy([...cleaned, ...derived], (item) => item.item.toLowerCase()).slice(0, 3);
}

function normalizeWhatTheyStudied(
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
): string {
  const studyType = whatShows.studyType || evidenceQuality.studyType || "study";
  const population = whatShows.population !== MISSING ? `It looked at ${whatShows.population.toLowerCase()}.` : "";
  const exposure = whatShows.interventionOrExposure !== MISSING
    ? `The main focus was ${lowercaseFirst(whatShows.interventionOrExposure)}.`
    : "";
  const outcomes = whatShows.outcomesMeasured !== MISSING
    ? `It measured ${lowercaseFirst(whatShows.outcomesMeasured)}.`
    : "";
  return [studyType.endsWith(".") ? studyType : `${studyType}.`, population, exposure, outcomes]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function normalizeTakeaway(
  draft: LlmAnalysisDraft,
  trustRating: NormalizedAnalysis["trustRating"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  realWorldMeaning: NormalizedAnalysis["realWorldMeaning"],
  practicalUse: NormalizedAnalysis["practicalUse"],
): string {
  const provided = cleanText(draft.realWorldMeaning?.sensibleInterpretation);
  if (provided) return provided;

  const claimFrame =
    whatShows.claimType === "causal"
      ? "A reasonable takeaway is that the intervention may have a real effect, but the size and robustness still matter."
      : whatShows.claimType === "correlational"
        ? "A reasonable takeaway is that the paper points to a meaningful pattern, but not a settled cause-and-effect answer."
        : "A reasonable takeaway is that the paper adds useful context, but it is better for framing the question than settling it.";

  return constrainBottomLine(
    `${claimFrame} ${realWorldMeaning.summary} Treat it as ${deriveCitationUse(trustRating.rating).toLowerCase()} ${practicalUse.recommendation === "Do not act on this alone" ? "It is not decision-grade on its own." : ""}`,
  );
}

function normalizePracticalRelevance(
  trustRating: NormalizedAnalysis["trustRating"],
  realWorldMeaning: NormalizedAnalysis["realWorldMeaning"],
  practicalUse: NormalizedAnalysis["practicalUse"],
  documentType: string,
): string {
  const healthSuffix = /health|medical|supplement|nutrition|biohack|clinical/i.test(documentType)
    ? "Do not change medication, treatment, or clinical decisions based on this paper alone."
    : "";

  return constrainBottomLine(
    `${realWorldMeaning.summary} In practical terms, this looks ${describeEvidenceStrength(trustRating.rating)}. ${practicalUse.reasoning} ${healthSuffix}`.trim(),
  );
}

function normalizeBottomLine(
  bottomLine: string,
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  trustRating: NormalizedAnalysis["trustRating"],
): string {
  const text = cleanText(bottomLine);
  if (text && !/^(some )?(critical|major|important)?\s*(methodology )?(details|information).*(missing|not visible|not clear)/i.test(text)) {
    return constrainBottomLine(text);
  }

  return constrainBottomLine(
    `${whatShows.observedResult} Overall, this looks like ${describeEvidenceStrength(trustRating.rating)} with ${trustRating.confidenceLevel} confidence.`,
  );
}

function normalizeWhyThisMatters(
  realWorldMeaning: NormalizedAnalysis["realWorldMeaning"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  documentType: string,
): string {
  const summary = cleanText(realWorldMeaning.summary);
  if (summary) {
    return constrainBottomLine(summary);
  }

  if (/psychology|placebo|mindset|stress|pain/i.test(documentType + " " + whatShows.observedResult)) {
    return "It helps explain how expectations, interpretation, and communication can shape symptoms, behavior, and treatment experience.";
  }

  return constrainBottomLine(
    `It matters because it helps a careful reader understand what this kind of evidence can and cannot support in practice.`,
  );
}

function normalizeInsightNarrative(
  bottomLine: string,
  whyThisMatters: string,
  trustSummary: string,
  takeaway: string,
): string {
  return constrainNarrative(
    [bottomLine, whyThisMatters, trustSummary, takeaway]
      .map(cleanText)
      .filter(Boolean)
      .join("\n\n"),
  );
}

function normalizeTrustSignalSummary(
  label: NormalizedAnalysis["primarySummary"]["trustSignal"]["label"],
  trustRating: NormalizedAnalysis["trustRating"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  limitations: NormalizedAnalysis["limitationsAndGotchas"],
): string {
  const studyType = whatShows.studyType || "This paper";
  const majorCaveats = limitations
    .filter((item) => item.severity !== "Minor / transparency note")
    .map((item) => stripTrailingPeriod(item.limitation))
    .slice(0, 2);

  const caveatText = majorCaveats.length > 0
    ? ` The main limits are ${joinNaturalLanguage(majorCaveats)}.`
    : "";

  return `${label}. ${studyType} with ${trustRating.confidenceLevel} confidence.${caveatText}`.trim();
}

function normalizeDisclaimer(disclaimer: string): string {
  return (
    cleanText(disclaimer) ||
    "This is a plain-English research explanation, not medical, legal, or professional advice. Do not change treatment, medication, or safety-critical decisions based on one paper alone."
  );
}

function deriveTrustRating(
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  limitations: LlmAnalysisDraft["limitationsAndGotchas"],
): NormalizedAnalysis["trustRating"]["rating"] {
  const studyType = evidenceQuality.studyType.toLowerCase();
  const limitationsText = limitations.map((item) => `${item.limitation} ${item.whyItMatters}`).join(" ").toLowerCase();
  const inferred = limitations.map((item) => inferLimitationSeverity(item.limitation, item.whyItMatters));
  const majorLimitations = inferred.filter((s) => s === "Major limitation").length;
  const importantLimitations = inferred.filter((s) => s === "Important limitation").length;

  if (/conceptual|opinion|essay|commentary|theoretical/.test(studyType)) {
    return "Weak evidence";
  }
  if (/misleading|overclaim/.test(limitationsText)) {
    return "Overclaimed / misleading";
  }
  if (/meta-analysis/.test(studyType) && majorLimitations === 0) {
    return "Strong";
  }
  if (/systematic review/.test(studyType) || /randomized|rct|trial/.test(studyType)) {
    if (majorLimitations > 1) return "Limited";
    if (importantLimitations > 2) return "Limited";
    return "Moderate";
  }
  if (/observational|cohort|case-control|cross-sectional|correlation/.test(studyType)) {
    return "Limited";
  }
  return majorLimitations > 0 ? "Weak evidence" : "Early / exploratory";
}

function buildTrustReason(
  rating: NormalizedAnalysis["trustRating"]["rating"],
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  limitations: LlmAnalysisDraft["limitationsAndGotchas"],
): string {
  const bits = [evidenceQuality.studyType];
  if (evidenceQuality.sampleSize !== MISSING) bits.push(`sample context: ${evidenceQuality.sampleSize}`);
  if (evidenceQuality.effectSizes !== MISSING) bits.push(`effect sizes: ${evidenceQuality.effectSizes}`);
  if (limitations.length > 0) bits.push(`main caveat: ${cleanText(limitations[0]?.limitation)}`);
  return `${describeEvidenceStrength(rating, true)}. ${bits.filter(Boolean).join("; ")}.`;
}

function describeEvidenceStrength(
  rating: NormalizedAnalysis["trustRating"]["rating"],
  sentenceCase = false,
): string {
  let phrase = rating.toLowerCase();
  if (rating === "Strong") phrase = "strong evidence";
  if (rating === "Moderate") phrase = "moderate evidence";
  if (rating === "Limited") phrase = "limited evidence";
  if (rating === "Early / exploratory") phrase = "early exploratory evidence";
  if (rating === "Weak evidence") phrase = "weak evidence";
  if (rating === "Overclaimed / misleading") phrase = "overclaimed or misleading evidence";
  if (!sentenceCase) return phrase;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function deriveNuancedTrustLabel(
  trustRating: NormalizedAnalysis["trustRating"],
  whatShows: NormalizedAnalysis["whatPaperActuallyShows"],
  limitations: NormalizedAnalysis["limitationsAndGotchas"],
): NormalizedAnalysis["primarySummary"]["trustSignal"]["label"] {
  const majorCount = limitations.filter((item) => item.severity === "Major limitation").length;
  const importantCount = limitations.filter((item) => item.severity === "Important limitation").length;
  const studyType = whatShows.studyType.toLowerCase();

  if (trustRating.rating === "Strong") return "Stronger evidence";
  if (trustRating.rating === "Moderate") {
    return (/(meta-analysis|rct|randomized controlled)/.test(studyType) && whatShows.claimType === "causal" && importantCount <= 1)
      ? "Moderate support"
      : "Directionally supportive";
  }
  if (trustRating.rating === "Limited") {
    return majorCount > 0 ? "Promising but limited" : "Directionally supportive";
  }
  if (trustRating.rating === "Early / exploratory") return "Early but interesting";
  if (trustRating.rating === "Overclaimed / misleading") return "Contested / uncertain";
  return "Promising but limited";
}

function deriveCitationUse(rating: NormalizedAnalysis["trustRating"]["rating"]): string {
  switch (rating) {
    case "Strong":
      return "Reasonable to cite as strong support for the claim it directly tests.";
    case "Moderate":
      return "Reasonable to cite as supporting evidence, with caveats.";
    case "Limited":
      return "Best cited as limited support rather than decisive evidence.";
    case "Early / exploratory":
      return "Best cited as exploratory or hypothesis-generating evidence.";
    case "Weak evidence":
      return "Use mainly as background context, not as core support.";
    case "Overclaimed / misleading":
      return "Not enough evidence for the strongest headline version of the claim.";
  }
}

function deriveActionability(
  rating: NormalizedAnalysis["trustRating"]["rating"],
  documentType: string,
): NormalizedAnalysis["practicalUse"]["recommendation"] {
  if (rating === "Strong") return "Act on it now";
  if (rating === "Moderate") return /health|medical|supplement|nutrition|biohack/i.test(documentType)
    ? "Maybe useful, low-risk"
    : "Act on it now";
  if (rating === "Limited" || rating === "Early / exploratory") return "Interesting but too early";
  return "Do not act on this alone";
}

function inferClaimType(studyType: string): NormalizedAnalysis["whatPaperActuallyShows"]["claimType"] {
  const normalized = studyType.toLowerCase();
  if (/randomized|rct|intervention|trial/.test(normalized)) return "causal";
  if (/observational|cohort|case-control|cross-sectional|correlation/.test(normalized)) return "correlational";
  if (/review|meta-analysis/.test(normalized)) return "theoretical";
  return "speculative";
}

function inferLimitationSeverity(limitation: string, why: string): NormalizedAnalysis["limitationsAndGotchas"][number]["severity"] {
  const text = `${limitation} ${why}`.toLowerCase();
  if (/no control|animal only|in vitro only|causal human claim from non-human data/.test(text)) {
    return "Major limitation";
  }
  if (/sample size|effect size|mixed study|self-report|short-term|generalis|no meta-analysis|not visible/.test(text)) {
    return "Important limitation";
  }
  if (/funding|coi|transparency/.test(text)) {
    return "Minor / transparency note";
  }
  return "Minor / transparency note";
}

function deriveConfidenceLevel(
  provided: LlmAnalysisDraft["trustRating"]["confidenceLevel"],
  evidenceQuality: NormalizedAnalysis["evidenceQuality"],
  limitations: LlmAnalysisDraft["limitationsAndGotchas"],
): NormalizedAnalysis["confidenceLevel"] {
  if (provided) return provided;
  let score = 0;
  if (evidenceQuality.sampleSize !== MISSING) score += 1;
  if (evidenceQuality.controlsOrComparisonGroups !== MISSING) score += 1;
  score -= limitations.filter((item) => inferLimitationSeverity(item.limitation, item.whyItMatters) === "Major limitation").length;
  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

function detectStudyType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("meta-analysis")) return "Meta-analysis";
  if (lower.includes("systematic review")) return "Systematic review";
  if (/\brandomized\b|\brandomised\b|\brct\b/.test(lower)) return "RCT";
  if (/\bobservational\b|\bcohort\b|\bcross-sectional\b|\bcase-control\b/.test(lower)) return "Observational study";
  if (/\bpilot study\b/.test(lower)) return "Pilot study";
  if (/\bqualitative\b/.test(lower)) return "Qualitative study";
  if (/\banimal\b|\bmice\b|\brat\b/.test(lower)) return "Animal study";
  if (/\bin vitro\b|\bcell line\b/.test(lower)) return "In vitro study";
  if (/\bessay\b|\bcommentary\b|\bconceptual\b/.test(lower)) return "Conceptual paper";
  return MISSING;
}

function detectSampleSize(text: string): string {
  const match = text.match(/\b(?:n\s?=\s?\d+|\d+\s+(?:participants|subjects|patients|adults|students))\b/i);
  return match ? match[0] : MISSING;
}

function detectControls(text: string): string {
  if (/\bcontrol group\b/i.test(text)) return "Control group mentioned.";
  if (/\bplacebo\b/i.test(text)) return "Placebo comparison mentioned.";
  if (/\brandomized controlled\b/i.test(text)) return "Randomized controlled comparison mentioned.";
  return MISSING;
}

function detectStatisticalDetail(text: string): string {
  if (/\bp\s*[<=>]\s*0\./i.test(text)) return "P-values are mentioned.";
  if (/\bconfidence interval/i.test(text)) return "Confidence intervals are mentioned.";
  if (/\bregression\b|\banova\b|\bstatistical significance\b/i.test(text)) return "Statistical testing is described.";
  return MISSING;
}

function detectEffectSizes(text: string): string {
  if (/\beffect size(?:s)?\b.{0,30}\b(?:not reported|not provided|not clear|missing|absent)\b/i.test(text)) {
    return MISSING;
  }
  if (/\beffect size\b|\bcohen'?s d\b|\bodds ratio\b|\brisk ratio\b|\bhazard ratio\b/i.test(text)) {
    return "Effect sizes are mentioned.";
  }
  return MISSING;
}

function hasExplicitMissingEffectSize(text: string, effectSizes: string): boolean {
  return effectSizes === MISSING && /\beffect size(?:s)?\b.{0,40}\b(?:not reported|not provided|not clear|missing|absent)\b/i.test(text);
}

function detectReplication(text: string): string {
  if (/\breplication\b|\breplicated\b|\bmultiple studies\b/i.test(text)) return "Some replication language is present.";
  return MISSING;
}

function inferPublicationBiasRisk(studyType: string): string {
  if (/systematic review|meta-analysis/i.test(studyType)) {
    return "Possible, especially if only published studies or limited search criteria were used.";
  }
  return "Not clear from uploaded text.";
}

function detectFundingVisibility(text: string): string {
  if (/\b(?:funding|conflict of interest|competing interest|disclosure)s?\b.{0,40}\b(?:not reported|not provided|not clear|missing|absent)\b/i.test(text)) {
    return MISSING;
  }
  if (/\bdoes not include\b.{0,60}\b(?:funding|conflict of interest|competing interest|disclosure)s?\b/i.test(text)) {
    return MISSING;
  }
  if (/\bfunding\b|\bconflict of interest\b|\bcompeting interest\b|\bdisclosure\b/i.test(text)) {
    return "Funding or conflict language is present.";
  }
  return MISSING;
}

function hasExplicitMissingFundingInfo(text: string): boolean {
  return /\b(?:funding|conflict of interest|competing interest|disclosure)s?\b.{0,60}\b(?:not reported|not provided|not clear|missing|absent|not visible)\b/i.test(text)
    || /\buploaded (?:text|excerpt)\b.{0,80}\b(?:does not include|doesn't include)\b.{0,50}\b(?:funding|conflict of interest|competing interest|disclosure)s?\b/i.test(text);
}

function inferGeneralisability(text: string): string {
  if (/\bhealthy adults\b/i.test(text)) return "Likely limited to healthy adults.";
  if (/\bcollege students\b/i.test(text)) return "Likely limited to college students or similar groups.";
  return MISSING;
}

function inferPrismaOrStats(studyType: string): string {
  if (/systematic review|meta-analysis/i.test(studyType)) {
    return "Look for PRISMA reporting, meta-analysis methods, and risk-of-bias assessment.";
  }
  return MISSING;
}

function trustRatingToSupport(
  rating: NormalizedAnalysis["trustRating"]["rating"],
): NormalizedAnalysis["keyFindings"][number]["strengthOfSupport"] {
  switch (rating) {
    case "Strong":
      return "Strong";
    case "Moderate":
      return "Moderate";
    case "Limited":
      return "Limited";
    case "Early / exploratory":
      return "Limited";
    case "Weak evidence":
      return "Limited";
    case "Overclaimed / misleading":
      return "Theoretical / speculative";
  }
}

function legacyConfidenceToSupport(value: unknown): NormalizedAnalysis["keyFindings"][number]["strengthOfSupport"] {
  if (value === "high") return "Strong";
  if (value === "medium") return "Moderate";
  if (value === "low") return "Limited";
  return "Limited";
}

function legacySeverityToLimitation(value: unknown): NormalizedAnalysis["limitationsAndGotchas"][number]["severity"] {
  if (value === "high") return "Major limitation";
  if (value === "medium") return "Important limitation";
  return "Minor / transparency note";
}

function normalizeConfidenceLevel(value: string): NormalizedAnalysis["confidenceLevel"] | undefined {
  if (value === "low" || value === "medium" || value === "high") return value;
  return undefined;
}

function constrainBottomLine(value: string): string {
  const sentences = value
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  return sentences.join(" ");
}

function constrainNarrative(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n\n");
}

function fallbackText(...values: Array<string | undefined>): string {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned;
}

function lowercaseFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function stripTrailingPeriod(value: string): string {
  return value.replace(/[.]+$/, "").trim();
}

function joinNaturalLanguage(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function asObject(value: unknown): Record<string, any> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, any>;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function dedupeStrings(items: string[]): string[] {
  return dedupeBy(items, (item) => item);
}

function canonicalizeLimitationKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\bn\s*=\s*\d+\b/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\bparticipants?\b/g, "sample")
    .replace(/\s+/g, " ")
    .trim();
}
