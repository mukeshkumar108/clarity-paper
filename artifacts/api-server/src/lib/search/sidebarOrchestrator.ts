import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import type { SearchSessionDetail, RankedPaper } from "./types";

const ORCHESTRATOR_MODEL =
  process.env.OPENROUTER_PLANNER_MODEL ?? "google/gemini-2.5-flash-lite";

const sidebarActionSchema = z.object({
  actionType: z.enum([
    "answer_current_results",
    "refine_current_canvas",
    "focused_retrieval_expansion",
    "clarification_prompt",
    "exhaustive_intent_transparency",
  ]),
  assistantReply: z.string(),
  refinedQuery: z.string().nullable(),
  reuseCurrentPapers: z.boolean(),
  filters: z.object({
    population: z.enum(["human", "animal", "in_vitro"]).nullable(),
    studyDesign: z.enum(["meta_analysis", "systematic_review", "rct", "cohort", "cross_sectional"]).nullable(),
    evidenceBuckets: z.array(z.enum(["strongest", "human_observational", "mechanistic", "background", "conflicting"])).max(3),
    keywordFocus: z.array(z.string()).max(4),
  }),
  focusSummary: z.string(),
  focusBadges: z.array(z.string()).max(5),
  retrievalMode: z.enum(["reused_current_papers", "focused_retrieval"]).nullable(),
});

export type SidebarAction = z.infer<typeof sidebarActionSchema>;

const SIDEBAR_SYSTEM_PROMPT = `You are Clarity answering a follow-up question. Give a SHORT ANSWER first, then offer to go deeper.

CRITICAL RULES:
1. NEVER deflect with "that's an interesting angle to explore"
2. NEVER ask "would you like me to search for..." at the end
3. ALWAYS give the actual answer based on current evidence
4. THEN offer 2-3 specific next steps as followUpOptions

REQUIRED RESPONSE STRUCTURE:

**Short answer:** [Direct answer to their question]
**Context:** [Key detail that explains nuance]
**Next:** [What we could explore]

EXAMPLE:
User: "Why the contradiction on cognitive effects?"

assistantReply: "Short answer: It's likely about timing. Smith tested people immediately after sleep deprivation, Jones tested after recovery sleep.

Context: This makes sense mechanistically—creatine helps maintain ATP during acute stress, but doesn't fix underlying sleep debt. So it helps in the moment, not long-term.

Next: Want me to dig into the high-dose protocols the positive study used, or compare how caffeine works differently?"

BAD EXAMPLE (NEVER DO):
❌ "That's an interesting question. Would you like me to explore mechanisms of action, long-term effects, or population differences?"
❌ "The studies show various outcomes. We could look at more papers on this topic."
❌ "Paper 2 found X while Paper 3 found Y. You could read the full papers for more details."

ACTION TYPES:
1. answer_current_results — Give real answer from current papers + specific next steps
2. refine_current_canvas — Narrow view + explain what changed + what this reveals  
3. focused_retrieval_expansion — Acknowledge gap, go get new papers, explain what we're looking for
4. clarification_prompt — When genuinely unclear, ask ONE focused question
5. exhaustive_intent_transparency — Honest about current scope

DECISION RULES:
- User asking about current evidence → answer_current_results
- User wants to narrow focus → refine_current_canvas
- User asking new angle we don't have → focused_retrieval_expansion
- User question too vague → clarification_prompt
- User wants "all papers" → exhaustive_intent_transparency

followUpOptions must be SPECIFIC and USEFUL:
Good: ["high-dose protocols referenced", "how caffeine compares", "why timing matters"]
Bad: ["long-term effects", "mechanism of action", "more studies"]

Return strict JSON.`;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function looksLikeCurrentResultsQuestion(userInput: string): boolean {
  const normalized = normalizeText(userInput);
  return /^(what does|what do|are these|is this|why is|why are|how strong|how much|does this mean)/.test(
    normalized,
  );
}

