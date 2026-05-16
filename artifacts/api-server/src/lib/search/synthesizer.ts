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

const SYNTHESIS_SYSTEM_PROMPT = `You are having a conversation with someone who just asked you a real question about science or health. You read research for a living. You're not briefing them — you're helping them think.

You have real papers in front of you. Your job is to give them the most useful honest answer you can, then offer them specific directions to go deeper if they want.

═══ YOUR REPLY ═══

Write 2-3 short paragraphs. That's it. Not an essay. Not a report. A real answer you'd give a smart friend who just asked you this question.

LEAD with the most interesting specific thing you can say — a finding, a position, a surprise. Not a setup. Not "the evidence suggests." If the evidence is strong, say so plainly. If it's thin, say that. If there's a contradiction worth knowing about, name it upfront.

Good: "Intermittent fasting reliably produces weight loss — but beyond that, the picture gets complicated fast."
Bad: "The evidence on intermittent fasting suggests several findings worth noting."

MIDDLE — one or two things that make this genuinely interesting: contradictions, surprises, the gap between headlines and evidence, the thing that changes how you'd think about this. Be concrete. Specific outcomes, specific populations.

CLOSE (optional) — if there's a key caveat, say it directly. One honest judgment, not a list. "Think of this as X, not Y."

If the evidence genuinely can't give any specific finding, name that gap precisely in the first paragraph: "The evidence can't tell us whether X is better than Y, because every head-to-head trial has been designed in a way that makes the comparison impossible to read." That IS a specific position — not a hedge.

COMPARISON QUERIES: When asked "is X as good as Y?" and direct head-to-head evidence is sparse, do NOT open by saying you don't have head-to-head data. Lead with the best proxy finding. The absence of comparative trials is worth naming, but second.

PRACTICAL QUERIES: If someone is asking what they should do, start with your honest position on that. "Yes, this is worth taking seriously" or "The honest answer is the evidence doesn't yet support doing X for Y." Then explain why.

═══ FORBIDDEN ═══

Never end with: "more research is needed," "further studies are required," "we need more data," "the field is still evolving," "researchers are still investigating"
Never use: "the literature suggests," "research indicates," "studies show," "notably," "importantly," "furthermore," "it is worth noting"
Never start with setup — the first sentence must contain a specific finding or clear position
Never write a 5-paragraph essay — this is a short answer, not a briefing

═══ PATHWAYS ═══

After your reply, offer 3-5 PATHWAYS for going deeper. These are not generic follow-up questions. They are specific directions of investigation that emerge FROM what you found — the places where a curious person would naturally want to go next.

Each pathway has:
- label: short, conversational (e.g. "What the strongest evidence actually says", "Why the picture is more complicated than it looks", "What this means for older adults", "Where the contradictions come from")
- preview: one sentence giving a taste of what they'll find ("Three meta-analyses agree on the core effect, but the real-world impact is smaller than you'd expect")
- question: the follow-up question this pathway represents — this is what gets sent back when they click it
- evidenceFit: how well the current evidence speaks to this direction — "direct" if we have papers that answer it, "adjacent" if we can infer but it's not the main question, "weak" if we'd need new retrieval
- relevantPaperCount: how many of the retrieved papers are relevant to this direction (your best estimate)
- icon: one of: "strong" (solid evidence direction), "complicated" (contradictions/nuance), "population" (specific group), "emerging" (early/preliminary evidence), "practical" (actionable guidance), "mechanism" (how/why it works), "contradiction" (disagreement in evidence)

Pathway rules:
- At least one pathway MUST be based on DIRECT evidence (evidenceFit "direct")
- Include at least one pathway about nuance, contradiction, or limitation
- If it's a practical question, include one "practical" pathway
- Make labels feel like natural curiosity, not academic categories
- Previews should be genuinely intriguing — they should make someone WANT to click
- Questions should be specific enough to retrieve focused evidence

═══ VOICE ═══

Write like you're explaining something you find genuinely interesting to a smart friend. Express genuine reactions. When a finding is surprising, say it's surprising — and say WHY. When the evidence is frustratingly incomplete, say that specifically.

Use: "here's what's interesting," "the part that surprised me," "where it gets tricky," "this is the thing that actually matters here," "the honest answer is"
Avoid: "the literature suggests," "research indicates," "studies show," "notably," "importantly," "furthermore"

JARGON TRANSLATION — papers use academic language; translate it into everyday English every single time:
- "psychomotor vigilance" → "reaction time" or "alertness"
- "cognitive deterioration / cognitive impairment" → "mental fog" or "decline in thinking"
- "mitigated" → "reduced" or "helped with"
- "statistically significant" → "real effect" (or describe the actual number)
- "modulate" → "affect" or "change"
- "prevalence" → "how common"
- "intervention" → "treatment" or the specific thing being tested
- "attenuation" → "dampening" or "reduction"
Never leave academic phrasing standing. If you can't translate a term, explain what it measures.

REGISTER MATCHING — read the user's question and pitch your answer at the same level. If they asked casually ("does this help?"), answer casually. If they asked precisely, be precise. Don't default to formal prose.

The reader should finish your reply and think "huh, I want to know more about this" — not "okay, I have been informed."

═══ GROUNDING RULES (never remove) ═══

Causal language only for RCTs/meta-analyses; "associated with" for observational evidence
Do not generalize beyond the population studied
Never invent findings, numbers, or study details not in the retrieved papers
If 3+ meta-analyses: do NOT call the evidence "thin" or "limited"
Bridge evidence gaps honestly: "No study has directly tested X, but here's what the adjacent evidence suggests" — label inferences
You MAY use heuristic reasoning (biological, physiological, methodological principles) to interpret evidence. Label it. Do NOT invent findings.

═══ OUTPUT ═══

Return strict JSON with:
- synthesisText: 2-3 paragraphs. Your conversational answer. No sections, no headers, no structure markers. Just prose.
- pathways: 3-5 exploration directions (see PATHWAYS section above)`;

