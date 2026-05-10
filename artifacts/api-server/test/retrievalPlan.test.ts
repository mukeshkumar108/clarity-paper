import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchPlan, RetrievedPaper } from "../src/lib/search/types";

const searchSemanticScholarMock = vi.fn();
const searchOpenAlexMock = vi.fn();
const searchEuropePMCMock = vi.fn();
const searchCoreMock = vi.fn();

vi.mock("../src/lib/search/semanticScholarClient", () => ({
  searchSemanticScholar: searchSemanticScholarMock,
}));

vi.mock("../src/lib/search/openAlexClient", () => ({
  searchOpenAlex: searchOpenAlexMock,
}));

vi.mock("../src/lib/search/europePMCClient", () => ({
  searchEuropePMC: searchEuropePMCMock,
}));

vi.mock("../src/lib/search/coreClient", () => ({
  searchCore: searchCoreMock,
}));

function makePlan(overrides: Partial<ResearchPlan> = {}): ResearchPlan {
  return {
    intentType: "topic_exploration",
    userQuestion: "does creatine help with alzheimers",
    detectedLanguage: "English",
    responseLanguage: "English",
    normalizedEnglishQuestion: "does creatine help with alzheimers",
    entities: ["creatine", "alzheimers"],
    hiddenGoals: ["cognitive decline", "neuroprotection"],
    directQueryVariants: [
      "creatine supplementation alzheimer's disease trial",
      "creatine alzheimer's systematic review",
    ],
    contextQueryVariants: ["creatine brain energy metabolism neuroprotection"],
    queryVariants: [
      "creatine supplementation alzheimer's disease trial",
      "creatine alzheimer's systematic review",
      "creatine brain energy metabolism neuroprotection",
    ],
    inclusionCriteria: [],
    exclusionCriteria: [],
    desiredEvidenceTypes: [],
    followUpQuestions: [],
    ...overrides,
  };
}

function makePaper(source: RetrievedPaper["source"], externalId: string, title: string): RetrievedPaper {
  return {
    doi: `10.1000/${externalId}`,
    externalId,
    title,
    abstract: `${title} abstract about creatine and cognition in Alzheimer's disease with enough detail to pass filters.`,
    authors: ["Author A"],
    year: 2024,
    studyType: "Trial",
    isRetracted: false,
    citationCount: 5,
    citationNormalizedPercentile: 0.4,
    openAccessPdfUrl: null,
    source,
    retrievedByQuery: ["test"],
    sources: [source],
  };
}

describe("retrievePlannedPapers", () => {
  beforeEach(() => {
    searchSemanticScholarMock.mockReset();
    searchOpenAlexMock.mockReset();
    searchEuropePMCMock.mockReset();
    searchCoreMock.mockReset();
  });

  it("skips broader context retrieval when the direct lane is already sufficient", async () => {
    const directResults = (source: RetrievedPaper["source"], query: string) => [
      makePaper(source, `${source}-${query}-1`, `Direct ${query} one ${source}`),
      makePaper(source, `${source}-${query}-2`, `Direct ${query} two ${source}`),
    ];
    searchSemanticScholarMock.mockImplementation(async (query: string) => directResults("semantic_scholar", query));
    searchOpenAlexMock.mockImplementation(async (query: string) => directResults("openalex", query));
    searchEuropePMCMock.mockImplementation(async (query: string) => directResults("europe_pmc", query));
    searchCoreMock.mockImplementation(async (query: string) => directResults("core", query));

    const { retrievePlannedPapers } = await import("../src/lib/search/retrieval");
    await retrievePlannedPapers(makePlan());

    const calledQueries = searchSemanticScholarMock.mock.calls.map((call) => call[0]);
    expect(calledQueries).toEqual([
      "creatine supplementation alzheimer's disease trial",
      "creatine alzheimer's systematic review",
    ]);
  });

  it("expands into context retrieval when the direct lane is sparse", async () => {
    searchSemanticScholarMock.mockImplementation(async (query: string) => {
      if (query.includes("brain energy metabolism")) {
        return [makePaper("semantic_scholar", "context-1", "Creatine brain energy metabolism mechanism")];
      }
      return [makePaper("semantic_scholar", `direct-${query}`, `Direct ${query}`)];
    });
    searchOpenAlexMock.mockImplementation(async () => []);
    searchEuropePMCMock.mockImplementation(async () => []);
    searchCoreMock.mockImplementation(async () => []);

    const { retrievePlannedPapers } = await import("../src/lib/search/retrieval");
    await retrievePlannedPapers(makePlan());

    const calledQueries = searchSemanticScholarMock.mock.calls.map((call) => call[0]);
    expect(calledQueries).toContain("creatine brain energy metabolism neuroprotection");
  });
});
