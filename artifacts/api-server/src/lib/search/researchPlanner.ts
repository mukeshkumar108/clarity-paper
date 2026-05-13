import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import type { ResearchPlan } from "./types";

// Planner outputs pure JSON — Flash Lite is fast and accurate enough for this task.
const PLANNER_MODEL =
  process.env.OPENROUTER_PLANNER_MODEL ?? "google/gemini-2.5-flash-lite";

const CONTEXT_QUERY_CUES = [
  "mechanism",
  "mechanisms",
  "pathway",
  "pathways",
  "metabolism",
  "neuroprotection",
  "molecular",
  "cellular",
  "in vitro",
  "animal model",
];

const DIRECT_EVIDENCE_CUES = [
  "randomized",
  "randomised",
  "trial",
  "controlled",
  "systematic review",
  "meta-analysis",
  "meta analysis",
  "clinical",
  "human",
  "patients",
  "adults",
  "cohort",
];

const researchPlanSchema = z.object({
  intentType: z.enum([
    "claim_check",
    "topic_exploration",
    "dose_question",
    "paper_search",
    "paper_explanation",
  ]),
  userQuestion: z.string(),
  detectedLanguage: z.string(),
  responseLanguage: z.string(),
  normalizedEnglishQuestion: z.string(),
  entities: z.array(z.string()),
  hiddenGoals: z.array(z.string()),
  directQueryVariants: z.array(z.string()).min(2).max(4),
  contextQueryVariants: z.array(z.string()).min(1).max(3),
  queryVariants: z.array(z.string()).min(2).max(6),
  inclusionCriteria: z.array(z.string()),
  exclusionCriteria: z.array(z.string()),
  desiredEvidenceTypes: z.array(z.string()),
  followUpQuestions: z.array(z.string()).min(2).max(4),
  isComparison: z.boolean(),
  comparisonTarget: z.string().nullable(),
});

const PLANNER_SYSTEM_PROMPT = `You are a scientific research planning assistant. Your job is to analyse a user's question or claim about health, supplements, or scientific topics, and produce a structured research plan that will guide evidence retrieval.

LANGUAGE
Detect the language the user actually wrote in.
- detectedLanguage: name it plainly, e.g. "English", "Spanish", "Portuguese"
- responseLanguage: usually the same as detectedLanguage
- normalizedEnglishQuestion: rewrite the user's real question in natural English for literature retrieval

Important:
- Keep userQuestion exactly as the user wrote it
- Query variants should be written in English, because the literature APIs work best on English retrieval queries
- Follow-up questions should be written in the user's responseLanguage

INTENT CLASSIFICATION
Classify the user's intent as exactly one of:
- claim_check: User is asking whether a specific claim is true (e.g. "I heard X causes Y")
- topic_exploration: User wants to understand a broad topic (e.g. "tell me about meditation")
- dose_question: User is asking about dosing, protocols, or amounts (e.g. "is 20g creatine safe?")
- paper_search: User explicitly wants papers or studies on a topic
- paper_explanation: User wants to understand a specific paper they reference

ENTITY EXTRACTION
Extract the primary measurable entities (supplements, interventions, conditions, outcomes). Be specific:
- NOT "brain health" — YES "cognitive performance", "working memory", "neuroprotection"
- NOT "supplements" — YES "creatine", "magnesium glycinate"
- Normalize entities into English retrieval terms even when the user wrote in another language

HIDDEN GOALS
Think about what the user actually wants to understand beyond their literal question:
- "is creatine good for the brain?" → hidden goals: cognitive performance, memory, mental fatigue, aging, brain energy
- "20g creatine Alzheimer's" → hidden goals: neuroprotection, disease prevention, cognitive decline, safety at high doses

Keep hiddenGoals in English as internal retrieval concepts, even when responseLanguage is not English.

QUERY VARIANTS
Generate two query lanes:

1. directQueryVariants (2-4)
These are the most literal, high-precision retrieval queries for the user's actual question.
For intervention-condition questions, these should keep the intervention tied to the condition or target outcome.
Example: "creatine supplementation Alzheimer's disease trial"

2. contextQueryVariants (1-3)
These are broader supporting or mechanism queries that are only useful if the direct lane is sparse.
Example: "creatine brain energy metabolism neuroprotection"

queryVariants must contain directQueryVariants first, then contextQueryVariants, with no duplicates.

The direct lane should prioritize:
- exact intervention or exposure
- exact condition / target outcome
- human evidence forms first when the question is practical

The context lane can explore:
- mechanism
- adjacent populations
- broader background evidence

Example for "does creatine help the brain?":
- directQueryVariants:
  - "creatine supplementation cognitive function randomized trial"
  - "creatine working memory adults"
- contextQueryVariants:
  - "creatine brain energy metabolism neuroprotection"
  - "creatine sleep deprivation mental performance"
  - "creatine Alzheimer's neurodegeneration"

FOLLOW-UP QUESTIONS
Generate 3-4 natural follow-up questions a curious person would want to explore after seeing initial results. Write them as if a friend is asking, not as database query headers.

COMPARISON DETECTION
Detect whether the user is comparing two interventions/exposures/approaches:
- "is X better than Y?" → isComparison: true, comparisonTarget: "Y"
- "X vs Y for Z" → isComparison: true, comparisonTarget: "Y"
- "how does X compare to Y?" → isComparison: true, comparisonTarget: "Y"
- "is intermittent fasting better than calorie restriction?" → isComparison: true, comparisonTarget: "calorie restriction"
- Single-intervention questions → isComparison: false, comparisonTarget: null

RULES
- Never fabricate entities not present in the user's question
- Never generate queries that are just synonyms of each other
- Never include medical recommendations in the plan
- For dose_question intent: include both "effects at dose X" and "safety at dose X" as separate query variants
- For intervention-condition questions like "does X help with Y", directQueryVariants must explicitly keep X and Y together
- Do not let broad mechanism or aging queries crowd out direct evidence queries

Return strict JSON only.`;

