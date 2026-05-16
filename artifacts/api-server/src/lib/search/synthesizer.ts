import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import { logger } from "../logger";
import type { RankedPaper, ResearchPlan, EvidenceSnapshot, Pathway, InvestigationState } from "./types";
import type { Contradiction } from "./contradictionDetector";
import { extractClaims } from "./evidenceSpans";

function deduplicateFollowUpOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const option of options) {
    const key = option.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
    if (!seen.has(key) && key.length > 5) {
      seen.add(key);
      result.push(option);
    }
  }
  return result;
}

// Search synthesis split into three models run in parallel:
// - Editorial: synthesisText (Flash full — needs voice + judgment)
// - Follow-ups: followUpOptions (Flash Lite — creative framing, cheap)
// - Mechanical: paperSummaries + confidence + noEvidence (Flash Lite — fast extraction)
// Total latency = max(editorial, mechanical, followUps) ≈ same as single call but better output.
const SEARCH_EDITORIAL_MODEL =
  process.env.OPENROUTER_SEARCH_MODEL ?? "google/gemini-2.5-flash";
const SEARCH_MECHANICAL_MODEL =
  process.env.OPENROUTER_SEARCH_LITE_MODEL ?? "google/gemini-2.5-flash-lite";
const SEARCH_FOLLOWUP_MODEL =
  process.env.OPENROUTER_SEARCH_FOLLOWUP_MODEL ?? "google/gemini-2.5-flash-lite";
const SEARCH_BACKUP_MODEL =
  process.env.OPENROUTER_SEARCH_BACKUP_MODEL ?? "anthropic/claude-3.5-haiku";

const pathwayIconSchema = z.enum(["strong", "complicated", "population", "emerging", "practical", "mechanism", "contradiction"]);

function coerceEvidenceFit(val: unknown): unknown {
  if (typeof val === "number") return val === 1 ? "direct" : val === 2 ? "adjacent" : "weak";
  return val;
}

const pathwaySchema = z.object({
  label: z.string(),
  preview: z.string(),
  question: z.string(),
  evidenceFit: z.preprocess(coerceEvidenceFit, z.enum(["direct", "adjacent", "weak"])).catch("weak"),
  relevantPaperCount: z.number().catch(0),
  icon: pathwayIconSchema.catch("strong"),
});

const synthesisOutputSchema = z.object({
  synthesisText: z.string(),
  pathways: z.array(pathwaySchema).min(2).max(5),
  openThreads: z.array(z.string()).optional().default([]),
});

const followUpSchema = z.object({
  followUpOptions: z.array(z.string()).min(2).max(5),
});

const mechanicalOutputSchema = z.object({
  confidence: z.enum(["preliminary", "promising", "moderate", "strong"]),
  noEvidence: z.boolean(),
  paperSummaries: z.array(
    z.object({
      externalId: z.string(),
      summary: z.string(),
    }),
  ),
});

export type SynthesisOutput = {
  synthesisText: string;
  pathways: Pathway[];
  openThreads: string[];
  confidence: string;
  noEvidence: boolean;
  paperSummaries: Array<{ externalId: string; summary: string }>;
  followUpOptions: string[];
};

const SYNTHESIS_SYSTEM_PROMPT = `You are the research companion inside Clarity. Someone asked you a question. You looked up the research. Now answer them.

Start with your answer — yes, no, it depends on X, or genuinely unclear and here's exactly why. Your answer to their question in the first sentence, not "evidence suggests" or "studies have shown." Then support it with specifics from the papers.

Second paragraph: what makes this answer genuinely interesting or complicated. Specific contradictions, unexpected findings, population differences that change the picture. Not general background, not mechanisms unless the question was about mechanisms.

Final paragraph (or end of second): your concrete takeaway. Not a confidence-level statement, not what future research might show — something like "treat this as X, not Y" or "the evidence is solid for A but doesn't yet support B." Leave them with a clear position they can actually use.

The papers are your source material, not your outline. Use what's relevant to the answer and ignore what isn't.

Who you're talking to: someone curious enough to search for research. They might want full detail and citations. They might just want the bottom line. Read their question and calibrate.

Return strict JSON:
- synthesisText: 2-3 paragraphs of prose. No bullet points, no headers. First sentence = your answer to the question.
- pathways: 3-5 directions to go deeper. These should feel like specific next questions that emerge from what you just found — the places a curious person would naturally want to investigate next. Not topic categories. Each: label (short, specific — e.g. "Why the sleep deprivation effect is so pronounced" not "Cognitive effects"), preview (one intriguing sentence about what they'll actually find), question (the specific follow-up), evidenceFit ("direct"/"adjacent"/"weak"), relevantPaperCount, icon ("strong"/"complicated"/"population"/"emerging"/"practical"/"mechanism"/"contradiction")

Grounding — always:
- Causal language only for RCTs and meta-analyses. "Associated with" for observational.
- Don't generalize beyond the studied population.
- Never invent findings or study details.
- Label inferences.`;