function looksLikePersonalContextRefinement(userInput: string): boolean {
  const normalized = normalizeText(userInput);
  const hasFirstPerson =
    /\b(i'm|i am|i feel|i get|i have|for me|my)\b/.test(normalized);
  const hasSymptomContext =
    /\b(tired|fatigue|fatigued|sleepy|sleep badly|sleep poorly|exhausted|low energy|brain fog|focus|concentration|wired|anxious|stressed)\b/.test(
      normalized,
    );

  return hasFirstPerson && hasSymptomContext;
}

function looksLikeExplicitRefinement(userInput: string): boolean {
  const normalized = normalizeText(userInput);
  return /^(only|focus on|narrow to|limit to|show me stronger evidence|human rcts only)/.test(
    normalized,
  ) || /\bnon[- ]pharmaceutical only\b/.test(normalized);
}

function looksLikeExhaustiveIntent(userInput: string): boolean {
  const normalized = normalizeText(userInput);
  return /\b(find all papers|show all studies|everything on this|literature review|comprehensive search|all papers|all studies)\b/.test(
    normalized,
  );
}

function looksLikePrecisionGapQuestion(userInput: string): boolean {
  const normalized = normalizeText(userInput);
  return /\b(short-term|long-term|duration|follow-up|protocol|dosage|dose|subgroup|side effects|adverse effects|harms|safety)\b/.test(
    normalized,
  );
}

function looksLikeBroadTopicFragment(session: SearchSessionDetail, userInput: string): boolean {
  const normalized = normalizeText(userInput);
  if (normalized.includes("?")) return false;
  if (normalized.split(" ").length > 4) return false;
  if (/^(what about|show me|only|focus on|compare|is this|are these|why is|why are)/.test(normalized)) {
    return false;
  }

  const sessionTerms = new Set(
    [...session.plan.entities, ...session.query.split(/\s+/)]
      .map((term) => term.toLowerCase().replace(/[^a-z0-9-]/g, ""))
      .filter((term) => term.length > 3),
  );

  const overlap = normalized
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9-]/g, ""))
    .filter((term) => term.length > 3)
    .some((term) => sessionTerms.has(term));

  return !overlap;
}

function buildPersonalContextClarification(userInput: string): string {
  const normalized = normalizeText(userInput);

  if (/\b(tired|fatigue|fatigued|low energy|exhausted)\b/.test(normalized)) {
    return "Tiredness points in a different direction than a generic brain-fog question. Are you mainly trying to understand sleep-related fatigue, low energy, or concentration problems despite adequate sleep?";
  }

  if (/\b(sleep badly|sleep poorly|sleepy)\b/.test(normalized)) {
    return "Poor sleep changes the exploration angle here. Are you trying to understand sleep deprivation effects, sleep-quality effects, or interventions that might help despite poor sleep?";
  }

  return "That changes the exploration angle. Are you mainly trying to understand sleep, fatigue, or a more specific symptom pattern?";
}

function buildClarificationReply(session: SearchSessionDetail, userInput: string): string {
  if (looksLikePersonalContextRefinement(userInput)) {
    return buildPersonalContextClarification(userInput);
  }

  const normalized = normalizeText(userInput);
  if (normalized.includes("depression interventions")) {
    return "Depression interventions is still broad. Are you more interested in therapy approaches, sleep or exercise, treatment-resistant depression, or medication comparisons?";
  }

  return "I need one more detail before narrowing this cleanly. Which direction matters most here?";
}

function buildExhaustiveTransparencyReply(): string {
  return "This canvas is a curated starting set, not an exhaustive literature sweep. A broader all-papers mode is not implemented yet, so I should not present the current set as comprehensive.";
}