function uniqueQueries(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hasCue(query: string, cues: string[]): boolean {
  const lower = query.toLowerCase();
  return cues.some((cue) => lower.includes(cue));
}

function normalizeResearchPlan(plan: ResearchPlan): ResearchPlan {
  const allQueries = uniqueQueries([
    ...plan.directQueryVariants,
    ...plan.contextQueryVariants,
    ...plan.queryVariants,
  ]);

  const seededDirect = uniqueQueries(
    plan.directQueryVariants.filter(
      (query) => !hasCue(query, CONTEXT_QUERY_CUES) || hasCue(query, DIRECT_EVIDENCE_CUES),
    ),
  );
  const seededContext = uniqueQueries([
    ...plan.contextQueryVariants,
    ...plan.directQueryVariants.filter(
      (query) => hasCue(query, CONTEXT_QUERY_CUES) && !hasCue(query, DIRECT_EVIDENCE_CUES),
    ),
  ]);

  const remaining = allQueries.filter(
    (query) => !seededDirect.includes(query) && !seededContext.includes(query),
  );

  const direct = [...seededDirect];
  const context = [...seededContext];

  for (const query of remaining) {
    if (direct.length < 4 && !hasCue(query, CONTEXT_QUERY_CUES)) {
      direct.push(query);
    } else if (context.length < 3) {
      context.push(query);
    }
  }

  while (direct.length < 2 && context.length > 0) {
    direct.push(context.shift()!);
  }

  const finalDirect = uniqueQueries(direct).slice(0, 4);
  const finalContext = uniqueQueries(
    context.filter((query) => !finalDirect.includes(query)),
  ).slice(0, 3);

  return {
    ...plan,
    detectedLanguage: plan.detectedLanguage || "English",
    responseLanguage: plan.responseLanguage || plan.detectedLanguage || "English",
    normalizedEnglishQuestion:
      plan.normalizedEnglishQuestion || plan.userQuestion,
    isComparison: plan.isComparison ?? false,
    comparisonTarget: plan.comparisonTarget ?? null,
    directQueryVariants: finalDirect,
    contextQueryVariants: finalContext,
    queryVariants: [...finalDirect, ...finalContext],
  };
}

export async function planResearch(query: string): Promise<ResearchPlan> {
  const raw = await callLLM(
    PLANNER_SYSTEM_PROMPT,
    `User query: ${query}`,
    researchPlanSchema,
    { model: PLANNER_MODEL, temperature: 0.1 },
  );

  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const parsed = researchPlanSchema.parse(data);
  return normalizeResearchPlan(parsed as ResearchPlan);
}
