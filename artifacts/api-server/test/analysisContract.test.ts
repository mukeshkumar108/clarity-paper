import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAnalysisFromPasses,
  createLegacyNormalizedAnalysisForTest,
  editorialSummarySchema,
  llmAnalysisSchema,
  normalizeAnalysisDraft,
  structuredAnalysisSchema,
} from "../src/lib/analysisContract";

function loadFixture(name: string) {
  const filePath = path.resolve(import.meta.dirname, "fixtures", name);
  return JSON.parse(readFileSync(filePath, "utf8")) as {
    documentType: string;
    text: string;
    draft: unknown;
  };
}

function runFixture(name: string) {
  const fixture = loadFixture(name);
  const draft = llmAnalysisSchema.parse(fixture.draft);
  return normalizeAnalysisDraft(draft, {
    documentType: fixture.documentType,
    text: fixture.text,
  });
}

function countMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) ?? []).length;
}

describe("analysis normalization", () => {
  it("keeps a psychology/placebo explainer narrative-first and useful", () => {
    const result = runFixture("psychology-placebo.json");
    const firstScreen = [
      result.primarySummary.bottomLine,
      result.primarySummary.whyThisMatters,
      result.primarySummary.trustSignal.summary,
      ...result.primarySummary.suggestedQuestions,
    ].join(" ");

    expect(result.primarySummary.bottomLine).toBeTruthy();
    expect(result.primarySummary.insightNarrative).toBeTruthy();
    expect(result.primarySummary.whyThisMatters).toBeTruthy();
    expect(result.primarySummary.trustSignal.label).toBe("Directionally supportive");
    expect(result.primarySummary.suggestedQuestions.length).toBeGreaterThan(0);
    expect(result.bottomLine.toLowerCase()).not.toMatch(/^not visible|^not clearly extractable|critical methodology/);
    expect(result.whatTheyActuallyStudied).toBeTruthy();
    expect(result.takeaway).toBeTruthy();
    expect(result.practicalRelevance).toBeTruthy();
    expect(result.limitationsAndGotchas.length).toBeLessThanOrEqual(4);
    expect(countMatches(result.primarySummary.bottomLine.toLowerCase(), /not visible in the uploaded text/g)).toBe(0);
    expect(countMatches(result.primarySummary.whyThisMatters.toLowerCase(), /not visible in the uploaded text/g)).toBe(0);
    expect(countMatches(result.primarySummary.trustSignal.summary.toLowerCase(), /not visible in the uploaded text/g)).toBe(0);
    expect(firstScreen.toLowerCase()).not.toMatch(/study type|observed direction|effect direction|source in paper|analysis dashboard|literature review/);
    expect(result.primarySummary.bottomLine).toMatch(/sleep expectations/i);
    expect(result.primarySummary.insightNarrative).toContain("Beliefs and framing can shape reported experience");
    expect(result.primarySummary.mainTakeaways[0]).toMatch(/sleep/i);
    expect(result.primarySummary.suggestedQuestions[0]).toMatch(/meaningful real-world effect|short-term change/i);
    expect(result.primarySummary.trustSignal.summary).toMatch(/Directionally supportive/i);
    expect(result.primarySummary.whyThisMatters).toMatch(/alertness/i);
  });

  it("does not spam visibility fallbacks for a nutrition paper with clear extraction", () => {
    const result = runFixture("nutrition-paper.json");

    expect(result.missingInfo.length).toBe(0);
    expect(result.primarySummary.bottomLine.toLowerCase()).not.toContain("not visible");
    expect(result.primarySummary.whyThisMatters.toLowerCase()).not.toContain("not visible");
    expect(result.primarySummary.trustSignal.summary.toLowerCase()).not.toContain("not visible");
    expect(result.practicalUse.recommendation).toBeTruthy();
  });

  it("keeps observational epidemiology scientifically honest without repeating causation warnings", () => {
    const result = runFixture("observational-epidemiology.json");

    expect(result.whatPaperActuallyShows.claimType).toBe("correlational");
    expect(result.commonMisreadings.length).toBeGreaterThan(0);
    expect(result.whatItDoesNotShow.filter((item) => /causal/i.test(item)).length).toBe(1);
    expect(result.takeaway.toLowerCase()).not.toContain("prove");
    expect(result.primarySummary.trustSignal.label).not.toBe("Weak evidence");
  });

  it("gives a balanced interpretation for a randomized clinical trial", () => {
    const result = runFixture("randomized-clinical-trial.json");

    expect(result.trustRating.rating).not.toBe("");
    expect(result.bottomLine.split(/[.!?]/).filter(Boolean).length).toBeLessThanOrEqual(4);
    expect(result.takeaway).toBeTruthy();
    expect(result.practicalRelevance).toBeTruthy();
    expect(result.limitationsAndGotchas.some((item) => /small sample|effect size|self-report/i.test(item.limitation))).toBe(true);
    expect(result.primarySummary.trustSignal.label).toMatch(/Promising|Moderate|Directionally/);
  });

  it("keeps critique proportionate for a meta-analysis", () => {
    const result = runFixture("meta-analysis.json");

    expect(["Strong", "Moderate"]).toContain(result.trustRating.rating);
    expect(result.limitationsAndGotchas.length).toBeLessThanOrEqual(3);
    expect(result.bottomLine.toLowerCase()).not.toMatch(/critical|flagged|invalid/);
    expect(result.takeaway).toBeTruthy();
    expect(result.primarySummary.trustSignal.label).toBe("Stronger evidence");
  });

  it("generates suggested questions from paper-specific details rather than generic prompts", () => {
    const result = runFixture("psychology-placebo.json");
    const combined = result.suggestedQuestions.join(" ").toLowerCase();

    expect(result.suggestedQuestions.length).toBeGreaterThan(0);
    expect(combined).toMatch(/expectation|treatment|effect|study/);
    expect(combined).not.toMatch(/who funded this|is there a control group\?/);
  });

  it("builds first-screen prose from a separate editorial pass without schema leakage", () => {
    const structured = structuredAnalysisSchema.parse({
      study: {
        type: "Randomized study",
        population: "60 restrained eaters",
        interventionOrExposure: "health-focused versus taste-focused framing",
        outcomes: "attention to high-calorie food cues",
        mainResult: "Participants primed to focus on health paid less attention to high-calorie food cues.",
        claimType: "causal",
      },
      findings: [
        {
          finding: "Health framing reduced attention to high-calorie food cues.",
          sourceContext: "Randomized experiment",
          populationOrSample: "60 restrained eaters",
          effectDirection: "Lower attention bias",
          supportLevel: "Moderate",
          plainMeaning: "In one randomized study of 60 restrained eaters, focusing on health rather than taste reduced attention to high-calorie food cues.",
        },
      ],
      evidenceSignals: {
        studyType: "Randomized study",
        sampleSize: "n=60",
        controls: "Comparison framing condition",
        statisticalDetail: "Behavioral outcome comparison",
        effectSizes: "Not visible in the uploaded text.",
        replication: "Not visible in the uploaded text.",
        publicationBiasRisk: "Not clear from uploaded text.",
        fundingVisibility: "Not visible in the uploaded text.",
        generalisability: "Likely limited to restrained eaters in the study context.",
      },
      trust: {
        rating: "Limited",
        confidenceLevel: "medium",
        citationUse: "Best cited as a promising but limited signal.",
        reason: "Interesting randomized evidence, but from a small, narrow study rather than a large body of replicated work.",
        supportingSignals: ["Randomized design", "Behavioral outcome"],
      },
      limitations: [
        {
          severity: "Important limitation",
          limitation: "Small sample size.",
          whyItMatters: "A small study can make effects look cleaner or larger than they turn out to be.",
          practicalConsequence: "Treat it as a promising signal rather than a settled result.",
          whatWouldStrengthenIt: "Larger replications in broader populations.",
        },
      ],
      methodologicalConcerns: [],
      nonClaims: ["This does not show that the effect is large or durable in everyday life."],
      misreadings: [
        {
          misleadingClaim: "Thinking about health automatically fixes overeating.",
          whatThePaperSupports: "The study supports a shift in attention under one experimental framing task.",
          whyTheDistinctionMatters: "An attention effect is not the same as a broad, lasting behavior change.",
        },
      ],
      suggestedQuestions: [
        "Would the effect still hold outside the lab and over longer periods?",
        "Does reduced attention to food cues actually change eating behavior?",
      ],
      relevance: {
        whyItMatters: "It helps explain how framing and attention can shape food-related behavior before someone even makes a choice.",
        practicalMeaning: "Useful as a clue about how mindset and attention interact, but not enough to treat as a complete behavior-change strategy.",
        actionability: "Interesting but too early",
        actionabilityReasoning: "Worth seeing as an early behavioral signal, not a decision-grade intervention.",
        caution: "Do not treat this study alone as proof of a durable eating intervention.",
      },
      methodologySnapshot: {},
      keyTerms: [],
      missingInfo: [],
      disclaimer: "",
    });

    const editorial = editorialSummarySchema.parse({
      openingHook:
        "Ever notice how the frame in your head can change what grabs your attention before you even make a choice?",
      orientation:
        "In one small randomized experiment, people focused on health rather than taste paid less attention to high-calorie food cues.",
      findings: [
        {
          heading: "Attention shifted before behavior did",
          body: "That is interesting because it suggests mindset may influence eating-related behavior at a very early stage, before someone even reaches for the food.",
        },
      ],
      trustNarrative:
        "The evidence is promising but still limited. This comes from a small randomized study, so it is useful as an early signal rather than a settled conclusion.",
      questionsWorthAsking: [
        "Would this still matter outside the lab and over longer periods?",
        "Does the attention effect translate into meaningful eating changes?",
      ],
      deeperDive: {
        howDesignedTitle: "How the study was designed",
        howDesignedBody: "Participants were randomly assigned to health-focused versus taste-focused framing and then tested on attention to high-calorie food cues.",
        cantTellUsTitle: "What this study can't tell us",
        cantTellUsBody: "It does not show whether the attention shift turns into a lasting real-world eating change.",
        biggerPictureTitle: "Where this fits in the bigger picture",
        biggerPictureBody: "It is best treated as an early clue about how framing and attention may interact, not a complete behavior-change strategy.",
      },
    });

    const result = buildAnalysisFromPasses(structured, editorial, {
      documentType: "nutrition paper",
      text: "Randomized study text",
    });

    const firstScreen = [
      result.primarySummary.bottomLine,
      result.primarySummary.whyThisMatters,
      result.primarySummary.trustSignal.summary,
      ...result.primarySummary.mainTakeaways,
    ].join(" ");

    expect(firstScreen.toLowerCase()).not.toMatch(/observed direction|effect direction|study type|source in paper|n=60 rct/);
    expect(result.editorialView.openingHook).toMatch(/frame in your head|notice/i);
    expect(result.editorialView.orientation).toMatch(/high-calorie food cues/i);
    expect(result.editorialView.findings[0].heading).toMatch(/attention shifted/i);
    expect(result.primarySummary.suggestedQuestions[0]).toMatch(/outside the lab|longer periods/i);
    expect(result.primarySummary.trustSignal.summary).toMatch(/small randomized study/i);
    expect(result.editorialView.findings[0].body).toMatch(/behavior/i);
    expect(result.editorialView.deeperDive.technicallyCuriousTitle).toMatch(/technically curious/i);
  });

  it("preserves direct editorial output instead of overwriting it with backend fallback prose", () => {
    const structured = structuredAnalysisSchema.parse({
      study: {
        type: "Double-blind RCT",
        population: "19 healthy adults",
        interventionOrExposure: "20g/day creatine for 7 days before 24 hours without sleep",
        outcomes: "reaction time, balance, mood, and demanding cognitive tasks",
        mainResult: "Creatine users appeared to hold up better than the placebo group on some mental and mood measures after 24 hours without sleep",
        claimType: "causal",
      },
      findings: [
        {
          finding: "Less decline in demanding mental tasks and mood after sleep deprivation.",
          sourceContext: "Results",
          populationOrSample: "10 creatine vs 9 placebo",
          effectDirection: "positive",
          supportLevel: "Moderate",
          plainMeaning: "People taking creatine seemed to hold up better on some mentally demanding tasks and mood measures after a sleepless night.",
        },
      ],
      evidenceSignals: {
        studyType: "Double-blind RCT",
        sampleSize: "n=19",
        controls: "Placebo group",
        statisticalDetail: "Significance reported in the abstract",
        effectSizes: "Not visible in the uploaded text.",
        replication: "No replication mentioned",
        publicationBiasRisk: "Not clear from uploaded text.",
        fundingVisibility: "Not visible in the uploaded text.",
        generalisability: "Only one small acute sleep-deprivation setup",
      },
      trust: {
        rating: "Limited",
        confidenceLevel: "medium",
        citationUse: "Best cited as an interesting early signal.",
        reason: "The design is stronger than an observational study, but the sample is tiny and the setup is narrow.",
        supportingSignals: ["Randomized design", "Placebo control"],
      },
      limitations: [
        {
          severity: "Major limitation",
          limitation: "The study was very small.",
          whyItMatters: "Tiny studies can make effects look cleaner or larger than they really are.",
          practicalConsequence: "Treat it as suggestive rather than something to act on confidently.",
          whatWouldStrengthenIt: "Larger replications in more realistic sleep-loss settings.",
        },
      ],
      methodologicalConcerns: [],
      nonClaims: ["This does not show that creatine cancels out the real costs of sleep deprivation."],
      misreadings: [],
      suggestedQuestions: [
        "Would this still help with ordinary partial sleep loss rather than a full night awake?",
      ],
      relevance: {
        whyItMatters: "It hints that creatine may support brain energy metabolism under stress, not just muscle performance.",
        practicalMeaning: "Interesting as an early clue about the brain under stress, but not enough to treat as a reliable all-nighter strategy.",
        actionability: "Interesting but too early",
        actionabilityReasoning: "There is a plausible idea here, but the study is too small and specific to treat as decision-grade.",
        caution: "Do not treat this as a reason to ignore sleep.",
      },
      methodologySnapshot: {},
      keyTerms: [],
      missingInfo: [],
      disclaimer: "",
    });

    const editorial = editorialSummarySchema.parse({
      openingHook: "What if a gym supplement could buy your brain a few extra hours?",
      orientation: "This small study suggests creatine may help some people stay sharper during a sleepless night.",
      findings: [
        {
          heading: "The mental drop-off looked less severe",
          body: "People taking creatine seemed to hold up better on some demanding tasks and mood measures after 24 hours without sleep.",
        },
      ],
      trustNarrative: "This was a carefully controlled trial, but only 19 people were studied, so it is better treated as an early signal than a settled answer.",
      questionsWorthAsking: ["Would this still help with ordinary partial sleep loss rather than a full night awake?"],
      deeperDive: {
        howDesignedTitle: "How the study was designed",
        howDesignedBody: "Participants took creatine or placebo for a week, then stayed awake for 24 hours while doing repeated cognitive and mood tests.",
        cantTellUsTitle: "What this study can't tell us",
        cantTellUsBody: "It does not show whether the effect holds up in larger or more diverse groups.",
        biggerPictureTitle: "Where this fits in the bigger picture",
        biggerPictureBody: "It is a plausible early signal, not enough on its own to change behavior confidently.",
      },
    });

    const result = buildAnalysisFromPasses(structured, editorial, {
      documentType: "clinical trial",
      text: "Creatine abstract text",
    });

    expect(result.editorialView.openingHook).toMatch(/gym supplement/i);
    expect(result.editorialView.orientation).toMatch(/stay sharper/i);
    expect(result.primarySummary.suggestedQuestions.join(" ")).toMatch(/ordinary partial sleep loss/i);
    expect(result.editorialView.deeperDive.technicallyCuriousBody).toBeTruthy();
  });

  it("rephrases legacy stored analysis into the calmer research-explainer structure", () => {
    const result = createLegacyNormalizedAnalysisForTest(
      {
        briefSummary: "",
        plainEnglishSummary: "",
        documentType: "systematic review",
        keyFindings: [
          {
            finding: "Growth mindset lowers post-op pain.",
            explanation: "Some patients reported less pain after mindset-related framing.",
            significance: "Limited evidence",
            confidence: "medium",
          },
        ],
        missingInfo: [
          { item: "Hides selection process.", whyItMatters: "" },
          { item: "Bias risk from sponsors.", whyItMatters: "" },
          { item: "Funding / Conflict of Interest", whyItMatters: "Knowing who funded the study helps identify potential bias or vested interests in the outcome." },
        ],
        limitations: [],
        gotchas: [],
        unusualTerms: [],
        questionsToAsk: [],
        confidenceLevel: "medium",
        confidenceNotes: "",
      },
      "systematic review",
    );

    expect(result.bottomLine).toMatch(/growth mindset lowers post-op pain/i);
    expect(result.bottomLine.toLowerCase()).not.toMatch(/critical|missing/);
    expect(result.missingInfo.some((item) => /not visible in the uploaded text/i.test(item.item))).toBe(true);
    expect(result.missingInfo.some((item) => /automatically imply bias|automatically invalidate/i.test(item.whyItMatters))).toBe(true);
    expect(result.missingInfo.some((item) => /hides selection process/i.test(item.item))).toBe(false);
    expect(result.missingInfo.some((item) => /bias risk from sponsors/i.test(item.item))).toBe(false);
  });
});