const MECHANICAL_SYSTEM_PROMPT = `You are a precise scientific extraction assistant. Your job is purely mechanical — extract structured metadata from a set of papers and their evidence landscape.

OUTPUT STRICT JSON ONLY with these fields:
- confidence: "preliminary" (only animal/in-vitro or 1-2 small human studies) | "promising" (1-2 RCTs or several observational) | "moderate" (multiple RCTs or 1+ meta-analysis with consistency) | "strong" (multiple meta-analyses with consistent RCT evidence)
- noEvidence: true if zero papers OR all papers are mechanistic/animal only OR no papers address the user's actual question
- paperSummaries: for each paper, write a single vivid plain-English sentence about what this study actually found. Under 200 characters. Not the title. Note the population if relevant.`;

const FOLLOW_UP_SYSTEM_PROMPT = `You're helping someone explore a scientific question. Based on what they've asked and what the evidence shows, generate follow-up pathways and questions that would genuinely help them go deeper.

Pathways should feel like natural next questions a curious person would want to follow — specific directions that emerge from the evidence, not generic categories.

Each pathway: label (short, specific), preview (one intriguing sentence revealing something they'll find), question (the actual follow-up to search), evidenceFit ("direct"/"adjacent"/"weak"), icon ("strong"/"complicated"/"population"/"emerging"/"practical"/"mechanism"/"contradiction")

Also generate 2-4 shorter follow-up chips as plain question strings.

Return strict JSON: { pathways: [...], followUpOptions: [...] }`;

