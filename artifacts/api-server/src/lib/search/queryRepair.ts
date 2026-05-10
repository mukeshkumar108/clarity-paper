import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import { retrievePapers } from "./retrieval";
import { deduplicatePapers, filterGuidelineDocuments } from "./dedupe";
import { rankPapers } from "./ranking";
import { computeRetrievalQualityScore } from "./retrievalJudge";
import { logger } from "../logger";
import type {
  RankedPaper,
  ResearchPlan,
  RetrievalJudgment,
  RepairRecommendation,
  RepairStrategy,
} from "./types";

const STRUCTURED_MODEL =
  process.env.OPENROUTER_STRUCTURED_MODEL ?? "google/gemini-2.5-flash";

// Dynamic threshold: near-zero baselines need only a small absolute gain to justify keeping the repair.
// For scores >= 0.10, require a meaningful +0.05 improvement.
function improvementThreshold(originalScore: number): number {
  if (originalScore < 0.05) return 0.02;  // essentially empty — any gain counts
  if (originalScore < 0.10) return 0.03;  // very weak — low bar
  return 0.05;                            // standard threshold
}

const repairQueriesSchema = z.object({
  repairQueries: z.array(z.string()).min(2).max(4),
  reasoning: z.string(),
});

// ─── Strategy-specific system prompts ────────────────────────────────────────

const STRATEGY_PROMPTS: Record<RepairStrategy, string> = {
  tighten_around_intervention: `You are a scientific literature search specialist. Retrieval returned off-topic papers (e.g. clinical guidelines, unrelated disease papers). Generate 2-4 search queries that are tightly focused on the SPECIFIC intervention and outcome in the user's question. Do NOT use broad generic terms. Avoid guideline documents. Return strict JSON only.`,

  add_population_context: `You are a scientific literature search specialist. Retrieval returned disease-specific or wrong-population papers. Generate 2-4 queries that add explicit population context ("healthy adults", "general population", "non-clinical") to exclude disease-specific results. Return strict JSON only.`,

  enforce_entity_precision: `You are a scientific literature search specialist. Retrieval returned papers about a DIFFERENT but related entity than the one the user asked about (e.g. omega-3 instead of omega-6, NR instead of NMN). Generate 2-4 queries that use EXACT entity names from the provided list and exclude the confounding entities explicitly. Return strict JSON only.`,

  target_canonical_evidence: `You are a scientific literature search specialist. Top results were tangential — canonical evidence papers were missed. Generate 2-4 queries using standard evidence search patterns: "[entity] systematic review meta-analysis", "[entity] randomized controlled trial", "[entity] dose response human". Return strict JSON only.`,

  bias_to_evidence_type: `You are a scientific literature search specialist. Retrieval returned mechanistic/animal papers but the query needs human clinical evidence. Generate 2-4 queries that explicitly target clinical evidence: add "randomized controlled trial", "clinical trial", "systematic review", "human study" to queries. Return strict JSON only.`,
};

// ─── Message builder ──────────────────────────────────────────────────────────

function buildRepairMessage(
  plan: ResearchPlan,
  recommendation: RepairRecommendation,
  allIssues: RetrievalJudgment["issues"],
): string {
  const issueDescriptions = allIssues.map((i) => `- [${i.severity}] ${i.kind}: ${i.description}`).join("\n");
  const parts = [
    `USER QUESTION: ${plan.userQuestion}`,
    `KEY ENTITIES: ${plan.entities.join(", ")}`,
    `ORIGINAL QUERIES: ${plan.queryVariants.join("; ")}`,
    "",
    `REPAIR STRATEGY: ${recommendation.strategy}`,
    `STRATEGY REASON: ${recommendation.reason}`,
  ];

  if (recommendation.suggestedTerms?.length) {
    parts.push(`SUGGESTED TERMS TO INCLUDE: ${recommendation.suggestedTerms.join(", ")}`);
  }
  if (recommendation.exclusionTerms?.length) {
    parts.push(`TERMS TO AVOID: ${recommendation.exclusionTerms.slice(0, 8).join(", ")}`);
  }

  parts.push("", "ALL DETECTED ISSUES:", issueDescriptions || "- Low topical relevance");
  parts.push("", "Generate 2-4 repair queries. Be precise and targeted.");
  return parts.join("\n");
}

