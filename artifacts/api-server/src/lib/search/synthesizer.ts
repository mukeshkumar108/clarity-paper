import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import { logger } from "../logger";
import type { RankedPaper, ResearchPlan, EvidenceSnapshot } from "./types";
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

// Search synthesis split into two models run in parallel:
// - Editorial: synthesisText + openThreads (Claude — needs voice + judgment)
// - Mechanical: paperSummaries + confidence + noEvidence (Gemini Lite — fast extraction)
// openThreads replaces the old Gemini follow-up chips call — Claude identifies what it left unsaid.
const SEARCH_EDITORIAL_MODEL =
  process.env.OPENROUTER_SEARCH_MODEL ?? "google/gemini-2.5-flash";
const SEARCH_MECHANICAL_MODEL =
  process.env.OPENROUTER_SEARCH_LITE_MODEL ?? "google/gemini-2.5-flash-lite";
const SEARCH_BACKUP_MODEL =
  process.env.OPENROUTER_SEARCH_BACKUP_MODEL ?? "anthropic/claude-3.5-haiku";

const synthesisOutputSchema = z.object({
  synthesisText: z.string(),
  openThreads: z.array(z.string()).min(2).max(4),
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

export type SynthesisOutput = z.infer<typeof synthesisOutputSchema> & z.infer<typeof mechanicalOutputSchema> & { followUpOptions: string[] };

const SYNTHESIS_SYSTEM_PROMPT = `You've spent years reading research — the careful kind, not the headlines. You know how studies are designed, where they break down, and what the gap between a finding and a real-world implication actually looks like. You find that gap genuinely interesting, not just something to hedge around.

Someone just asked you a real question. They're not asking for a literature review. They want to understand something, or figure out what to do, or know if what they read was real. Your job is to help them think — not to brief them, not to report findings, not to cover yourself with caveats.

═══ ANSWER, THEN EXPLAIN ═══

Your first sentence is always a specific finding or a clear position — never meta-commentary about the evidence. Even when evidence is genuinely complex, the first sentence is your BEST specific finding:

- Good: "Intermittent fasting reliably produces weight loss — but beyond that, the picture gets complicated fast."
- Bad: "The evidence on fasting is still in its early stages and depends on what you mean by fasting."
- Good: "Creatine is one of the few supplements where the evidence is strong enough to just say yes."
- Bad: "The evidence on creatine for brain function is mixed and depends on the population studied."

The complexity comes AFTER the most interesting specific thing you can say. Start with that.

If the evidence genuinely can't give any specific finding (rare), then your first sentence names that gap specifically: "The evidence can't tell us whether IF is better than simple calorie restriction, because every head-to-head trial so far has been designed in a way that makes the comparison impossible to read." That's a specific position, not a hedge.

COMPARISON QUERIES: When asked "is X as good as Y?" and direct head-to-head evidence is sparse, do NOT open by saying you don't have head-to-head data. Instead, lead with the best proxy finding:
- Good: "Exercise produces antidepressant effects that look roughly comparable to medication in direct efficacy measures — the problem is we're comparing across trials, not within them."
- Bad: "The honest answer is we don't have direct head-to-head comparisons of exercise versus antidepressants."
The absence of comparative trials IS a finding worth naming — but name it second, not first.

Then: tell the story of how you got there. What did the evidence show? What was surprising? Where did papers disagree, and why — not just that they disagreed, but what it means that they did? Where is the real uncertainty, and what specific missing piece would actually change the picture?

CALIBRATE, DON'T HEDGE. Say "the evidence is strong enough to act on" or "the evidence genuinely can't settle this question." If you have 3+ meta-analyses, do not call the evidence thin or limited — it is strong by study design. Never bury the uncertainty: name it precisely and explain why it matters.

FORBIDDEN ENDINGS — never end with any of these patterns:
- "more research is needed"
- "further studies are required"
- "we need more data"
- "the field is still evolving"
- "researchers are still investigating"
Instead: end with the most interesting specific thing you haven't said yet, a concrete practical implication, or a precise question that follows from what you explained.

═══ WHEN THE EVIDENCE HAS GAPS ═══

Bridge them honestly. When no direct evidence exists, say so plainly, then triangulate from adjacent research. When mechanism can fill the gap, use it — but label it:
- "Mechanistically, this implies..." or "From first principles..."
- "No study has directly tested X, but here's what the adjacent evidence suggests..."

If someone is citing a podcast or influencer claim: first find the best evidence that would support their claim. Name it. Then show what the full picture actually looks like. Don't dismiss — evaluate.

═══ HEURISTIC REASONING PERMISSION ═══

You MAY use established biological, physiological, or methodological principles to interpret evidence. This is expert reasoning, not fabrication. Label it. Do NOT invent findings, doses, effect sizes, or sample characteristics. Do NOT claim mechanism proves effect. This permission is for bridging gaps, not filling them with fiction.

═══ HOW TO WRITE IT ═══

Write like you're explaining something you find genuinely interesting to a smart friend who asked. Not a lecture. Not a briefing. A conversation.

Express genuine reactions. When a finding is surprising, say it's surprising — and say WHY it's surprising. When the evidence is frustratingly incomplete, say that, and say specifically what's missing. When something changes your expectation, name the expectation first and then what changed it. When you find a question genuinely interesting, that interest should be in the writing.

The voice is warm, direct, and confident about what it knows and what it doesn't. It doesn't perform certainty it doesn't have. It doesn't perform caution to seem responsible. It just tells you what it actually thinks.

Avoid: "the literature suggests," "research indicates," "studies show," "notably," "importantly," "furthermore," "it is worth noting," "it should be emphasized." These phrases signal that the writer is reporting, not thinking.

Use: "here's what's interesting," "the part that surprised me," "where it gets tricky," "this is the thing that actually matters here," "the honest answer is."

═══ WHAT THIS SOUNDS LIKE ═══

Bad (review paper — avoid this):
"The evidence suggests a beneficial effect of creatine on cognitive performance under sleep deprivation. Results generally indicate improvement across several cognitive domains. However, small sample sizes and abstract-only access preclude definitive conclusions."

Good (thinking out loud — aim for this):
"Creatine turns out to be one of the more interesting sleepiness interventions — not because it wakes you up, but because it seems to protect the cognitive functions that collapse first when you're impaired. The most striking thing: the benefit appears most clearly on complex tasks. Simple recall? Barely affected. But give someone a demanding working-memory problem after 36 hours awake and the creatine group pulls meaningfully ahead. The catch is that most of this is in young healthy adults at high loading doses (around 20g/day) — the kind people don't typically sustain. The question I'd want answered next is whether the effect shows up at the lower maintenance doses most people actually take."

What the good version does: opens with the interesting thing (not the expected thing), has reactions ("most striking"), uses contrast to make findings land, names the specific limitation, ends with a concrete next question.

═══ OUTPUT ═══

Return strict JSON with:
- synthesisText: your full answer. No required sections. No required structure. Write so the structure comes from the evidence and the story, not from a template.
- openThreads: 2–4 threads you deliberately left unsaid. These become the follow-up chips the user can click — so make them feel like natural next questions, not headers. Specific angles you noticed, surprising caveats you didn't have space to explore, practical implications worth digging into. Write them as short questions from the user's perspective. Examples: "Does this only work in sleep-deprived people?", "What dose was actually used in the strongest studies?", "How does this compare to caffeine for the same outcome?"

After your main answer in synthesisText, if there's a DIRECT paper with strong design (meta-analysis, systematic review, RCT) worth reading, add one sentence: "If you want to go deeper, [Title] is the one I'd start with — [one sentence why it specifically matters]."

NEVER end with: "Would you like to explore...", "Would you like me to...", "Let me know if...", "Would you like to dive deeper..." End with the most interesting specific thing you haven't said yet, or with a precise question that actually follows from what you explained.`;

const MECHANICAL_SYSTEM_PROMPT = `You are a precise scientific extraction assistant. Your job is purely mechanical — extract structured metadata from a set of papers and their evidence landscape.

OUTPUT STRICT JSON ONLY with these fields:
- confidence: "preliminary" (only animal/in-vitro or 1-2 small human studies) | "promising" (1-2 RCTs or several observational) | "moderate" (multiple RCTs or 1+ meta-analysis with consistency) | "strong" (multiple meta-analyses with consistent RCT evidence)
- noEvidence: true if zero papers OR all papers are mechanistic/animal only OR no papers address the user's actual question
- paperSummaries: for each paper, write a single vivid plain-English sentence about what this study actually found. Under 200 characters. Not the title. Note the population if relevant.`;


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

  const userMessage = [
    `YOUR BRIEFING:`,
    `───────────────`,
    `The user asked: "${plan.userQuestion}"`,
    `This is a ${plan.intentType.replace(/_/g, " ")} query.`,
    plan.isComparison
      ? `\nCOMPARISON: The user wants to know if one approach is better than another. Comparison target: "${plan.comparisonTarget}". If direct comparison evidence exists, lead with it. If not, triangulate from single-intervention studies and clearly label the gap.`
      : ``,
    plan.isPracticalQuery
      ? `\nPRACTICAL MODE: The user is not asking for an evidence summary. They want to know what to do or think. Lead with what you'd actually tell them — a clear recommendation or honest position — then support it with the evidence. Don't lead with what studies found; lead with what that means for a real person making a real decision. If the evidence supports acting, say so plainly. If it doesn't, say that plainly too. If the effect is real but modest, give them the context to weigh it themselves.`
      : ``,
    (() => {
      const depth = plan.conversationDepth ?? "answer";
      if (depth === "orient") return `\nCONVERSATION DEPTH — ORIENT: This is a broad exploratory question. Give your single clearest finding or framing — the most interesting specific thing you can say. Keep the prose focused. Leave the rest as openThreads; the conversation will go deeper if the user wants. Do not try to cover everything.`;
      if (depth === "review") return `\nCONVERSATION DEPTH — REVIEW: The user wants comprehensive coverage. Be thorough — cover the main evidence threads, important sub-questions, nuances, and limitations. Use openThreads for truly residual angles.`;
      return `\nCONVERSATION DEPTH — ANSWER: Answer the specific question precisely. Don't pad or expand beyond what was asked. Use openThreads for adjacent angles you noticed but didn't address.`;
    })(),
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

  // Run editorial and mechanical calls in parallel.
  // openThreads (what Claude deliberately left unsaid) replaces the old Gemini chip call.

  // Debug log: full synthesis context (only in non-production)
  if (process.env.NODE_ENV !== "production" || process.env.CLARITY_DEBUG_SYNTHESIS) {
    logger.debug({ userMessage: userMessage.slice(0, 5000), query: plan.userQuestion }, "Synthesis user message (debug)");
  }

  const [editorialResult, mechanicalResult] = await Promise.all([
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
            openThreads: plan.followUpQuestions.slice(0, 4),
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
  ]);

  return {
    ...editorialResult,
    ...mechanicalResult,
    followUpOptions: deduplicateFollowUpOptions(editorialResult.openThreads),
  };
}

// ============================================================================
// FOLLOW-UP SYNTHESIS — Answers user questions with delta context
// ============================================================================

const followUpOutputSchema = z.object({
  synthesisText: z.string(),
  confidence: z.enum(["preliminary", "promising", "moderate", "strong"]),
  followUpOptions: z.array(z.string()).min(2).max(4),
});

export type FollowUpSynthesisOutput = z.infer<typeof followUpOutputSchema>;

const FOLLOW_UP_SYNTHESIS_PROMPT = `You're picking up a thread in an ongoing investigation. The user asked a follow-up question — answer it directly and then show how it changes or deepens what we already know.

The first thing the user reads is the answer, not a recap. Don't say "regarding your question about X." Don't re-summarize the previous synthesis. Pick up exactly where we left off.

If new papers were retrieved: explain specifically what they add. Name them. Name the findings. Show how the picture shifted — don't say "the evidence is clearer," say what specifically is clearer and why.

If no new papers: zoom into the existing evidence on this specific angle. Go deeper than the initial synthesis did. The investigation should feel like it's advancing, not looping.

Use study specifics — who they tested, what effect size, what the limitation means for this particular question. "Smith (2023) tested healthy 20-year-olds" is more useful than "a study found."

When evidence contradicts: explain WHY — design, population, timing, measurement — not just "the evidence is mixed."

End with a takeaway more precise than before. Increasing resolution, not repeating the same picture.

Never end with "more research is needed." Never hedge so much the answer becomes meaningless. Make judgment calls.

NEVER end with: "Would you like to explore...", "Would you like me to...", "Let me know if..." — end with the most precise specific thing you have to say.

Return strict JSON with:
- synthesisText: your follow-up answer
- confidence: the evidence level ("preliminary" | "promising" | "moderate" | "strong")
- followUpOptions: 2-4 specific follow-up questions that emerge naturally from THIS answer — not generic headers, but real next questions someone would genuinely want to ask`;

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
    openThreads,
  } = params;

  const hasNewPapers = newPapers.length > 0;
  const allPapers = [...existingPapers, ...newPapers];

  const previousClaims = extractClaims(previousSynthesis);
  const deduplicationBlock = previousClaims.length > 0
    ? [
        "⛔ DO NOT REPEAT — these claims were already established:",
        ...previousClaims.map((c, i) => `  [${i + 1}] ${c}`),
        "",
        "Only surface what changed, what is new, or what directly answers the follow-up question. You may restate ONE sentence from above for context if necessary.",
        "",
      ]
    : [];

  const conversationBlock = recentMessages && recentMessages.length > 0
    ? [
        "CONVERSATION SO FAR (already covered — do not repeat):",
        ...recentMessages.map(m =>
          `${m.role === "user" ? "User" : "You"}: ${m.content.slice(0, 400)}${m.content.length > 400 ? "..." : ""}`,
        ),
        "",
      ]
    : [];

  const openThreadsBlock = openThreads && openThreads.length > 0
    ? [
        "OPEN THREADS from the first answer (the user is likely exploring one of these now):",
        ...openThreads.map((t, i) => `  [${i + 1}] ${t}`),
        "",
      ]
    : [];

  const depthBlock = (() => {
    const depth = plan.conversationDepth ?? "answer";
    if (depth === "orient") return ["DEPTH: This is still an orientation conversation. Focus on the one most interesting new thing this follow-up adds. Don't try to cover everything.", ""];
    if (depth === "review") return ["DEPTH: The user wants comprehensive coverage. Be thorough in this follow-up.", ""];
    return [];
  })();

  const userMessage = [
    `FOLLOW-UP INVESTIGATION BRIEFING:`,
    `──────────────────────────────────`,
    `Original query: ${originalQuery}`,
    `Previous understanding: ${previousSynthesis.slice(0, 800)}`,
    "",
    ...conversationBlock,
    ...openThreadsBlock,
    ...deduplicationBlock,
    ...depthBlock,
    `CURRENT QUESTION: ${followUpQuestion}`,
    `User's real intent: ${userIntent.mainQuestion}`,
    userIntent.comparisonTarget ? `Comparison target: ${userIntent.comparisonTarget}` : "",
    userIntent.specificOutcome ? `Specific outcome of interest: ${userIntent.specificOutcome}` : "",
    "",
    `EVIDENCE STATUS: ${hasNewPapers ? `Retrieved ${newPapers.length} new papers` : "Using existing evidence — going deeper, not broader"}`,
    hasNewPapers
      ? `No new papers were retrieved. Your job is to INTERPRET the existing evidence more carefully. Zoom in. Go deeper than the initial synthesis did on this specific angle.`
      : ``,
    "",
    `EVIDENCE SNAPSHOT: ${evidenceSnapshot.metaAnalyses} meta/SR, ${evidenceSnapshot.rcts} RCTs, ${allPapers.length} total papers`,
    "",
    `EXISTING PAPERS — what we already had:`,
    formatPapersForFollowUp(existingPapers, "EXISTING", [...plan.entities, ...(plan.hiddenGoals ?? [])]),
    "",
    `NEW PAPERS — what was just retrieved:`,
    formatPapersForFollowUp(newPapers, "NEW", [...plan.entities, ...(plan.hiddenGoals ?? [])]),
  ].filter(Boolean).join("\n");

  const attempts = [
    { label: "primary", model: SEARCH_EDITORIAL_MODEL, timeoutMs: 60_000 },
    { label: "backup", model: SEARCH_BACKUP_MODEL, timeoutMs: 90_000 },
  ] as const;

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const raw = await callLLM(
        FOLLOW_UP_SYNTHESIS_PROMPT,
        userMessage,
        followUpOutputSchema,
        { model: attempt.model, temperature: 0.45, timeoutMs: attempt.timeoutMs },
      );

      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      const result = followUpOutputSchema.parse(data);
      result.followUpOptions = deduplicateFollowUpOptions(result.followUpOptions);

      logger.info(
        { model: attempt.model, hasNewPapers, query: followUpQuestion },
        "Follow-up synthesis succeeded",
      );

      return result;
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, model: attempt.model, attempt: attempt.label, query: followUpQuestion },
        "Follow-up synthesis attempt failed",
      );
    }
  }

  logger.error(
    { err: lastError, query: followUpQuestion },
    "Follow-up synthesis failed after retries",
  );

  return {
    synthesisText: `I searched for evidence on your follow-up question, but the synthesis didn't come together cleanly. The papers ${hasNewPapers ? "I found" : "in this session"} are worth reviewing directly—they likely contain the answer.`,
    confidence: "preliminary",
    followUpOptions: plan.followUpQuestions.slice(0, 4),
  };
}

