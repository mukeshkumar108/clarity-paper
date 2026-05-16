import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = {
  searchSessionInserts: [] as any[],
  searchSessionMessageInserts: [] as any[],
};

const searchSessionsTable = {
  id: "search_sessions.id",
  userId: "search_sessions.user_id",
  query: "search_sessions.query",
  plannerOutput: "search_sessions.planner_output",
  papers: "search_sessions.papers",
  synthesisText: "search_sessions.synthesis_text",
  confidence: "search_sessions.confidence",
  evidenceSnapshot: "search_sessions.evidence_snapshot",
  followUpOptions: "search_sessions.follow_up_options",
  pathways: "search_sessions.pathways",
  createdAt: "search_sessions.created_at",
};

const searchSessionMessagesTable = {
  sessionId: "search_session_messages.session_id",
  createdAt: "search_session_messages.created_at",
};

const paperCacheTable = {
  cacheKey: "paper_cache.cache_key",
  cachedAt: "paper_cache.cached_at",
};

function makeDbMock() {
  return {
    execute: vi.fn(async () => ({ rows: [{ present: false }] })),
    insert: vi.fn((table: unknown) => ({
      values: (values: any) => {
        if (table === searchSessionsTable) {
          dbState.searchSessionInserts.push(values);
          return {
            returning: async () => [{ id: 321 }],
          };
        }

        if (table === searchSessionMessagesTable) {
          dbState.searchSessionMessageInserts.push(values);
          return Promise.resolve();
        }

        return {
          onConflictDoUpdate: () => Promise.resolve(),
        };
      },
    })),
    select: vi.fn((fields?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === paperCacheTable) {
          return {
            where: async () => [],
          };
        }

        if (table === searchSessionsTable) {
          if (fields && "id" in fields && Object.keys(fields).length === 1) {
            return {
              where: () => ({
                orderBy: async () => [],
              }),
            };
          }

          return {
            where: async () => [],
          };
        }

        if (table === searchSessionMessagesTable) {
          return {
            where: () => ({
              orderBy: async () => [],
            }),
          };
        }

        return {
          where: async () => [],
        };
      },
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: async () => undefined,
      }),
    })),
    delete: vi.fn(() => ({
      where: async () => undefined,
    })),
  };
}

const dbMock = makeDbMock();

vi.mock("@workspace/db", () => ({
  db: dbMock,
  searchSessionsTable,
  searchSessionMessagesTable,
  paperCacheTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  and: vi.fn((...parts: unknown[]) => parts),
  asc: vi.fn((value: unknown) => value),
  inArray: vi.fn(() => "inArray"),
  sql: Object.assign(
    (strings: TemplateStringsArray) => ({
      text: strings.join(""),
      as: (_alias: string) => ({ text: strings.join("") }),
    }),
    { raw: vi.fn() },
  ),
}));

vi.mock("../src/lib/search/researchPlanner", () => ({
  planResearch: vi.fn(async (query: string) => ({
    intentType: "claim_check",
    userQuestion: query,
    detectedLanguage: "en",
    responseLanguage: "en",
    normalizedEnglishQuestion: query,
    entities: ["ivermectin", "covid"],
    hiddenGoals: [],
    queryVariants: [query],
    directQueryVariants: [query],
    contextQueryVariants: [],
    inclusionCriteria: [],
    exclusionCriteria: [],
    desiredEvidenceTypes: [],
    followUpQuestions: ["Does the evidence differ by disease stage?"],
    isComparison: false,
    comparisonTarget: null,
  })),
}));

vi.mock("../src/lib/search/retrieval", () => ({
  retrievePlannedPapers: vi.fn(async () => [
    {
      doi: "10.1000/ivermectin.1",
      externalId: "paper-1",
      title: "Ivermectin and COVID-19",
      abstract: "A randomized trial about ivermectin and COVID-19 outcomes.",
      authors: ["A. Author"],
      year: 2023,
      studyType: "Journal Article",
      isRetracted: false,
      citationCount: 12,
      citationNormalizedPercentile: 0.4,
      openAccessPdfUrl: null,
      source: "openalex",
      retrievedByQuery: ["ivermectin covid"],
      sources: ["openalex"],
    },
  ]),
}));

vi.mock("../src/lib/search/dedupe", () => ({
  deduplicatePapers: vi.fn((papers: any[]) => papers),
  filterGuidelineDocuments: vi.fn((papers: any[]) => papers),
}));

vi.mock("../src/lib/search/reranker", () => ({
  rerankByRelevance: vi.fn(async (_query: string, papers: any[]) => papers),
}));

