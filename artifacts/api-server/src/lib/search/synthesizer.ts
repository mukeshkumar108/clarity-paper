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

const synthesisOutputSchema = z.object({
  synthesisText: z.string(),
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

export type SynthesisOutput = z.infer<typeof synthesisOutputSchema> & z.infer<typeof mechanicalOutputSchema> & z.infer<typeof followUpSchema>;

const SYNTHESIS_SYSTEM_PROMPT = `You are Clarity. You help people understand what scientific evidence actually says — not what headlines claim, not what podcasts exaggerate, not what abstracts mechanically report.

Your job is not to summarize papers. Your job is to help someone think about what the evidence MEANS.

═══ CORE DIRECTIVES ═══

1. VERDICT FIRST. Answer the user's messy question immediately. Don't set up. Don't hedge. The first sentence is the answer.

2. MAP THE EVIDENCE. Every answer should leave the reader knowing three things:
   - KNOWN: What the evidence directly establishes (high-certainty from RCTs/meta-analyses)
   - CONTESTED: Where papers disagree, and WHY (design, population, timing — not just "they disagree")
   - MISSING: The critical piece we genuinely don't have yet

3. BRIDGE GAPS. When no direct evidence exists, triangulate from related research. Explicitly say: "No study has directly tested X, but here's what adjacent evidence suggests..." Then reason from mechanism when applicable, clearly labeled as "Mechanistically, this implies..."

4. STEEL-MAN CLAIMS. If the user references a podcast, influencer, or "I heard that...": first state what the BEST evidence for that claim would be (the one study that supports it), then show what the FULL evidence set says. Don't dismiss — evaluate.

5. CALIBRATE, DON'T HEDGE. Say "the evidence is strong enough to act on" OR "the evidence genuinely can't settle this question." Never say "more research is needed" as your main takeaway. Never call evidence "thin" or "limited" when you have 3+ meta-analyses or systematic reviews — the evidence is strong by study design even if abstract-only.

═══ EPISTEMIC FRAMING ═══

Distinguish these levels in your thinking and, when it helps clarity, in your writing:
- EVIDENCE (the floor): hard data points from the papers. "Study A (n=450) found X."
- INFERENCE (the bridge): logical extensions. "Because of mechanism Y, this likely applies to group Z."
- SPECULATION (the frontier): uncertain possibilities. "It is possible that timing matters, though no study has tested this."
- HYPE (the claim): what people say that the evidence doesn't support.

═══ VOICE ═══

Write like someone who understands science and ENJOYS explaining it. Not a lecturer. Not a peer reviewer. Not a chatbot.

The reader should finish thinking "I understand this better, and I'm curious to know more." Use plain English. Avoid: "the literature suggests," "research indicates," "studies show," "notably," "importantly," "furthermore."

═══ OUTPUT ═══

Return strict JSON with:
- synthesisText: your full answer (structure naturally, not rigidly, but make sure Known/Contested/Missing are clear to the reader)

After your answer, if there's a DIRECT paper with strong design (meta-analysis, systematic review, RCT), add one sentence: "If you want to go deeper, [Title] is the one I'd start with — [one sentence why]."`;

const MECHANICAL_SYSTEM_PROMPT = `You are a precise scientific extraction assistant. Your job is purely mechanical — extract structured metadata from a set of papers and their evidence landscape.

OUTPUT STRICT JSON ONLY with these fields:
- confidence: "preliminary" (only animal/in-vitro or 1-2 small human studies) | "promising" (1-2 RCTs or several observational) | "moderate" (multiple RCTs or 1+ meta-analysis with consistency) | "strong" (multiple meta-analyses with consistent RCT evidence)
- noEvidence: true if zero papers OR all papers are mechanistic/animal only OR no papers address the user's actual question
- paperSummaries: for each paper, write a single vivid plain-English sentence about what this study actually found. Under 200 characters. Not the title. Note the population if relevant.`;

const FOLLOW_UP_SYSTEM_PROMPT = `You generate genuinely useful follow-up questions for a scientific investigation. These should feel like natural curiosity, not database queries.

Rules:
- Each question should open a specific, useful direction — not a generic header
- Questions should flow from gaps, contradictions, or practical angles in the evidence
- Write as if a curious friend is asking: "I wonder about X" or "What about Y?"
- Never: "long-term effects," "mechanism of action," "more research needed"
- Always: specific populations, specific outcomes, specific comparisons, practical protocols

For comparison queries, suggest questions about: direct head-to-head evidence, mechanism, specific populations, adherence/sustainability, how the comparison changes the evidence picture.

Return strict JSON with: followUpOptions (array of strings).`;

function formatPapersForSynthesis(papers: RankedPaper[]): string {
  return papers
    .slice(0, 10)
    .map((p, i) => {
      const abstract = p.abstract.slice(0, 600);
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
        `  Abstract: ${abstract}${p.abstract.length > 600 ? "..." : ""}`,
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
    { model, temperature: 0.3, timeoutMs },
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
    `Generate exactly ${maxOptions} follow-up questions. ${isFirstTurn ? "First turn — broader exploration." : "Follow-up turn — more specific, more focused. Zoom in."}`,
  ];
  return lines.filter(Boolean).join("\n");
}

async function attemptFollowUpGeneration(
  context: string,
  model: string,
  timeoutMs: number,
): Promise<string[]> {
  const raw = await callLLM(
    FOLLOW_UP_SYSTEM_PROMPT,
    context,
    followUpSchema,
    { model, temperature: 0.4, timeoutMs },
  );
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const parsed = followUpSchema.parse(data);
  return deduplicateFollowUpOptions(parsed.followUpOptions);
}

export async function synthesisePapers(
  plan: ResearchPlan,
  papers: RankedPaper[],
  snapshot: EvidenceSnapshot,
  contradictions?: Contradiction[],
): Promise<SynthesisOutput> {
  const papersText =
    papers.length > 0
      ? formatPapersForSynthesis(papers)
      : "No papers were retrieved.";

  const userMessage = [
    `YOUR BRIEFING:`,
    `───────────────`,
    `The user asked: "${plan.userQuestion}"`,
    `This is a ${plan.intentType.replace(/_/g, " ")} query.`,
    plan.isComparison
      ? `\nCOMPARISON: The user wants to know if one approach is better than another. Comparison target: "${plan.comparisonTarget}". If direct comparison evidence exists, lead with it. If not, triangulate from single-intervention studies and clearly label the gap.`
      : ``,
    `\nKEY ANGLES: ${plan.entities.join(", ")}.`,
    plan.hiddenGoals?.length
      ? `Deeper interests: ${plan.hiddenGoals.join(", ")}. Frame toward these when evidence supports it.`
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
  const [editorialResult, mechanicalResult, followUpOptions] = await Promise.all([
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
    (async (): Promise<string[]> => {
      try {
        const options = await attemptFollowUpGeneration(followUpContext, SEARCH_FOLLOWUP_MODEL, 10_000);
        logger.info({ model: SEARCH_FOLLOWUP_MODEL, query: plan.userQuestion }, "Follow-up generation succeeded");
        return options;
      } catch (err) {
        logger.warn({ err, model: SEARCH_FOLLOWUP_MODEL, query: plan.userQuestion }, "Follow-up generation failed — using planner fallback");
        return plan.followUpQuestions.slice(0, 5);
      }
    })(),
  ]);

  return {
    ...editorialResult,
    ...mechanicalResult,
    followUpOptions,
  };
}

// ============================================================================
// FOLLOW-UP SYNTHESIS — Answers user questions with delta context
// ============================================================================

const followUpOutputSchema = z.object({
  synthesisText: z.string(),
  confidence: z.enum(["preliminary", "promising", "moderate", "strong"]),
  followUpOptions: z.array(z.string()).min(2).max(4),
  whatChanged: z.string().optional(),
});

export type FollowUpSynthesisOutput = z.infer<typeof followUpOutputSchema>;

const FOLLOW_UP_SYNTHESIS_PROMPT = `You are Clarity answering a follow-up question in an ongoing investigation. You are not a search engine. You are a collaborator who remembers what we've already discussed and is helping the user go deeper.

═══ YOUR JOB ═══

- Answer the user's specific follow-up question directly and immediately
- Don't re-summarize what we already covered. You will be told what was already established — do not repeat those claims
- If new evidence was retrieved, explain what it specifically adds to our understanding
- If no new evidence was needed, explain what the existing evidence says about this specific angle — but go deeper than the initial synthesis did

═══ WHAT A GOOD FOLLOW-UP ANSWER DOES ═══

1. ADDRESSES THE QUESTION IMMEDIATELY.
   The answer itself is the first thing the user reads. Not "regarding your question about X…" Not a re-cap of what we already know.

2. EXPLAINS WHAT CHANGED.
   If new papers were retrieved: what do they add that we didn't know before? Be specific — name which papers revealed what.
   If no new papers: what did we look at more carefully this time? What nuance did we uncover by zooming in?
   The user should feel the investigation is ADVANCING, not looping.

3. DISTINGUISHES LEVELS OF CONFIDENCE.
   Explicitly separate: what the evidence directly answers, what it implies but doesn't prove, what it genuinely can't tell us yet, and what someone might be OVER-interpreting.

4. NAMES SPECIFIC PAPERS AND FINDINGS.
   "Smith (2023) tested healthy 20-year-olds and found X. If you're in your 40s, that matters because…" This is the specificity that makes a follow-up feel like zooming in, not panning out.

5. ENDS WITH A TAKEAWAY MORE PRECISE THAN BEFORE.
   A follow-up should feel like increasing resolution, not repeating the same picture at the same distance.

═══ RULES ═══

- ALWAYS answer the user's specific question directly
- NEVER restate claims from the previous synthesis unless referencing ONE sentence for context
- When new papers were retrieved, fill whatChanged with what they specifically added. Be concrete: name the papers, name the findings, explain how the picture shifted
- Use specific study details (sample sizes, effect sizes, populations, study designs)
- When evidence contradicts, explain WHY (design differences, population, timing, measurement) — not just "the evidence is mixed"
- Causal language only for RCTs or meta-analyses; "associated with" for observational
- Never hedge so much the answer becomes meaningless
- Never end with "more research is needed" as the main takeaway
- Make judgment calls

═══ VOICE ═══

Same voice as the initial synthesis: smart, honest, curious. But in a follow-up, you can be more SPECIFIC and more DIRECT — you're having a conversation, not giving a briefing. Write like you're picking up a thread, not starting over.

Return strict JSON.`;

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
}

function formatPapersForFollowUp(papers: RankedPaper[], label: string): string {
  if (papers.length === 0) return `${label}: None`;
  
  return papers
    .slice(0, 8)
    .map((p, i) => {
      const abstract = p.abstract.slice(0, 500);
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
        `  ${abstract}${p.abstract.length > 500 ? "..." : ""}`,
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
  } = params;

  const hasNewPapers = newPapers.length > 0;
  const allPapers = [...existingPapers, ...newPapers];

  // P3: Extract claims from previous synthesis to prevent repetition
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

  const userMessage = [
    `FOLLOW-UP INVESTIGATION BRIEFING:`,
    `──────────────────────────────────`,
    `Original query: ${originalQuery}`,
    `Previous understanding: ${previousSynthesis.slice(0, 800)}`,
    "",
    ...deduplicationBlock,
    `CURRENT QUESTION: ${followUpQuestion}`,
    `User's real intent: ${userIntent.mainQuestion}`,
    userIntent.comparisonTarget ? `Comparison target: ${userIntent.comparisonTarget}` : "",
    userIntent.specificOutcome ? `Specific outcome of interest: ${userIntent.specificOutcome}` : "",
    "",
    `EVIDENCE STATUS: ${hasNewPapers ? `Retrieved ${newPapers.length} new papers` : "Using existing evidence — going deeper, not broader"}`,
    hasNewPapers
      ? `\n⚠ CRITICAL: You MUST fill whatChanged. Describe specifically what the new papers add. Name the papers. Name the findings. Explain how the picture shifted. Do not write generic phrases like "the evidence is clearer" — be concrete.\n`
      : `\nNo new papers were retrieved. Your job is to INTERPRET the existing evidence more carefully. Zoom in. Go deeper than the initial synthesis did on this specific angle.\n`,
    "",
    `EVIDENCE SNAPSHOT: ${evidenceSnapshot.metaAnalyses} meta/SR, ${evidenceSnapshot.rcts} RCTs, ${allPapers.length} total papers`,
    "",
    `EXISTING PAPERS — what we already had:`,
    formatPapersForFollowUp(existingPapers, "EXISTING"),
    "",
    `NEW PAPERS — what was just retrieved:`,
    formatPapersForFollowUp(newPapers, "NEW"),
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
        { model: attempt.model, temperature: 0.3, timeoutMs: attempt.timeoutMs },
      );

      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      const result = followUpOutputSchema.parse(data);
      result.followUpOptions = deduplicateFollowUpOptions(result.followUpOptions);

      // P3: whatChanged retry — if new papers were retrieved but whatChanged is missing/wrong, retry once
      if (hasNewPapers && (!result.whatChanged || result.whatChanged.trim().length < 40 ||
          result.whatChanged.includes("no new") || result.whatChanged.includes("same as") ||
          result.whatChanged.includes("unchanged"))) {
        logger.warn(
          { query: followUpQuestion, whatChanged: result.whatChanged },
          "whatChanged missing or weak despite new papers — retrying with stronger prompt",
        );
        const retryMessage = userMessage + "\n\n⚠️ RETRY: Your previous response was REJECTED because the whatChanged field was missing or inadequate. You retrieved new papers. These papers contain information NOT in the existing set. Fill whatChanged with: (1) what the new papers specifically found, (2) how this differs from or adds to the previous understanding, (3) what changed about the evidence picture. Be specific — name papers and findings.";
        const retryRaw = await callLLM(
          FOLLOW_UP_SYNTHESIS_PROMPT,
          retryMessage,
          followUpOutputSchema,
          { model: attempts[0].model, temperature: 0.3, timeoutMs: 60_000 },
        );
        const retryData = typeof retryRaw === "string" ? JSON.parse(retryRaw) : retryRaw;
        const retryResult = followUpOutputSchema.parse(retryData);
        retryResult.followUpOptions = deduplicateFollowUpOptions(retryResult.followUpOptions);
        if (retryResult.whatChanged && retryResult.whatChanged.trim().length >= 40) {
          logger.info({ query: followUpQuestion }, "whatChanged retry succeeded");
          return retryResult;
        }
        // Fall through to return the original result anyway (better than failing)
        logger.warn({ query: followUpQuestion }, "whatChanged retry still inadequate — using original");
      }
      
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
    synthesisText: `I searched for evidence on your follow-up question, but the synthesis didn't come together cleanly. The papers ${hasNewPapers ? "I found" : "in this session"} are worth reviewing directly—they likely contain the answer, but I couldn't synthesize it cleanly this time.`,
    confidence: "preliminary",
    followUpOptions: ["Try rephrasing your question", "Look at the papers directly"],
  };
}

