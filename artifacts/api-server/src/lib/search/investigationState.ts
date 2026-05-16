import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import { logger } from "../logger";
import type { InvestigationState, ResearchPlan } from "./types";

const STATE_MODEL =
  process.env.OPENROUTER_PLANNER_MODEL ?? "google/gemini-2.5-flash-lite";

const investigationStateSchema = z.object({
  establishedFindings: z.array(z.string()).max(5),
  openThreads: z.array(z.string()).max(5),
  exploredAngles: z.array(z.string()).max(10),
  contradictions: z.array(z.string()).max(3),
  currentFocus: z.string(),
});

const BUILD_SYSTEM_PROMPT = `You extract structured investigation state from a scientific synthesis.
Given a user's question and the assistant's initial synthesis, extract:

- establishedFindings: Up to 5 concrete facts the synthesis confirmed. Specific claims, not topic labels. Each under 120 chars.
- openThreads: Up to 5 questions the synthesis raised but did NOT fully answer. Things a curious reader would still want to know.
- exploredAngles: Leave empty [] for the first turn.
- contradictions: Up to 3 named contradictions in the evidence the synthesis surfaced. Empty if none.
- currentFocus: One sentence. What is this investigation currently focused on?

Return strict JSON only. Be concrete and specific — not "evidence is mixed" but "RCTs show X while observational studies show Y."`;

const UPDATE_SYSTEM_PROMPT = `You update a running investigation state after a new conversation turn.
Given the current investigation state, the user's follow-up question, and the new synthesis response, produce an updated state.

Rules:
- establishedFindings: Add new confirmed facts. Remove any that were shown to be wrong. Keep max 5 most important.
- openThreads: Add newly raised questions. Remove threads that were answered in this turn. Keep max 5.
- exploredAngles: Add the follow-up question that was just answered (verbatim or close paraphrase). Keep all previous. Max 10.
- contradictions: Add new contradictions surfaced. Update or remove resolved ones. Max 3.
- currentFocus: Update to reflect what this latest turn zoomed into.

Return strict JSON only. Be concrete and specific.`;

export async function buildInitialInvestigationState(
  plan: ResearchPlan,
  synthesisText: string,
  openThreadsFromSchema: string[],
): Promise<InvestigationState> {
  const userMessage = [
    `USER QUESTION: ${plan.userQuestion}`,
    `INTENT: ${plan.intentType.replace(/_/g, " ")}`,
    plan.isComparison ? `COMPARISON: vs ${plan.comparisonTarget}` : "",
    ``,
    `SYNTHESIS:`,
    synthesisText,
    ``,
    openThreadsFromSchema.length > 0
      ? `OPEN THREADS ALREADY IDENTIFIED BY SYNTHESIZER:\n${openThreadsFromSchema.map(t => `- ${t}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n");

  try {
    const raw = await callLLM(
      BUILD_SYSTEM_PROMPT,
      userMessage,
      investigationStateSchema,
      { model: STATE_MODEL, temperature: 0.1, timeoutMs: 15_000 },
    );
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = investigationStateSchema.parse(data);
    logger.info({ query: plan.userQuestion, findings: parsed.establishedFindings.length, threads: parsed.openThreads.length }, "Investigation state built");
    return parsed;
  } catch (err) {
    logger.warn({ err, query: plan.userQuestion }, "Failed to build investigation state — using minimal fallback");
    return {
      establishedFindings: [],
      openThreads: openThreadsFromSchema.slice(0, 5),
      exploredAngles: [],
      contradictions: [],
      currentFocus: plan.userQuestion,
    };
  }
}

export async function updateInvestigationState(
  current: InvestigationState,
  followUpQuestion: string,
  newSynthesisText: string,
): Promise<InvestigationState> {
  const userMessage = [
    `CURRENT INVESTIGATION STATE:`,
    `Established findings:`,
    ...current.establishedFindings.map(f => `  - ${f}`),
    `Open threads:`,
    ...current.openThreads.map(t => `  - ${t}`),
    `Already explored:`,
    ...current.exploredAngles.map(a => `  - ${a}`),
    `Contradictions:`,
    ...current.contradictions.map(c => `  - ${c}`),
    `Current focus: ${current.currentFocus}`,
    ``,
    `FOLLOW-UP QUESTION JUST ANSWERED: "${followUpQuestion}"`,
    ``,
    `NEW SYNTHESIS:`,
    newSynthesisText,
  ].join("\n");

  try {
    const raw = await callLLM(
      UPDATE_SYSTEM_PROMPT,
      userMessage,
      investigationStateSchema,
      { model: STATE_MODEL, temperature: 0.1, timeoutMs: 15_000 },
    );
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = investigationStateSchema.parse(data);
    logger.info({ followUpQuestion, findings: parsed.establishedFindings.length, threads: parsed.openThreads.length }, "Investigation state updated");
    return parsed;
  } catch (err) {
    logger.warn({ err, followUpQuestion }, "Failed to update investigation state — keeping current");
    // Fallback: add the follow-up to exploredAngles and update focus
    return {
      ...current,
      exploredAngles: [...current.exploredAngles, followUpQuestion].slice(0, 10),
      currentFocus: followUpQuestion,
    };
  }
}