// ─── Fallback query builders per strategy ────────────────────────────────────

function fallbackQueries(plan: ResearchPlan, strategy: RepairStrategy): string[] {
  const primary = plan.entities[0] ?? plan.userQuestion.slice(0, 40);
  const secondary = plan.entities[1] ?? "";

  switch (strategy) {
    case "tighten_around_intervention":
      return [
        `${primary} ${secondary} randomized trial`.trim(),
        `${primary} ${secondary} systematic review`.trim(),
        `${primary} effects human clinical study`.trim(),
      ];
    case "add_population_context":
      return [
        `${primary} healthy adults randomized controlled trial`,
        `${primary} general population clinical study`,
        `${primary} non-clinical population systematic review`,
      ];
    case "enforce_entity_precision":
      return [
        `"${primary}" clinical effects human`,
        `${primary} supplementation randomized trial`,
        `${primary} bioavailability human study`,
      ];
    case "target_canonical_evidence":
      return [
        `${primary} systematic review meta-analysis`,
        `${primary} randomized controlled trial`,
        `${primary} dose response human`,
      ];
    case "bias_to_evidence_type":
      return [
        `${primary} randomized controlled trial`,
        `${primary} clinical trial human`,
        `${primary} systematic review clinical evidence`,
      ];
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function repairRetrieval(
  originalPapers: RankedPaper[],
  plan: ResearchPlan,
  judgment: RetrievalJudgment,
): Promise<{
  papers: RankedPaper[];
  queriesUsed: string[];
  strategy: string;
  originalScore: number;
  repairedScore: number;
  keepRepairedReason: string;
}> {
  // Pick the highest-severity recommendation, falling back to first available
  const recommendation: RepairRecommendation = judgment.repairRecommendations[0] ?? {
    strategy: "target_canonical_evidence" as RepairStrategy,
    reason: "no specific recommendation — defaulting to canonical evidence search",
  };

  let repairQueries: string[];

  try {
    const systemPrompt = STRATEGY_PROMPTS[recommendation.strategy];
    const raw = await callLLM(
      systemPrompt,
      buildRepairMessage(plan, recommendation, judgment.issues),
      repairQueriesSchema,
      { model: STRUCTURED_MODEL, temperature: 0.1 },
    );
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = repairQueriesSchema.parse(data);
    repairQueries = parsed.repairQueries;
    logger.info(
      { strategy: recommendation.strategy, repairQueries, reasoning: parsed.reasoning },
      "Repair queries generated",
    );
  } catch (err) {
    logger.warn(
      { err, strategy: recommendation.strategy },
      "LLM repair query generation failed — using strategy fallback",
    );
    repairQueries = fallbackQueries(plan, recommendation.strategy);
  }

  const rawRepaired = await retrievePapers(repairQueries);
  const dedupedRepaired = filterGuidelineDocuments(deduplicatePapers(rawRepaired));
  const repaired = rankPapers(dedupedRepaired, plan.entities);

  // Compare using the new discriminative quality score
  const originalScore = computeRetrievalQualityScore(originalPapers, plan).total;
  const repairedScore = computeRetrievalQualityScore(repaired, plan).total;

  const threshold = improvementThreshold(originalScore);
  const repairedIsBetter = repairedScore > originalScore + threshold;
  const keepRepaired = repairedIsBetter || originalPapers.length === 0;

  const keepRepairedReason = keepRepaired
    ? originalPapers.length === 0
      ? "original was empty"
      : `repaired score ${repairedScore.toFixed(3)} > original ${originalScore.toFixed(3)} + threshold ${threshold}`
    : `repaired score ${repairedScore.toFixed(3)} did not improve over original ${originalScore.toFixed(3)} (threshold: ${threshold})`;

  logger.info(
    {
      strategy: recommendation.strategy,
      originalScore,
      repairedScore,
      keepRepaired,
      keepRepairedReason,
    },
    "Repair comparison complete",
  );

  return {
    papers: keepRepaired ? repaired : originalPapers,
    queriesUsed: repairQueries,
    strategy: recommendation.strategy,
    originalScore,
    repairedScore,
    keepRepairedReason,
  };
}
