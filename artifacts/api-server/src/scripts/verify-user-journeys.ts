import { analyseDocument, answerDocumentQuestion } from "../lib/documentAnalysisService";
import { planResearch } from "../lib/search/researchPlanner";
import { retrievePlannedPapers } from "../lib/search/retrieval";
import { deduplicatePapers, filterGuidelineDocuments } from "../lib/search/dedupe";
import { rerankByRelevance } from "../lib/search/reranker";
import { rankPapers, buildEvidenceSnapshot } from "../lib/search/ranking";
import { judgeRetrievalQuality, filterTopicallyWeakPapers } from "../lib/search/retrievalJudge";
import { repairRetrieval } from "../lib/search/queryRepair";
import { synthesisePapers } from "../lib/search/synthesizer";
import { applyTopicalVeto } from "../lib/search/topicalVeto";
import { checkFriendlyQaAnswer, checkSearchRelevance, type SearchJourneyExpectation } from "../lib/verification/userJourneyChecks";
import { isDemoMode } from "../lib/openRouterProvider";
import type { RankedPaper } from "../lib/search/types";

type VerificationCase = {
  id: string;
  query: string;
  searchExpectation: SearchJourneyExpectation;
  qaQuestion: string;
};

const CASES: VerificationCase[] = [
  {
    id: "creatine-brain",
    query: "does creatine actually help with brain health and how?",
    searchExpectation: {
      requiredTerms: ["creatine"],
      forbiddenTerms: ["prostate cancer", "covid-19", "angelman syndrome"],
      minMatchingTopPapers: 4,
      topPaperWindow: 5,
    },
    qaQuestion: "If I am a healthy adult, does this sound like a broad brain-health effect or a narrower effect in specific situations?",
  },
  {
    id: "cold-exposure",
    query: "is cold exposure real or hype?",
    searchExpectation: {
      requiredTerms: ["cold", "cryotherapy", "immersion"],
      requiredTitleTerms: ["cold exposure", "cold-water", "immersion", "cryotherapy", "ice bath", "cold stress"],
      forbiddenTerms: ["covid-19", "road traffic noise", "prostate cancer", "l-citrulline", "hypoxia", "pneumatic compression"],
      minMatchingTopPapers: 2,
      topPaperWindow: 5,
    },
    qaQuestion: "Does this read more like a real effect with narrow use cases, or more like a broad wellness claim people are overextending?",
  },
];

function mapAnalysisToQaContext(analysis: Awaited<ReturnType<typeof analyseDocument>>) {
  return {
    documentType: "research_paper",
    briefSummary: analysis.bottomLine,
    plainEnglishSummary: analysis.realWorldMeaning?.summary,
    gotchas: analysis.commonMisreadings?.map((item) => ({
      title: item.misleadingClaim,
      explanation: item.whatThePaperSupports,
    })),
    missingInfo: analysis.missingInfo,
    questionsToAsk: analysis.questionsToAskBeforeTrustingIt?.map((item) => ({
      question: typeof item === "string" ? item : item.question,
    })),
  };
}

async function runSearchJourney(query: string) {
  const plan = await planResearch(query);
  const rawPapers = await retrievePlannedPapers(plan);
  const deduplicated = filterGuidelineDocuments(deduplicatePapers(rawPapers));
  const reranked = await rerankByRelevance(plan.normalizedEnglishQuestion, deduplicated);
  const vetoed = await applyTopicalVeto(plan, rankPapers(reranked, plan));
  let ranked = filterTopicallyWeakPapers(vetoed, plan);
  const judgment = judgeRetrievalQuality(ranked, plan);

  if (judgment.shouldTriggerRepair) {
    const repaired = await repairRetrieval(ranked, plan, judgment);
    ranked = repaired.papers;
  }

  const snapshot = buildEvidenceSnapshot(ranked);
  const synthesis = await synthesisePapers(plan, ranked, snapshot);

  return { plan, ranked, snapshot, synthesis };
}

async function runCase(testCase: VerificationCase): Promise<void> {
  process.stdout.write(`\n[verify] ${testCase.id}: ${testCase.query}\n`);
  const search = await runSearchJourney(testCase.query);

  if (search.ranked.length === 0) {
    throw new Error("Search returned no ranked papers.");
  }

  const relevanceCheck = checkSearchRelevance(search.ranked, testCase.searchExpectation);
  if (!relevanceCheck.ok) {
    throw new Error(`Search relevance failed: ${relevanceCheck.failures.join(" ")}`);
  }

  if (!search.synthesis.synthesisText.trim()) {
    throw new Error("Synthesis text was empty.");
  }

  const topPaper: RankedPaper = search.ranked[0]!;
  process.stdout.write(`  top paper: ${topPaper.title}\n`);
  const analysis = await analyseDocument(
    topPaper.abstract,
    "research_paper",
    "",
    `Verification run for query: ${testCase.query}`,
    "English",
    { fastMode: true },
  );

  if (!analysis.editorialView?.openingHook || !analysis.editorialView.orientation) {
    throw new Error("Document analysis did not produce editorial sections.");
  }

  const answer = await answerDocumentQuestion(
    topPaper.abstract,
    testCase.qaQuestion,
    mapAnalysisToQaContext(analysis),
    "English",
  );

  const qaCheck = checkFriendlyQaAnswer(answer);
  if (!qaCheck.ok) {
    throw new Error(`Q&A voice check failed: ${qaCheck.failures.join(" ")}`);
  }

  process.stdout.write(`  qa ok: ${answer.slice(0, 120).replace(/\s+/g, " ")}...\n`);
}

async function main() {
  if (isDemoMode) {
    throw new Error("OPENROUTER_API_KEY is required for live journey verification.");
  }

  for (const testCase of CASES) {
    await runCase(testCase);
  }

  process.stdout.write("\n[verify] all journey checks passed\n");
}

main().catch((err) => {
  process.stderr.write(`\n[verify] failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
