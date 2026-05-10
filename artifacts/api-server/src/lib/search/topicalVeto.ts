import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import { logger } from "../logger";
import { DISEASE_TITLE_TERMS } from "./retrievalJudge";
import type { RankedPaper, ResearchPlan } from "./types";

const TOPICAL_VETO_MODEL =
  process.env.OPENROUTER_TOPIC_FILTER_MODEL ?? "meta-llama/llama-3.1-8b-instruct";

const MAX_PAPERS_TO_REVIEW = 15;
const MIN_PAPERS_TO_KEEP = 3;
const TITLE_INTERVENTION_CUES = [
  "supplementation",
  "supplement",
  "intake",
  "treatment",
  "therapy",
  "injection",
  "infusion",
  "syringe",
  "autoinjector",
  "administration",
  "protocol",
];
const FOREIGN_TOKEN_STOPWORDS = new Set([
  "effect",
  "effects",
  "impact",
  "between",
  "with",
  "and",
  "the",
  "for",
  "of",
  "on",
  "in",
  "trial",
  "study",
  "review",
  "meta",
  "analysis",
  "systematic",
  "randomized",
  "controlled",
  "healthy",
  "volunteers",
  "adults",
  "patients",
  "exposure",
  "cold",
  "environment",
  "environments",
  "disease",
]);

const verdictSchema = z.object({
  externalId: z.string(),
  verdict: z.enum(["keep", "adjacent", "remove"]),
  reason: z.string(),
});

const topicalVetoSchema = z.object({
  judgments: z.array(verdictSchema),
});

function shouldRunTopicalVeto(plan: ResearchPlan, papers: RankedPaper[]): boolean {
  if (papers.length <= MIN_PAPERS_TO_KEEP) return false;

  if (
    plan.intentType === "claim_check" ||
    plan.intentType === "topic_exploration" ||
    plan.intentType === "dose_question"
  ) {
    return true;
  }

  const query = (plan.normalizedEnglishQuestion || plan.userQuestion).toLowerCase();
  if (plan.entities.length >= 2) return true;

  return (
    /\b(help|helps|treat|treats|prevent|prevents|good for|bad for|for)\b/.test(query) ||
    /\b(alzheimer|dementia|cancer|depression|adhd|anxiety|covid|obesity)\b/.test(query)
  );
}

