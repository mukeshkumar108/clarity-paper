import { describe, expect, it } from "vitest";
import { checkFriendlyQaAnswer, checkSearchRelevance } from "../src/lib/verification/userJourneyChecks";
import type { RankedPaper } from "../src/lib/search/types";

function makeRankedPaper(overrides: Partial<RankedPaper> = {}): RankedPaper {
  return {
    doi: "10.1000/test.1",
    externalId: "paper-1",
    title: "Creatine supplementation and cognitive performance in healthy adults",
    abstract:
      "This randomized trial tested creatine supplementation in healthy adults and found improved working memory under demanding conditions.",
    authors: ["Author A"],
    year: 2024,
    studyType: "Randomized Controlled Trial",
    isRetracted: false,
    citationCount: 10,
    citationNormalizedPercentile: 0.5,
    openAccessPdfUrl: null,
    source: "openalex",
    retrievedByQuery: ["creatine cognition"],
    sources: ["openalex"],
    studyDesign: "rct",
    populationType: "human",
    evidenceScore: 0.7,
    evidenceBucket: "strongest",
    plainSummary: "Randomized trial (2024): Creatine supplementation and cognitive performance in healthy adults",
    relevanceScore: 0.6,
    ...overrides,
  };
}

describe("checkSearchRelevance", () => {
  it("passes when most top papers match required terms", () => {
    const papers = [
      makeRankedPaper(),
      makeRankedPaper({ externalId: "paper-2", title: "Creatine and memory in adults" }),
      makeRankedPaper({ externalId: "paper-3", title: "Meta-analysis of creatine and cognition" }),
    ];

    const result = checkSearchRelevance(papers, {
      requiredTerms: ["creatine"],
      requiredTitleTerms: ["creatine"],
      forbiddenTerms: ["prostate", "covid"],
      minMatchingTopPapers: 3,
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when off-topic titles leak into top papers", () => {
    const papers = [
      makeRankedPaper(),
      makeRankedPaper({
        externalId: "paper-bad",
        title: "Diet, nutrition, and hormone therapy for prostate cancer",
        abstract: "This systematic review addresses prostate cancer treatment outcomes.",
      }),
      makeRankedPaper({ externalId: "paper-3", title: "Creatine and mental fatigue" }),
    ];

    const result = checkSearchRelevance(papers, {
      requiredTerms: ["creatine"],
      forbiddenTerms: ["prostate cancer"],
      minMatchingTopPapers: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatch(/off-topic title/i);
  });

  it("fails when titles miss the key concept even if body text overlaps loosely", () => {
    const papers = [
      makeRankedPaper({
        externalId: "paper-1",
        title: "Effect of L-Citrulline Intake on Blood Pressure in Cold Environments",
        abstract: "This review examined L-citrulline and blood pressure responses in cold environments.",
      }),
      makeRankedPaper({
        externalId: "paper-2",
        title: "Cold-water immersion and recovery in athletes",
        abstract: "Cold-water immersion may help recovery after exercise.",
      }),
      makeRankedPaper({
        externalId: "paper-3",
        title: "Whole-body cryotherapy after strenuous exercise",
        abstract: "Cryotherapy was evaluated for recovery and soreness.",
      }),
    ];

    const result = checkSearchRelevance(papers, {
      requiredTerms: ["cold", "immersion", "cryotherapy"],
      requiredTitleTerms: ["cold-water", "immersion", "cryotherapy", "ice bath", "cold exposure"],
      minMatchingTopPapers: 3,
      topPaperWindow: 3,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/required title terms/i);
  });
});

describe("checkFriendlyQaAnswer", () => {
  it("accepts a concise conversational answer", () => {
    const result = checkFriendlyQaAnswer(
      "The interesting part is that the paper does suggest a real effect, but only in a pretty narrow setting. It looked most convincing under cognitively demanding conditions rather than as a general brain booster. So this feels more like a targeted signal than a broad promise.",
    );

    expect(result.ok).toBe(true);
  });

  it("rejects academic or templated answers", () => {
    const result = checkFriendlyQaAnswer(
      "Great question. Importantly, the study demonstrated statistically significant effects. [doc] The intervention was notable for improving outcomes.",
    );

    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/great question|academic|provenance/i);
  });
});
