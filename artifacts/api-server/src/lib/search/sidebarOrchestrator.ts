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

const SIDEBAR_SYSTEM_PROMPT = `You are Clarity's conversational refinement layer for scientific exploration.

Your job is not to be a chatbot. Your job is to decide how a sidebar input should affect the current exploration canvas.

You will receive:
- the user's latest sidebar input
- the current search question
- the current focus
- the current evidence snapshot
- the current first read
- the top current papers

You must choose exactly one action type:

1. answer_current_results
Use this when the user is asking about the current canvas and you can answer from the current results without new retrieval.

2. refine_current_canvas
Use this when the user wants the current exploration narrowed or reweighted. Prefer reusing current papers when the request can plausibly be satisfied by filtering or re-emphasising current evidence.

3. focused_retrieval_expansion
Use this when the user introduces a new intervention, comparison, or subtopic that likely requires retrieval beyond the current paper set.

4. clarification_prompt
Use this when the request is broad or ambiguous and the best next move is to ask one useful narrowing question with concrete scientific directions.

5. exhaustive_intent_transparency
Use this when the user is clearly asking for exhaustive or bibliographic coverage that the current curated canvas does not honestly provide.

Rules:
- Stay calm, concise, and operational.
- Do not sound like a generic assistant.
- Do not overexplain.
- The reply should usually be 1-3 short sentences.
- Questions about the current evidence shape should usually stay on the current canvas.
- If the user asks "what does mixed evidence mean?", "are these mostly short-term studies?", "why is CBT stronger here?", or "is this mainly human evidence?", prefer answer_current_results.
- If the current abstracts do not clearly answer a question about duration, long-term vs short-term effects, exact protocol, dosage, subgroup effects, or adverse effects, say that clearly instead of inferring beyond the abstracts.
- Use clarification_prompt only when the user has not given enough direction for the next scientific move.
- If the user gives personal context like "I'm just tired all the time" or "I sleep badly", treat that as a change in exploration angle, not generic advice-seeking.
- If the user introduces a new intervention, comparison, or subtopic, prefer focused_retrieval_expansion and explain that the canvas will be updated. Do not answer with "should I..." or defer the action.
- If the user gives a broad topic fragment like "depression interventions", ask one narrowing question with 2-4 concrete scientific directions.
- If the user asks for exhaustive coverage like "find all papers", "show all studies", "everything on this", "literature review", or "comprehensive search", do not pretend the current canvas is exhaustive. Use exhaustive_intent_transparency.
- If answering about current results, reference the current evidence shape when useful.
- If refining the canvas, explain what changed and whether you reused current papers or ran focused retrieval.
- If clarifying, ask one specific narrowing question and offer 2-4 concrete directions. Do not say you already filtered or updated the canvas.
- Prefer reuseCurrentPapers=true only when the request can plausibly be handled by filtering current papers.
- refinedQuery should preserve the scientific topic and add the new narrowing or expansion.
- retrievalMode must be null for answer_current_results, clarification_prompt, and exhaustive_intent_transparency.

Return strict JSON only.`;

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