function buildPrompt(plan: ResearchPlan, papers: RankedPaper[]): string {
  const paperBlock = papers
    .slice(0, MAX_PAPERS_TO_REVIEW)
    .map((paper, index) => {
      const abstractLead = paper.abstract.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 500);
      return [
        `Paper ${index + 1}`,
        `externalId: ${paper.externalId}`,
        `title: ${paper.title}`,
        `studyType: ${paper.studyType ?? "Unknown"}`,
        `studyDesign: ${paper.studyDesign}`,
        `populationType: ${paper.populationType}`,
        `abstractLead: ${abstractLead || "No abstract available"}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `USER QUESTION: ${plan.userQuestion}`,
    `NORMALIZED ENGLISH QUESTION: ${plan.normalizedEnglishQuestion}`,
    `RESPONSE LANGUAGE: ${plan.responseLanguage}`,
    `INTENT: ${plan.intentType}`,
    `KEY ENTITIES: ${plan.entities.join(", ") || "None extracted"}`,
    `HIDDEN GOALS: ${plan.hiddenGoals.join(", ") || "None"}`,
    "",
    "TASK",
    "Judge whether each paper is directly relevant to the user's actual question.",
    "Use these labels conservatively:",
    '- keep: directly studies the intervention/exposure/claim the user asked about, or is clearly useful core evidence',
    '- adjacent: related background or mechanism, but not a direct answer',
    '- remove: clearly off-topic for the user question, even if it mentions one entity or the disease area generally',
    "",
    "Only use remove for obvious mismatches. If unsure, use adjacent or keep.",
    "A paper about the disease in general is not directly relevant if it does not actually study the intervention/exposure the user asked about.",
    "A paper about the intervention in healthy aging is not directly relevant to a disease-treatment question unless it clearly speaks to that disease question.",
    "",
    "Return strict JSON only.",
    "",
    "PAPERS",
    paperBlock,
  ].join("\n");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hasForeignInterventionMismatch(plan: ResearchPlan, paper: RankedPaper): boolean {
  const titleLower = paper.title.toLowerCase();
  if (plan.entities.length === 0) return false;
  if (plan.entities.some((entity) => titleLower.includes(entity.toLowerCase()))) return false;

  const cueIndex = TITLE_INTERVENTION_CUES
    .map((cue) => titleLower.indexOf(cue))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (cueIndex === undefined) return false;

  const lead = paper.title.slice(0, cueIndex);
  const queryTokens = new Set(
    tokenize(`${plan.normalizedEnglishQuestion || plan.userQuestion} ${plan.entities.join(" ")}`),
  );
  const leadTokens = tokenize(lead).filter(
    (token) =>
      token.length > 3 &&
      !FOREIGN_TOKEN_STOPWORDS.has(token) &&
      !queryTokens.has(token),
  );

  return leadTokens.length > 0;
}

function secondaryEntityTokens(plan: ResearchPlan): string[] {
  return plan.entities
    .slice(1)
    .flatMap((entity) => tokenize(entity))
    .filter((token) => token.length > 3 && !FOREIGN_TOKEN_STOPWORDS.has(token));
}

function hasOffTopicConditionMismatch(plan: ResearchPlan, paper: RankedPaper): boolean {
  const questionLower = (plan.normalizedEnglishQuestion || plan.userQuestion).toLowerCase();
  const textLower = `${paper.title} ${paper.abstract.slice(0, 250)}`.toLowerCase();
  const titleLower = paper.title.toLowerCase();

  const hasUnaskedCondition = DISEASE_TITLE_TERMS.some(
    (term) => titleLower.includes(term) && !questionLower.includes(term),
  ) || (titleLower.includes("covid") && !questionLower.includes("covid"));

  if (!hasUnaskedCondition) return false;

  const secondaryTokens = secondaryEntityTokens(plan);
  if (secondaryTokens.length === 0) return false;

  return !secondaryTokens.some((token) => textLower.includes(token));
}

export async function applyTopicalVeto(
  plan: ResearchPlan,
  papers: RankedPaper[],
): Promise<RankedPaper[]> {
  if (!shouldRunTopicalVeto(plan, papers)) {
    return papers;
  }

  const reviewed = papers.slice(0, MAX_PAPERS_TO_REVIEW);
  const untouchedTail = papers.slice(MAX_PAPERS_TO_REVIEW);
  const deterministicFilteredReviewed = reviewed.filter(
    (paper) =>
      !hasForeignInterventionMismatch(plan, paper) &&
      !hasOffTopicConditionMismatch(plan, paper),
  );
  const deterministicRemoved = reviewed.length - deterministicFilteredReviewed.length;
  const deterministicCombined = [...deterministicFilteredReviewed, ...untouchedTail];

  try {
    const raw = await callLLM(
      "You are a conservative relevance filter for a scientific search engine. Remove only papers that are clearly irrelevant to the user's actual question. Borderline papers should not be removed. Return strict JSON only.",
      buildPrompt(plan, deterministicFilteredReviewed),
      topicalVetoSchema,
      {
        model: TOPICAL_VETO_MODEL,
        temperature: 0,
        timeoutMs: 30_000,
      },
    );

    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = topicalVetoSchema.parse(data);
    const verdicts = new Map(parsed.judgments.map((judgment) => [judgment.externalId, judgment]));

    const filteredReviewed = deterministicFilteredReviewed.filter((paper) => {
      const llmVerdict = verdicts.get(paper.externalId)?.verdict;
      if (llmVerdict === "remove") return false;
      return true;
    });
    const removed = papers.length - ([...filteredReviewed, ...untouchedTail].length);

    if (removed === 0) {
      return deterministicRemoved > 0 && deterministicCombined.length >= MIN_PAPERS_TO_KEEP
        ? deterministicCombined
        : papers;
    }

    const combined = [...filteredReviewed, ...untouchedTail];
    if (combined.length < MIN_PAPERS_TO_KEEP) {
      logger.warn(
        { model: TOPICAL_VETO_MODEL, removed, papersIn: papers.length },
        "Topical veto would leave too few papers — skipping removals",
      );
      return papers;
    }

    const removedPapers = reviewed
      .filter(
        (paper) =>
          verdicts.get(paper.externalId)?.verdict === "remove" ||
          hasForeignInterventionMismatch(plan, paper) ||
          hasOffTopicConditionMismatch(plan, paper),
      )
      .map((paper) => ({
        externalId: paper.externalId,
        title: paper.title,
        reason:
          verdicts.get(paper.externalId)?.verdict === "remove"
            ? verdicts.get(paper.externalId)?.reason ?? "No reason returned"
            : hasForeignInterventionMismatch(plan, paper)
              ? "Foreign intervention mismatch in title"
              : "Off-topic condition mismatch for the user's actual question",
      }));

    logger.info(
      { model: TOPICAL_VETO_MODEL, removed, papersIn: papers.length, removedPapers },
      "Topical veto removed clearly irrelevant papers",
    );

    return combined;
  } catch (err) {
    logger.warn({ err, model: TOPICAL_VETO_MODEL }, "Topical veto failed — keeping original papers");
    if (deterministicRemoved > 0 && deterministicCombined.length >= MIN_PAPERS_TO_KEEP) {
      logger.info(
        { removed: deterministicRemoved, papersIn: papers.length },
        "Deterministic topical guards applied despite LLM veto failure",
      );
      return deterministicCombined;
    }
    return papers;
  }
}
