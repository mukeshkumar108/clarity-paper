import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RankedPaper, ResearchPlan } from "../src/lib/search/types";

const callLLMMock = vi.fn();

vi.mock("../src/lib/openRouterProvider", () => ({
  callLLM: callLLMMock,
}));

function makePlan(overrides: Partial<ResearchPlan> = {}): ResearchPlan {
  return {
    intentType: "topic_exploration",
    userQuestion: "does creatine help with alzheimers",
    entities: ["creatine", "alzheimers"],
    hiddenGoals: [],
    queryVariants: [],
    inclusionCriteria: [],
    exclusionCriteria: [],
    desiredEvidenceTypes: [],
    followUpQuestions: [],
    ...overrides,
  };
}

function makePaper(overrides: Partial<RankedPaper> = {}): RankedPaper {
  return {
    doi: "10.1000/test",
    externalId: "paper-1",
    title: "Creatine supplementation in Alzheimer's disease",
    abstract: "This pilot study examined creatine supplementation in patients with Alzheimer's disease.",
    authors: ["Author A"],
    year: 2024,
    studyType: "Pilot trial",
    isRetracted: false,
    citationCount: 10,
    citationNormalizedPercentile: 0.5,
    openAccessPdfUrl: null,
    source: "openalex",
    retrievedByQuery: ["creatine alzheimers"],
    sources: ["openalex"],
    studyDesign: "cohort",
    populationType: "human",
    evidenceScore: 0.6,
    evidenceBucket: "human_observational",
    plainSummary: "Pilot trial of creatine in Alzheimer's disease",
    relevanceScore: 0.6,
    ...overrides,
  };
}

describe("applyTopicalVeto", () => {
  beforeEach(() => {
    callLLMMock.mockReset();
    process.env.OPENROUTER_TOPIC_FILTER_MODEL = "topic-filter-model";
  });

  it("removes papers marked clearly irrelevant", async () => {
    callLLMMock.mockResolvedValueOnce(
      JSON.stringify({
        judgments: [
          { externalId: "paper-1", verdict: "keep", reason: "Directly studies creatine in Alzheimer's disease." },
          { externalId: "paper-2", verdict: "remove", reason: "About syringe bioequivalence, not creatine." },
          { externalId: "paper-3", verdict: "adjacent", reason: "Background brain-health paper, not direct AD evidence." },
          { externalId: "paper-4", verdict: "keep", reason: "Relevant older-adult cognition review mentioning creatine." },
          { externalId: "paper-5", verdict: "keep", reason: "Directly relevant protocol." },
          { externalId: "paper-6", verdict: "keep", reason: "Directly relevant mechanism paper." },
        ],
      }),
    );

    const { applyTopicalVeto } = await import("../src/lib/search/topicalVeto");
    const result = await applyTopicalVeto(makePlan(), [
      makePaper({ externalId: "paper-1" }),
      makePaper({ externalId: "paper-2", title: "Bioequivalence Between a Gantenerumab Disposable Syringe and an Autoinjector" }),
      makePaper({ externalId: "paper-3", title: "Creatine Supplementation and Brain Health" }),
      makePaper({ externalId: "paper-4", title: "Creatine and Cognition in Aging" }),
      makePaper({ externalId: "paper-5", title: "Protocol for a pilot trial of creatine in Alzheimer's disease" }),
      makePaper({ externalId: "paper-6", title: "Creatine and brain energy metabolism in dementia" }),
    ]);

    expect(result.map((paper) => paper.externalId)).not.toContain("paper-2");
    expect(result).toHaveLength(5);
    expect(callLLMMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the original list if removal would leave too few papers", async () => {
    callLLMMock.mockResolvedValueOnce(
      JSON.stringify({
        judgments: [
          { externalId: "paper-1", verdict: "keep", reason: "Relevant." },
          { externalId: "paper-2", verdict: "remove", reason: "Off-topic." },
          { externalId: "paper-3", verdict: "remove", reason: "Off-topic." },
          { externalId: "paper-4", verdict: "remove", reason: "Off-topic." },
          { externalId: "paper-5", verdict: "remove", reason: "Off-topic." },
          { externalId: "paper-6", verdict: "remove", reason: "Off-topic." },
        ],
      }),
    );

    const { applyTopicalVeto } = await import("../src/lib/search/topicalVeto");
    const papers = [
      makePaper({ externalId: "paper-1" }),
      makePaper({ externalId: "paper-2" }),
      makePaper({ externalId: "paper-3" }),
      makePaper({ externalId: "paper-4" }),
      makePaper({ externalId: "paper-5" }),
      makePaper({ externalId: "paper-6" }),
    ];
    const result = await applyTopicalVeto(makePlan(), papers);

    expect(result).toHaveLength(papers.length);
  });

  it("keeps the original list if the classifier fails", async () => {
    callLLMMock.mockRejectedValueOnce(new Error("timeout"));

    const { applyTopicalVeto } = await import("../src/lib/search/topicalVeto");
    const papers = [
      makePaper({ externalId: "paper-1" }),
      makePaper({ externalId: "paper-2" }),
      makePaper({ externalId: "paper-3" }),
      makePaper({ externalId: "paper-4" }),
      makePaper({ externalId: "paper-5" }),
      makePaper({ externalId: "paper-6" }),
    ];
    const result = await applyTopicalVeto(makePlan(), papers);

    expect(result).toEqual(papers);
  });

  it("removes obvious foreign-intervention mismatches even if the model is too permissive", async () => {
    callLLMMock.mockResolvedValueOnce(
      JSON.stringify({
        judgments: [
          { externalId: "paper-1", verdict: "keep", reason: "Relevant." },
          { externalId: "paper-2", verdict: "keep", reason: "Mentions cold context." },
          { externalId: "paper-3", verdict: "keep", reason: "Relevant." },
          { externalId: "paper-4", verdict: "keep", reason: "Relevant." },
          { externalId: "paper-5", verdict: "keep", reason: "Relevant." },
          { externalId: "paper-6", verdict: "keep", reason: "Relevant." },
        ],
      }),
    );

    const { applyTopicalVeto } = await import("../src/lib/search/topicalVeto");
    const result = await applyTopicalVeto(
      makePlan({
        userQuestion: "is cold exposure real or hype?",
        entities: ["cold exposure", "cold-water immersion", "cryotherapy"],
      }),
      [
        makePaper({ externalId: "paper-1", title: "Cold-water immersion and recovery in athletes" }),
        makePaper({
          externalId: "paper-2",
          title: "Effect of L-Citrulline Intake on Blood Pressure in Cold Environments",
        }),
        makePaper({ externalId: "paper-3", title: "Whole-body cryotherapy after strenuous exercise" }),
        makePaper({ externalId: "paper-4", title: "Cold stress impacts cognitive performance in healthy volunteers" }),
        makePaper({ externalId: "paper-5", title: "Cold exposure and thermogenesis" }),
        makePaper({ externalId: "paper-6", title: "Ice bath recovery after exercise" }),
      ],
    );

    expect(result.map((paper) => paper.externalId)).not.toContain("paper-2");
  });
});