function extractRelevantAbstractText(
  abstract: string,
  entities: string[],
  maxLength: number,
): string {
  if (abstract.length <= maxLength) return abstract;

  const sentences = abstract.split(/(?<=[.!?])\s+/);
  const entityLower = entities.map((e) => e.toLowerCase());

  const scored = sentences.map((s, i) => {
    const sLower = s.toLowerCase();
    let score = 0;
    if (i === 0) score += 2;
    for (const e of entityLower) {
      if (sLower.includes(e)) score += 3;
      const tokens = e.split(/\s+/);
      for (const t of tokens) {
        if (t.length > 3 && sLower.includes(t)) score += 1;
      }
    }
    return { sentence: s, score, index: i };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = new Set<number>();
  let totalLen = 0;
  for (const { sentence, index } of scored) {
    if (totalLen + sentence.length + 1 > maxLength) break;
    selected.add(index);
    totalLen += sentence.length + 1;
  }

  const result = sentences
    .filter((_, i) => selected.has(i))
    .join(" ");
  return result.length > maxLength ? result.slice(0, maxLength) : result;
}

function formatPapersForSynthesis(papers: RankedPaper[], entities: string[] = []): string {
  return papers
    .slice(0, 10)
    .map((p, i) => {
      const abstract = extractRelevantAbstractText(p.abstract, entities, 1200);
      const authors =
        p.authors.length > 0
          ? p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : "")
          : "Unknown authors";
      const fitLabel = p.evidenceFit?.overall ?? "weak";
      const fitContext = fitLabel === "direct" ? "DIRECT — this paper is directly on the question" :
                         fitLabel === "adjacent" ? "ADJACENT — related but not a direct answer" :
                         fitLabel === "weak" ? "WEAK — tangentially relevant" :
                         "MISMATCH — probably not answering this question";
      const designContext = p.studyDesign === "meta_analysis" ? "Meta-analysis" :
                            p.studyDesign === "systematic_review" ? "Systematic review" :
                            p.studyDesign === "rct" ? "Randomized controlled trial" :
                            p.studyDesign === "cohort" ? "Cohort study" :
                            p.studyDesign === "cross_sectional" ? "Cross-sectional" :
                            p.studyDesign === "case_report" ? "Case report" :
                            p.studyDesign === "editorial" ? "Editorial" :
                            "Study type unclear";
      const popContext = p.populationType === "human" ? "Human" :
                         p.populationType === "animal" ? "Animal" :
                         p.populationType === "in_vitro" ? "In vitro" :
                         "Population unclear";
      return [
        `Paper ${i + 1}: ${p.title}`,
        `  Authors: ${authors} | Year: ${p.year ?? "Unknown"}`,
        `  Design: ${designContext} | Population: ${popContext}`,
        `  Fit: ${fitContext}`,
        p.evidenceFit?.isHeadToHead ? `  ⚠ This is a HEAD-TO-HEAD comparison paper — directly compares interventions` : "",
        `  Abstract: ${abstract}${p.abstract.length > 1200 ? "..." : ""}`,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

async function attemptEditorialSynthesis(
  userMessage: string,
  model: string,
  timeoutMs: number,
): Promise<z.infer<typeof synthesisOutputSchema>> {
  const raw = await callLLM(
    SYNTHESIS_SYSTEM_PROMPT,
    userMessage,
    synthesisOutputSchema,
    { model, temperature: 0.45, timeoutMs, maxTokens: 4096 },
  );
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  return synthesisOutputSchema.parse(data);
}

async function attemptMechanicalExtraction(
  userMessage: string,
  model: string,
  timeoutMs: number,
): Promise<z.infer<typeof mechanicalOutputSchema>> {
  const raw = await callLLM(
    MECHANICAL_SYSTEM_PROMPT,
    userMessage,
    mechanicalOutputSchema,
    { model, temperature: 0.1, timeoutMs },
  );
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  return mechanicalOutputSchema.parse(data);
}

function buildFollowUpContext(
  plan: ResearchPlan,
  snapshot: EvidenceSnapshot,
  papers: RankedPaper[],
  isFirstTurn: boolean,
  previousSynthesis?: string,
): string {
  const maxOptions = isFirstTurn ? 5 : 3;
  const maxPathways = isFirstTurn ? 5 : 3;
  const lines = [
    `USER QUESTION: ${plan.userQuestion}`,
    plan.isComparison ? `Comparison target: ${plan.comparisonTarget}` : "",
    previousSynthesis ? `Previous answer summary: ${previousSynthesis.slice(0, 300)}` : "",
    "",
    `Evidence landscape: ${snapshot.metaAnalyses} meta-analyses, ${snapshot.rcts} RCTs, ${snapshot.humanObservational} observational, ${snapshot.mechanistic} mechanistic, ${snapshot.conflicting} conflicting`,
    "",
    `Top papers (titles only):`,
    ...papers.slice(0, 5).map((p) => `  - ${p.title}`),
    "",
    `Generate ${maxPathways} pathways and ${maxOptions} follow-up questions. ${isFirstTurn ? "First turn — broader exploration." : "Follow-up turn — more specific, more focused. Zoom in."}`,
  ];
  return lines.filter(Boolean).join("\n");
}

const followUpOutputSchema = z.object({
  pathways: z.array(pathwaySchema).min(2).max(5),
  followUpOptions: z.array(z.string()).min(2).max(5),
});

async function attemptFollowUpGeneration(
  context: string,
  model: string,
  timeoutMs: number,
): Promise<{ pathways: Pathway[]; followUpOptions: string[] }> {
  const raw = await callLLM(
    FOLLOW_UP_SYSTEM_PROMPT,
    context,
    followUpOutputSchema,
    { model, temperature: 0.45, timeoutMs },
  );
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const parsed = followUpOutputSchema.parse(data);
  return {
    pathways: parsed.pathways,
    followUpOptions: deduplicateFollowUpOptions(parsed.followUpOptions),
  };
}

export async function synthesisePapers(
  plan: ResearchPlan,
  papers: RankedPaper[],
  snapshot: EvidenceSnapshot,
  contradictions?: Contradiction[],
): Promise<SynthesisOutput> {
  const papersText =
    papers.length > 0
      ? formatPapersForSynthesis(papers, [...plan.entities, ...(plan.hiddenGoals ?? [])])
      : "No papers were retrieved.";

  const depthNote =
    plan.conversationDepth === "orient"
      ? `This is a broad exploratory question — orient the user with the most important finding, then open threads to explore.`
      : plan.conversationDepth === "review"
      ? `The user wants comprehensive coverage — go broad across the evidence landscape.`
      : ``;

  const userMessage = [
    `Someone asked: "${plan.userQuestion}"`,
    plan.entities.length > 0 ? `They're asking specifically about: ${plan.entities.join(", ")}` : "",
    plan.hiddenGoals?.length ? `Underlying interest: ${plan.hiddenGoals.join(", ")}` : "",
    plan.isComparison ? `They want a comparison against: ${plan.comparisonTarget}` : "",
    plan.isPracticalQuery ? `They want to know what to do — give them a practical answer, not just a literature summary.` : "",
    depthNote,
    "",
    `Evidence retrieved: ${snapshot.metaAnalyses} meta-analyses/systematic reviews, ${snapshot.rcts} RCTs, ${snapshot.humanObservational} human observational, ${snapshot.mechanistic} mechanistic/animal, ${snapshot.conflicting} conflicting. Total: ${papers.length} papers.`,
    "",
    contradictions && contradictions.length > 0
      ? [
          `Contradictions in the evidence:`,
          ...contradictions.map((c, i) =>
            `  [${i + 1}] "${c.paperA.title}" (${c.paperA.findingSummary}) vs "${c.paperB.title}" (${c.paperB.findingSummary}) — likely reason: ${c.likelyReason}`,
          ),
          "",
        ].join("\n")
      : "",
    `Papers:`,
    papersText,
  ].filter(Boolean).join("\n");

  // Run editorial, mechanical, and follow-up calls in parallel
  const followUpContext = buildFollowUpContext(plan, snapshot, papers, true);

  // Debug log: full synthesis context (only in non-production)
  if (process.env.NODE_ENV !== "production" || process.env.CLARITY_DEBUG_SYNTHESIS) {
    logger.debug({ userMessage: userMessage.slice(0, 5000), followUpContext: followUpContext.slice(0, 2000), query: plan.userQuestion }, "Synthesis user message (debug)");
  }

  const [editorialResult, mechanicalResult, followUpResult] = await Promise.all([
    (async (): Promise<z.infer<typeof synthesisOutputSchema>> => {
      try {
        const result = await attemptEditorialSynthesis(userMessage, SEARCH_EDITORIAL_MODEL, 60_000);
        logger.info({ model: SEARCH_EDITORIAL_MODEL, query: plan.userQuestion }, "Editorial synthesis succeeded");
        return result;
      } catch (err) {
        logger.warn({ err, model: SEARCH_EDITORIAL_MODEL, query: plan.userQuestion }, "Editorial synthesis failed — trying backup");
        try {
          const result = await attemptEditorialSynthesis(userMessage, SEARCH_BACKUP_MODEL, 90_000);
          logger.info({ model: SEARCH_BACKUP_MODEL, query: plan.userQuestion }, "Editorial backup synthesis succeeded");
          return result;
        } catch (backupErr) {
          logger.error({ err: backupErr, query: plan.userQuestion }, "Editorial synthesis failed after backup");
            return {
              synthesisText: "The paper list is still worth browsing directly. We found relevant research, but the Clarity readout did not land cleanly this time.",
              pathways: [],
              openThreads: [],
            };
        }
      }
    })(),
    (async (): Promise<z.infer<typeof mechanicalOutputSchema>> => {
      try {
        const result = await attemptMechanicalExtraction(userMessage, SEARCH_MECHANICAL_MODEL, 15_000);
        logger.info({ model: SEARCH_MECHANICAL_MODEL, query: plan.userQuestion }, "Mechanical extraction succeeded");
        return result;
      } catch (err) {
        logger.warn({ err, model: SEARCH_MECHANICAL_MODEL, query: plan.userQuestion }, "Mechanical extraction failed — using fallback");
        return {
          confidence: snapshot.overallConfidence,
          noEvidence: papers.length === 0,
          paperSummaries: papers.map((p) => ({
            externalId: p.externalId,
            summary: p.plainSummary?.slice(0, 200) ?? "",
          })),
        };
      }
    })(),
    (async (): Promise<{ pathways: Pathway[]; followUpOptions: string[] }> => {
      try {
        const result = await attemptFollowUpGeneration(followUpContext, SEARCH_FOLLOWUP_MODEL, 10_000);
        logger.info({ model: SEARCH_FOLLOWUP_MODEL, query: plan.userQuestion }, "Follow-up generation succeeded");
        return result;
      } catch (err) {
        logger.warn({ err, model: SEARCH_FOLLOWUP_MODEL, query: plan.userQuestion }, "Follow-up generation failed — using planner fallback");
        return {
          pathways: [],
          followUpOptions: plan.followUpQuestions.slice(0, 5),
        };
      }
    })(),
  ]);

  return {
    ...editorialResult,
    ...mechanicalResult,
    followUpOptions: followUpResult.followUpOptions,
    pathways: editorialResult.pathways?.length > 0 ? editorialResult.pathways : followUpResult.pathways,
  };
}

// ============================================================================
// FOLLOW-UP SYNTHESIS — Answers user questions with delta context
// ============================================================================

// Follow-up synthesis returns only prose from Claude (same simple schema as initial synthesis).
// confidence comes from evidenceSnapshot, chips generated separately by Gemini Lite.
export interface FollowUpSynthesisOutput {
  synthesisText: string;
  followUpOptions: string[];
  pathways: Pathway[];
  confidence: "preliminary" | "promising" | "moderate" | "strong";
  openThreads?: string[];
}

const FOLLOW_UP_SYNTHESIS_PROMPT = `You're part of an ongoing scientific investigation. The user just asked a follow-up question. Answer it.

Start with the answer to what they just asked — not a recap of previous turns, not a preamble. If new papers arrived, explain what they actually say and how they change the picture. If there are no new papers, look at the existing evidence from the angle of this specific question and go deeper.

Then offer 2-3 directions that emerge naturally from what this question revealed.

Grounding: causal language only for RCTs/meta-analyses, never invent findings, label inferences.

Return strict JSON:
- synthesisText: 2-3 paragraphs answering the follow-up
- pathways: 2-3 exploration directions (label, preview, question, evidenceFit, relevantPaperCount, icon)`;

interface FollowUpSynthesisParams {
  originalQuery: string;
  followUpQuestion: string;
  userIntent: {
    mainQuestion: string;
    comparisonTarget: string | null;
    specificOutcome: string | null;
  };
  existingPapers: RankedPaper[];
  newPapers: RankedPaper[];
  previousSynthesis: string;
  evidenceSnapshot: EvidenceSnapshot;
  plan: ResearchPlan;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  openThreads?: string[];
  /** Living investigation state — used as primary context anchor when present */
  investigationState?: InvestigationState;
}

function formatPapersForFollowUp(papers: RankedPaper[], label: string, entities: string[] = []): string {
  if (papers.length === 0) return `${label}: None`;
  
  return papers
    .slice(0, 8)
    .map((p, i) => {
      const abstract = extractRelevantAbstractText(p.abstract, entities, 1000);
      const authors = p.authors.length > 0
        ? p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : "")
        : "Unknown authors";
      const fitLabel = p.evidenceFit?.overall ?? "weak";
      const designLabel = p.studyDesign === "meta_analysis" ? "Meta-analysis" :
                          p.studyDesign === "systematic_review" ? "Systematic review" :
                          p.studyDesign === "rct" ? "RCT" :
                          p.studyDesign === "cohort" ? "Cohort" :
                          p.studyDesign === "cross_sectional" ? "Cross-sectional" :
                          p.studyDesign;
      return [
        `${label} #${i + 1}: ${p.title}`,
        `  ${authors} (${p.year ?? "?"}) | ${designLabel} | ${p.populationType}`,
        `  Fit: ${fitLabel}${p.evidenceFit?.isHeadToHead ? " (head-to-head comparison)" : ""}`,
        `  ${abstract}${p.abstract.length > 1000 ? "..." : ""}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function synthesiseFollowUpAnswer(
  params: FollowUpSynthesisParams,
): Promise<FollowUpSynthesisOutput> {
  const {
    originalQuery,
    followUpQuestion,
    userIntent,
    existingPapers,
    newPapers,
    previousSynthesis,
    evidenceSnapshot,
    plan,
    recentMessages,
    investigationState,
  } = params;

  const hasNewPapers = newPapers.length > 0;
  const allPapers = [...existingPapers, ...newPapers];

  // Primary context anchor: use structured investigationState when available (Phase 1).
  // Falls back to frozen previousSynthesis slice if state not yet built (backward compat).
  const investigationBlock = investigationState
    ? [
        "INVESTIGATION STATE (what has been established so far):",
        `Current focus: ${investigationState.currentFocus}`,
        investigationState.establishedFindings.length > 0
          ? `Established findings:\n${investigationState.establishedFindings.map(f => `  ✓ ${f}`).join("\n")}`
          : "",
        investigationState.openThreads.length > 0
          ? `Still open / unresolved:\n${investigationState.openThreads.map(t => `  ○ ${t}`).join("\n")}`
          : "",
        investigationState.exploredAngles.length > 0
          ? `Already explored (do not repeat):\n${investigationState.exploredAngles.map(a => `  ✗ ${a}`).join("\n")}`
          : "",
        investigationState.contradictions.length > 0
          ? `Active contradictions:\n${investigationState.contradictions.map(c => `  ⚡ ${c}`).join("\n")}`
          : "",
        "",
      ].filter(Boolean)
    : [
        `Initial answer: ${previousSynthesis.slice(0, 600)}`,
        "",
      ];

  // Conversation history block — recent turns for immediate context
  const conversationBlock = recentMessages && recentMessages.length > 0
    ? [
        "RECENT CONVERSATION (last turns):",
        ...recentMessages.map(m =>
          `${m.role === "user" ? "User" : "You"}: ${m.content.slice(0, 1200)}${m.content.length > 1200 ? "..." : ""}`,
        ),
        "",
      ]
    : [];

  // Claim dedup: extract claims from the most recent assistant turn in conversation history.
  // If no conversation history yet, fall back to the original synthesis text.
  const lastAssistantMessage = recentMessages?.slice().reverse().find(m => m.role === "assistant");
  const deduplicationSource = lastAssistantMessage?.content ?? previousSynthesis;
  const previousClaims = extractClaims(deduplicationSource);
  const deduplicationBlock = previousClaims.length > 0
    ? [
        "⛔ DO NOT REPEAT — these points were already covered:",
        ...previousClaims.map((c, i) => `  [${i + 1}] ${c}`),
        "",
        "Only surface what is new or what directly answers the follow-up question.",
        "",
      ]
    : [];

  const userMessage = [
    `FOLLOW-UP INVESTIGATION BRIEFING:`,
    `──────────────────────────────────`,
    `Original query: ${originalQuery}`,
    "",
    ...investigationBlock,
    ...conversationBlock,
    ...deduplicationBlock,
    `═══ CURRENT QUESTION ═══`,
    `"${followUpQuestion}"`,
    `User's real intent: ${userIntent.mainQuestion}`,
    userIntent.comparisonTarget ? `Comparison target: ${userIntent.comparisonTarget}` : "",
    userIntent.specificOutcome ? `Specific outcome: ${userIntent.specificOutcome}` : "",
    "",
    `ENTITY / OUTCOME SPOTLIGHT:`,
    `  Specifically asked about: ${plan.entities.join(", ")}.`,
    plan.hiddenGoals?.length ? `  Also interested in: ${plan.hiddenGoals.join(", ")}.` : "",
    plan.isComparison ? `  Comparison against: ${plan.comparisonTarget}. Address explicitly.` : "",
    "",
    `EVIDENCE STATUS: ${hasNewPapers ? `${newPapers.length} new papers retrieved` : "Using existing evidence — go deeper, not broader"}`,
    hasNewPapers ? `Name the new papers. Name their findings. Show how they shift the picture.` : "",
    "",
    `EVIDENCE SNAPSHOT: ${evidenceSnapshot.metaAnalyses} meta/SR, ${evidenceSnapshot.rcts} RCTs, ${allPapers.length} total papers`,
    "",
    `EXISTING PAPERS:`,
    formatPapersForFollowUp(existingPapers, "EXISTING", [...plan.entities, ...(plan.hiddenGoals ?? [])]),
    "",
    `NEW PAPERS:`,
    formatPapersForFollowUp(newPapers, "NEW", [...plan.entities, ...(plan.hiddenGoals ?? [])]),
  ].filter(Boolean).join("\n");

  const followUpSynthesisSchema = z.object({
    synthesisText: z.string(),
    pathways: z.array(pathwaySchema).min(1).max(5),
  });

  // Run Claude prose + Gemini Lite chips in parallel
  const followUpChipContext = buildFollowUpContext(plan, evidenceSnapshot, allPapers.length > 0 ? allPapers : existingPapers, false, previousSynthesis);

  const [synthesisResult, chipResult] = await Promise.all([
    // Prose: same model as initial, with pathways
    (async (): Promise<{ synthesisText: string; pathways: Pathway[]; openThreads?: string[] }> => {
      for (const attempt of [
        { model: SEARCH_EDITORIAL_MODEL, timeoutMs: 60_000 },
        { model: SEARCH_BACKUP_MODEL, timeoutMs: 90_000 },
      ]) {
        try {
          const raw = await callLLM(
            FOLLOW_UP_SYNTHESIS_PROMPT,
            userMessage,
            followUpSynthesisSchema,
            { model: attempt.model, temperature: 0.45, timeoutMs: attempt.timeoutMs, maxTokens: 4096 },
          );
          const data = typeof raw === "string" ? JSON.parse(raw) : raw;
          const result = followUpSynthesisSchema.parse(data);
          logger.info({ model: attempt.model, hasNewPapers, query: followUpQuestion }, "Follow-up synthesis succeeded");
          return { synthesisText: result.synthesisText, pathways: result.pathways };
        } catch (err) {
          logger.warn({ err, model: attempt.model, query: followUpQuestion }, "Follow-up synthesis attempt failed");
        }
      }
      logger.error({ query: followUpQuestion }, "Follow-up synthesis failed after all attempts");
      return {
        synthesisText: "I found relevant evidence but couldn't synthesize it cleanly this time. The papers are worth reviewing directly.",
        pathways: [],
        openThreads: [],
      };
    })(),
    // Chips + pathways: Gemini Lite
    (async (): Promise<{ pathways: Pathway[]; followUpOptions: string[] }> => {
      try {
        const result = await attemptFollowUpGeneration(followUpChipContext, SEARCH_FOLLOWUP_MODEL, 10_000);
        logger.info({ model: SEARCH_FOLLOWUP_MODEL, query: followUpQuestion }, "Follow-up chip generation succeeded");
        return result;
      } catch {
        return {
          pathways: [],
          followUpOptions: plan.followUpQuestions.slice(0, 4),
        };
      }
    })(),
  ]);

  // Merge pathways: prefer editorial pathways, fall back to chip pathways
  const mergedPathways = synthesisResult.pathways.length > 0 ? synthesisResult.pathways : chipResult.pathways;

  return {
    synthesisText: synthesisResult.synthesisText,
    followUpOptions: deduplicateFollowUpOptions(chipResult.followUpOptions),
    pathways: mergedPathways,
    confidence: evidenceSnapshot.overallConfidence,
  };
}

