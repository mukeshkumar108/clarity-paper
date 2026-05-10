import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import type { ResearchPlan } from "./types";

// Planner outputs pure JSON — Flash Lite is fast and accurate enough for this task.
const PLANNER_MODEL =
  process.env.OPENROUTER_PLANNER_MODEL ?? "google/gemini-2.5-flash-lite";

const researchPlanSchema = z.object({
  intentType: z.enum([
    "claim_check",
    "topic_exploration",
    "dose_question",
    "paper_search",
    "paper_explanation",
  ]),
  userQuestion: z.string(),
  entities: z.array(z.string()),
  hiddenGoals: z.array(z.string()),
  queryVariants: z.array(z.string()).min(2).max(6),
  inclusionCriteria: z.array(z.string()),
  exclusionCriteria: z.array(z.string()),
  desiredEvidenceTypes: z.array(z.string()),
  followUpQuestions: z.array(z.string()).min(2).max(4),
});

const PLANNER_SYSTEM_PROMPT = `You are a scientific research planning assistant. Your job is to analyse a user's question or claim about health, supplements, or scientific topics, and produce a structured research plan that will guide evidence retrieval.

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

HIDDEN GOALS
Think about what the user actually wants to understand beyond their literal question:
- "is creatine good for the brain?" → hidden goals: cognitive performance, memory, mental fatigue, aging, brain energy
- "20g creatine Alzheimer's" → hidden goals: neuroprotection, disease prevention, cognitive decline, safety at high doses

QUERY VARIANTS
Generate 4-6 semantically distinct search queries — not keyword repetitions. Each should target a different aspect of the research space:
- Different outcome measures
- Different populations
- Different study designs (including mechanism)
- Different time horizons

Example for "does creatine help the brain?":
- "creatine supplementation cognitive function randomized trial"
- "creatine brain energy metabolism neuroprotection"
- "creatine sleep deprivation mental performance"
- "creatine working memory adults"
- "creatine Alzheimer's neurodegeneration"

FOLLOW-UP QUESTIONS
Generate 3-4 natural follow-up questions a curious person would want to explore after seeing initial results. Write them as if a friend is asking, not as database query headers.

RULES
- Never fabricate entities not present in the user's question
- Never generate queries that are just synonyms of each other
- Never include medical recommendations in the plan
- For dose_question intent: include both "effects at dose X" and "safety at dose X" as separate query variants

Return strict JSON only.`;

export async function planResearch(query: string): Promise<ResearchPlan> {
  const raw = await callLLM(
    PLANNER_SYSTEM_PROMPT,
    `User query: ${query}`,
    researchPlanSchema,
    { model: PLANNER_MODEL, temperature: 0.1 },
  );

  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const parsed = researchPlanSchema.parse(data);
  return parsed as ResearchPlan;
}