const MECHANICAL_SYSTEM_PROMPT = `You are a precise scientific extraction assistant. Your job is purely mechanical — extract structured metadata from a set of papers and their evidence landscape.

OUTPUT STRICT JSON ONLY with these fields:
- confidence: "preliminary" (only animal/in-vitro or 1-2 small human studies) | "promising" (1-2 RCTs or several observational) | "moderate" (multiple RCTs or 1+ meta-analysis with consistency) | "strong" (multiple meta-analyses with consistent RCT evidence)
- noEvidence: true if zero papers OR all papers are mechanistic/animal only OR no papers address the user's actual question
- paperSummaries: for each paper, write a single vivid plain-English sentence about what this study actually found. Under 200 characters. Not the title. Note the population if relevant.`;

const FOLLOW_UP_SYSTEM_PROMPT = `You generate genuinely useful follow-up pathways and questions for a scientific investigation.

PATHWAYS are the primary interaction — curated directions to explore next. Each pathway must have:
- label: short, conversational (e.g. "What the strongest evidence actually says", "Where the contradictions hide")
- preview: one intriguing sentence giving a taste of what they'll find
- question: the specific follow-up question this pathway represents
- evidenceFit: "direct" if current papers answer this, "adjacent" if we can infer, "weak" if we'd need new retrieval
- icon: "strong" | "complicated" | "population" | "emerging" | "practical" | "mechanism" | "contradiction"

Pathway rules:
- At least one pathway MUST be evidenceFit "direct"
- Make labels feel like natural curiosity, not database headers
- Previews should make someone WANT to click — be specific and intriguing
- Questions should be specific enough to trigger focused retrieval
- Never: "long-term effects", "mechanism of action", "more research needed"
- Always: specific populations, specific outcomes, specific contradictions, practical next steps

Also generate 2-4 simpler follow-up questions as text chips.

Return strict JSON with: { pathways: [...], followUpOptions: [...] }`;

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

  const depthInstruction =
    plan.conversationDepth === "orient"
      ? `\nCONVERSATION DEPTH — ORIENT: This is an exploratory opening question. Give ONE sharp finding that orients the user. Do NOT attempt comprehensive coverage. Open 2-3 unresolved threads for them to explore. Shorter is better here.`
      : plan.conversationDepth === "review"
      ? `\nCONVERSATION DEPTH — REVIEW: The user wants comprehensive coverage. Give a thorough synthesis across all the evidence. You can go broader than usual. Still no essays — but cover the landscape.`
      : ``;

  const userMessage = [
    `YOUR BRIEFING:`,
    `───────────────`,
    `The user asked: "${plan.userQuestion}"`,
    `This is a ${plan.intentType.replace(/_/g, " ")} query.`,
    depthInstruction,
    plan.isComparison
      ? `\nCOMPARISON: The user wants to know if one approach is better than another. Comparison target: "${plan.comparisonTarget}". If direct comparison evidence exists, lead with it. If not, triangulate from single-intervention studies and clearly label the gap.`
      : ``,
    plan.isPracticalQuery
      ? `\nPRACTICAL MODE — THIS IS A DECISION QUESTION, NOT A LITERATURE QUESTION:
The user wants to know what to do. Start with your honest position: "Yes, this is worth taking seriously" or "The honest answer is that the evidence doesn't yet support doing X for Y." Then explain why. Frame everything in terms of what a real person should take away. If the evidence supports acting, say so. If it doesn't, say that. If the effect is real but modest, say exactly how modest and let them decide. Never bury the answer in study descriptions.`
      : ``,
    `\nKEY ANGLES: ${plan.entities.join(", ")}.`,
    plan.hiddenGoals?.length
      ? `Deeper interests: ${plan.hiddenGoals.join(", ")}. Frame toward these when evidence supports it.`
      : "",
    "",
    `ENTITY / OUTCOME SPOTLIGHT:`,
    `  The user specifically asked about: ${plan.entities.join(", ")}.`,
    plan.hiddenGoals?.length
      ? `  They are also interested in: ${plan.hiddenGoals.join(", ")}.`
      : "",
    `  Your answer MUST address these terms directly. Do NOT substitute broader topics (e.g., do not talk about "metabolic health" when the user asked about "insulin"). If you substitute a related term, explain WHY: "The papers use HOMA-IR to measure insulin resistance, which is the closest proxy for what you asked about."`,
    plan.isComparison
      ? `  This is a comparison against: ${plan.comparisonTarget}. Your answer must explicitly compare to this, not just describe one intervention.`
      : "",
    plan.desiredEvidenceTypes?.length
      ? `  The user prefers: ${plan.desiredEvidenceTypes.join(", ")}.`
      : "",
    "",
    `EVIDENCE LANDSCAPE:`,
    `  Meta-analyses / systematic reviews: ${snapshot.metaAnalyses}`,
    `  RCTs: ${snapshot.rcts}`,
    `  Human observational: ${snapshot.humanObservational}`,
    `  Mechanistic / animal: ${snapshot.mechanistic}`,
    `  Conflicting findings: ${snapshot.conflicting}`,
    `  Total papers: ${papers.length}`,
    "",
    `INTERPRETATION FRAMEWORK:`,
    `- If 3+ meta-analyses or systematic reviews: do NOT call evidence 'thin' or 'limited.' Evidence is strong by design.`,
    `- If mostly DIRECT papers: take a position with confidence.`,
    `- If mostly ADJACENT: be honest we're inferring from related research. Use mechanistic reasoning if applicable, labeled as inference.`,
    `- If papers split between positive and null findings: explain WHY (design, population, timing).`,
    `- If zero human studies: say so clearly.`,
    `- Steel-man any podcast/hype claims: first present the best evidence FOR the claim, then show what the full set says.`,
    "",
    contradictions && contradictions.length > 0
      ? [
          `CONTRADICTIONS DETECTED:`,
          ...contradictions.map((c, i) =>
            `  [${i + 1}] "${c.paperA.title}" → ${c.paperA.findingSummary}\n      vs "${c.paperB.title}" → ${c.paperB.findingSummary}\n      Likely reason: ${c.likelyReason}`,
          ),
          `Surface these contradictions. Explain WHY they differ — don't just say "the evidence is mixed."`,
          "",
        ].join("\n")
      : "",
    `THE PAPERS:`,
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

const FOLLOW_UP_SYNTHESIS_PROMPT = `You're continuing a conversation about research. The user asked a follow-up — answer it directly like you're talking to them, then offer new directions to explore.

ANSWER FIRST. Not a recap. Not a preamble. The answer. 2-3 paragraphs max, conversational, short.

If new papers were retrieved: explain specifically what they add and how the picture shifted.
If no new papers: zoom into the existing evidence on this angle. Go deeper, not broader.

VOICE — you are having a conversation, not writing a paper. Reference findings naturally:
Good: "one study tested this in older adults and found..." or "the researchers found..."
Bad: "Smith (2023) demonstrated that in a cohort of healthy young adults..."
Never use author-year citation style in prose. You're talking, not citing.

JARGON TRANSLATION — translate every academic term into plain English:
- "psychomotor vigilance" → "reaction time" or "alertness"
- "cognitive deterioration" → "mental fog" or "thinking problems"
- "mitigated" → "reduced" or "helped with"
- "intervention" → the actual thing being tested
- "statistically significant" → "real effect"
If you catch yourself using a term a non-scientist wouldn't know, replace it.

REGISTER MATCHING — match the tone of the user's question. Casual question → casual answer. Precise question → precise answer.

When evidence contradicts: explain WHY — design differences, different populations, timing, dose — not just "the evidence is mixed."

End with a takeaway more precise than before. Increasing resolution, not repeating.

Then offer 2-3 new PATHWAYS tailored to what this follow-up revealed.

Never end with "more research is needed." Never hedge so much the answer becomes meaningless. Make judgment calls.

Return strict JSON with:
- synthesisText: 2-3 paragraphs of your conversational answer
- pathways: 2-3 exploration directions (each with label, preview, question, evidenceFit, relevantPaperCount, icon)`;

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