function buildPrecisionGapReply(session: SearchSessionDetail, userInput: string): string {
  const normalized = normalizeText(userInput);

  if (/\b(short-term|long-term|duration|follow-up)\b/.test(normalized)) {
    return "The current abstracts do not make that clear enough. This canvas gives a directional read on the evidence, but not a reliable split between short-term and longer-term outcomes.";
  }

  if (/\b(protocol|dosage|dose)\b/.test(normalized)) {
    return "The current abstracts do not make that clear enough. This set is better for the overall evidence shape than for exact protocol or dosage details.";
  }

  if (/\b(subgroup)\b/.test(normalized)) {
    return "The current abstracts do not make that clear enough. They do not give a reliable subgroup read from the current canvas alone.";
  }

  if (/\b(side effects|adverse effects|harms|safety)\b/.test(normalized)) {
    return "The current abstracts do not make that clear enough. Safety and adverse-effect detail are not consistently visible in the current abstracts.";
  }

  return `The current abstracts do not make that clear enough. This canvas is better for the overall evidence shape around ${session.query} than for that level of detail.`;
}

function buildExplicitRefinementReply(session: SearchSessionDetail, userInput: string): {
  reply: string;
  refinedQuery: string;
  focusSummary: string;
  focusBadges: string[];
} {
  const normalized = normalizeText(userInput);

  if (normalized.includes("non-pharmaceutical")) {
    return {
      reply: "I narrowed this to non-pharmaceutical interventions and refreshed the canvas around that.",
      refinedQuery: `${session.query} non-pharmaceutical interventions therapy exercise sleep mindfulness CBT psychotherapy lifestyle`,
      focusSummary: "Narrowed toward non-pharmaceutical interventions within the current exploration.",
      focusBadges: ["non-pharmaceutical", "behavioral", "therapy-first"],
    };
  }

  if (normalized.includes("human rct")) {
    return {
      reply: "I narrowed this toward human randomized evidence and updated the canvas accordingly.",
      refinedQuery: `${session.query} human randomized controlled trial`,
      focusSummary: "Narrowed toward human randomized evidence within the current exploration.",
      focusBadges: ["human evidence first", "RCT-focused"],
    };
  }

  return {
    reply: "I narrowed the canvas around that constraint and refreshed the evidence accordingly.",
    refinedQuery: `${session.query} ${userInput.trim()}`,
    focusSummary: `Refined the canvas around ${userInput.trim()}.`,
    focusBadges: [userInput.trim()].slice(0, 1),
  };
}

