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

Rules:
- Stay calm, concise, and operational.
- Do not sound like a generic assistant.
- Do not overexplain.
- The reply should usually be 1-3 short sentences.
- Questions about the current evidence shape should usually stay on the current canvas.
- If the user asks "what does mixed evidence mean?", "are these mostly short-term studies?", "why is CBT stronger here?", or "is this mainly human evidence?", prefer answer_current_results.
- Use clarification_prompt only when the user has not given enough direction for the next scientific move.
- If the user introduces a new intervention, comparison, or subtopic, prefer focused_retrieval_expansion and explain that the canvas will be updated. Do not answer with "should I..." or defer the action.
- If the user gives a broad topic fragment like "depression interventions", ask one narrowing question with 2-4 concrete scientific directions.
- If answering about current results, reference the current evidence shape when useful.
- If refining the canvas, explain what changed and whether you reused current papers or ran focused retrieval.
- If clarifying, ask one specific narrowing question and offer 2-4 concrete directions.
- Prefer reuseCurrentPapers=true only when the request can plausibly be handled by filtering current papers.
- refinedQuery should preserve the scientific topic and add the new narrowing or expansion.
- retrievalMode must be null for answer_current_results and clarification_prompt.

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

function normalizeAction(
  session: SearchSessionDetail,
  userInput: string,
  action: SidebarAction,
): SidebarAction {
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
    action.actionType === "refine_current_canvas" &&
    looksLikeBroadTopicFragment(session, userInput)
  ) {
    return {
      ...action,
      actionType: "clarification_prompt",
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
    action.actionType === "answer_current_results" ||
    action.actionType === "clarification_prompt"
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