vi.mock("../src/lib/search/topicalVeto", () => ({
  applyTopicalVeto: vi.fn(async (_plan: unknown, papers: any[]) => papers),
}));

vi.mock("../src/lib/search/ranking", () => ({
  rankPapers: vi.fn((papers: any[]) =>
    papers.map((paper) => ({
      ...paper,
      studyDesign: "rct",
      populationType: "human",
      evidenceScore: 0.62,
      evidenceBucket: "human_observational",
      relevanceScore: 0.6,
      plainSummary: "Trial with mixed findings.",
    })),
  ),
  buildEvidenceSnapshot: vi.fn(() => ({
    metaAnalyses: 0,
    rcts: 1,
    humanObservational: 0,
    mechanistic: 0,
    conflicting: 0,
    totalPapers: 1,
    overallConfidence: "moderate",
  })),
}));

vi.mock("../src/lib/search/synthesizer", () => ({
  synthesisePapers: vi.fn(async () => ({
    synthesisText:
      "The honest answer is that ivermectin never turned into a credible cure story here, even though the hype got far ahead of the better trials.",
    confidence: "moderate",
    noEvidence: false,
    paperSummaries: [{ externalId: "paper-1", summary: "Later trials did not support a clear benefit." }],
    followUpOptions: ["What happened in the better randomized trials?"],
    pathways: [
      {
        label: "What the better trials found",
        preview: "The bigger randomized studies cooled down the early excitement fast.",
        question: "What did the better randomized trials actually find?",
        evidenceFit: "direct",
        relevantPaperCount: 1,
        icon: "strong",
      },
    ],
  })),
}));

vi.mock("../src/lib/search/openAlexClient", () => ({
  checkRetractionStatus: vi.fn(async () => null),
}));

vi.mock("../src/lib/search/retrievalJudge", () => ({
  judgeRetrievalQuality: vi.fn(() => ({
    quality: "good",
    qualityScore: { total: 0.9 },
    issues: [],
    shouldTriggerRepair: false,
    triggerReason: null,
  })),
  filterTopicallyWeakPapers: vi.fn((papers: any[]) => papers),
}));

vi.mock("../src/lib/search/queryRepair", () => ({
  repairRetrieval: vi.fn(),
}));

vi.mock("../src/lib/search/groundingValidator", () => ({
  validateGrounding: vi.fn(() => ({
    unsupportedNumericClaims: 0,
    causalOverreach: false,
    studiesShowViolations: 0,
    modelPriorLeakage: 0,
  })),
}));

vi.mock("../src/lib/search/evidenceSpans", () => ({
  buildEvidenceSpans: vi.fn(() => [
    {
      claim: "Later trials did not support a clear benefit.",
      supportType: "strongly_supported",
      snippets: [],
    },
  ]),
  computeSpanDiagnostics: vi.fn(() => ({
    totalClaims: 1,
    claimsWithDirectSupport: 1,
    claimsWithAnySupport: 1,
    avgSnippetConfidence: 0.9,
  })),
}));

vi.mock("../src/lib/search/contradictionDetector", () => ({
  detectContradictions: vi.fn(() => []),
}));

vi.mock("../src/lib/search/unpaywallClient", () => ({
  enrichWithUnpaywall: vi.fn(async (papers: any[]) => papers),
}));

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("search session persistence", () => {
  beforeEach(() => {
    dbState.searchSessionInserts = [];
    dbState.searchSessionMessageInserts = [];
    vi.resetModules();
    dbMock.execute.mockClear();
    dbMock.insert.mockClear();
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    dbMock.delete.mockClear();
  });

  it("persists synthesis with pathways cleanly when the pathways column is not present yet", async () => {
    const { runSearch } = await import("../src/lib/search/index");
    const progressEvents: any[] = [];

    const result = await runSearch(7, "what is the truth about ivermectin", (event) => {
      progressEvents.push(event);
    });

    expect(result.sessionId).toBe(321);
    expect(progressEvents.some((event) => event.type === "synthesis" && event.pathways.length === 1)).toBe(true);

    expect(dbState.searchSessionInserts).toHaveLength(1);
    expect(dbState.searchSessionInserts[0]).not.toHaveProperty("pathways");

    expect(dbState.searchSessionMessageInserts).toHaveLength(1);
    expect(dbState.searchSessionMessageInserts[0].metadata.pathways).toEqual(result.pathways);
    expect(dbState.searchSessionMessageInserts[0].metadata.followUpOptions).toEqual(result.followUpOptions);
  });
});