function normalizeAction(
  session: SearchSessionDetail,
  userInput: string,
  action: SidebarAction,
): SidebarAction {
  if (/\bnon[- ]pharmaceutical only\b/.test(normalizeText(userInput))) {
    const refinement = buildExplicitRefinementReply(session, userInput);
    return {
      ...action,
      actionType: "refine_current_canvas",
      assistantReply: refinement.reply,
      refinedQuery: refinement.refinedQuery,
      reuseCurrentPapers: false,
      retrievalMode: "focused_retrieval",
      focusSummary: refinement.focusSummary,
      focusBadges: refinement.focusBadges,
    };
  }

  if (looksLikeExhaustiveIntent(userInput)) {
    return {
      ...action,
      actionType: "exhaustive_intent_transparency",
      assistantReply: buildExhaustiveTransparencyReply(),
      refinedQuery: null,
      reuseCurrentPapers: false,
      retrievalMode: null,
      focusSummary: session.focusState.summary,
      focusBadges: [...session.focusState.badges.slice(0, 4), "curated starting set"].slice(0, 5),
    };
  }

  if (
    action.actionType === "answer_current_results" &&
    looksLikePersonalContextRefinement(userInput)
  ) {
    return {
      ...action,
      actionType: "clarification_prompt",
      assistantReply: buildClarificationReply(session, userInput),
      refinedQuery: null,
      reuseCurrentPapers: false,
      retrievalMode: null,
      focusSummary: session.focusState.summary,
      focusBadges: session.focusState.badges,
    };
  }

  if (
    action.actionType === "clarification_prompt" &&
    looksLikeCurrentResultsQuestion(userInput)
  ) {
    return {
      ...action,
      actionType: "answer_current_results",
      reuseCurrentPapers: false,
      retrievalMode: null,
    };
  }

  if (
    (action.actionType === "clarification_prompt" ||
      action.actionType === "answer_current_results") &&
    looksLikeExplicitRefinement(userInput)
  ) {
    const refinement = buildExplicitRefinementReply(session, userInput);
    return {
      ...action,
      actionType: "refine_current_canvas",
      assistantReply: refinement.reply,
      refinedQuery: refinement.refinedQuery,
      reuseCurrentPapers: false,
      retrievalMode: "focused_retrieval",
      focusSummary: refinement.focusSummary,
      focusBadges: refinement.focusBadges,
    };
  }

  if (
    action.actionType === "refine_current_canvas" &&
    looksLikeBroadTopicFragment(session, userInput)
  ) {
    return {
      ...action,
      actionType: "clarification_prompt",
      assistantReply: buildClarificationReply(session, userInput),
      reuseCurrentPapers: false,
      retrievalMode: null,
    };
  }

  if (
    action.actionType === "focused_retrieval_expansion" &&
    action.assistantReply.toLowerCase().includes("should i")
  ) {
    return {
      ...action,
      assistantReply: `I widened the canvas toward ${userInput.trim()} and ran a more targeted retrieval around that direction.`,
    };
  }

  if (
    action.actionType === "clarification_prompt" &&
    /(^|\b)(i will|i narrowed|i filtered|i updated|refreshed the canvas|updated the canvas)(\b|$)/i.test(
      action.assistantReply,
    )
  ) {
    return {
      ...action,
      assistantReply: buildClarificationReply(session, userInput),
      retrievalMode: null,
    };
  }

  if (
    action.actionType === "answer_current_results" &&
    looksLikePrecisionGapQuestion(userInput)
  ) {
    return {
      ...action,
      assistantReply: buildPrecisionGapReply(session, userInput),
      retrievalMode: null,
    };
  }

  if (
    action.actionType === "answer_current_results" ||
    action.actionType === "clarification_prompt" ||
    action.actionType === "exhaustive_intent_transparency"
  ) {
    return {
      ...action,
      retrievalMode: null,
    };
  }

  return action;
}

function summarizePapers(papers: RankedPaper[]): string {
  return papers.slice(0, 6).map((paper, index) => [
    `Paper ${index + 1}: ${paper.title}`,
    `Study design: ${paper.studyDesign} | Population: ${paper.populationType} | Bucket: ${paper.evidenceBucket}`,
    `Summary: ${paper.plainSummary}`,
  ].join("\n")).join("\n\n");
}

export async function orchestrateSidebarInput(
  session: SearchSessionDetail,
  userInput: string,
): Promise<SidebarAction> {
  const userMessage = [
    `SIDEBAR INPUT: ${userInput}`,
    `CURRENT QUERY: ${session.query}`,
    `CURRENT FOCUS SUMMARY: ${session.focusState.summary}`,
    `CURRENT FOCUS BADGES: ${session.focusState.badges.join(", ")}`,
    `CURRENT INTENT: ${session.plan.intentType}`,
    `CURRENT ENTITIES: ${session.plan.entities.join(", ")}`,
    `CURRENT FIRST READ: ${session.synthesisText}`,
    `CURRENT EVIDENCE SNAPSHOT: meta=${session.evidenceSnapshot.metaAnalyses}, rcts=${session.evidenceSnapshot.rcts}, human_observational=${session.evidenceSnapshot.humanObservational}, mechanistic=${session.evidenceSnapshot.mechanistic}, conflicting=${session.evidenceSnapshot.conflicting}`,
    `CURRENT PAPERS:`,
    summarizePapers(session.papers),
  ].join("\n\n");

  const raw = await callLLM(
    SIDEBAR_SYSTEM_PROMPT,
    userMessage,
    sidebarActionSchema,
    { model: ORCHESTRATOR_MODEL, temperature: 0.1, timeoutMs: 25_000 },
  );

  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const parsed = sidebarActionSchema.parse(data);
  return normalizeAction(session, userInput, parsed);
}
