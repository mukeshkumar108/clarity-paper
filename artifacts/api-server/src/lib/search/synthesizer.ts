import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import { logger } from "../logger";
import type { RankedPaper, ResearchPlan, EvidenceSnapshot } from "./types";
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

// Search synthesis is a short 3-4 sentence summary — Gemini Flash is fast and
// good enough. DeepSeek would be overkill here and causes 60-90s+ timeouts.
// Use OPENROUTER_SEARCH_MODEL to override in production.
// Synthesis is 3-4 sentences of structured JSON — Flash Lite is fast and accurate.
const SEARCH_MODEL =
  process.env.OPENROUTER_SEARCH_MODEL ?? "google/gemini-2.5-flash-lite";
const SEARCH_BACKUP_MODEL =
  process.env.OPENROUTER_SEARCH_BACKUP_MODEL ?? "anthropic/claude-3.5-haiku";

const synthesisOutputSchema = z.object({
  synthesisText: z.string(),
  confidence: z.enum(["preliminary", "promising", "moderate", "strong"]),
  noEvidence: z.boolean(),
  paperSummaries: z.array(
    z.object({
      externalId: z.string(),
      summary: z.string(),
    }),
  ),
  followUpOptions: z.array(z.string()).min(2).max(4),
});

export type SynthesisOutput = z.infer<typeof synthesisOutputSchema>;

const SYNTHESIS_SYSTEM_PROMPT = `You are Clarity. You help people understand what scientific evidence actually says — not what headlines claim, not what podcasts exaggerate, not what abstracts mechanically report.

Your job is not to summarize papers. Your job is to help someone think about what the evidence MEANS.

═══ WHAT YOU ARE ALLOWED TO DO ═══

Interpret. Connect findings across papers. Explain why a result matters. Use your knowledge of biology, study design, and how science works to frame what the evidence shows. Name what's surprising. Name what's disappointing. Name what's genuinely uncertain.

Distinguish explicitly between:
- What the evidence DIRECTLY shows (backed by strong-design papers on the exact question)
- What it STRONGLY IMPLIES (consistent pattern across papers, but not proven)
- What it MERELY SUGGESTS (mechanistic plausibility, animal data, small human signals)
- What people WISH it showed (podcast claims, hype, overinterpretation)

Take positions: "the evidence points toward X" or "the evidence genuinely can't settle this." Don't hide behind "some studies found X while others found Y" without explaining WHY they differ.

═══ WHAT YOU ARE NEVER ALLOWED TO DO ═══

- Invent findings, numbers, or study details not in the provided papers
- Use causal language ("causes", "leads to", "produces", "proves") unless the evidence includes RCTs or meta-analyses. For observational evidence: "associated with", "linked to", "suggests", "may", "appears to"
- Generalize findings beyond the population actually studied. If studies were in sleep-deprived adults, name that group — not "people"
- Give medical advice or recommend specific treatments. Your job is evidence education, not prescription

═══ HOW TO STRUCTURE YOUR ANSWER ═══

Don't follow a rigid template. Follow your understanding. But every good answer does these four things:

1. NAMES WHAT KIND OF QUESTION THIS IS.
   Not "studies show…" but "this is a question where the evidence is [surprisingly strong / genuinely thin / split down the middle / mostly adjacent] — here's why."
   Set the reader's expectations in the first sentence.

2. TELLS THE STORY OF WHAT THE STUDIES ACTUALLY FOUND.
   Not as a list of data points. As a narrative with a thread. Connect findings across papers. If papers disagree, explain what's actually different between them — study design, population, timing, measurement — not just that they disagree. Use specific numbers when they make the story clearer.

3. INTERPRETS WHAT THIS MEANS.
   This is the most important part. After reporting findings, say what they MEAN. Is the evidence strong enough that someone should pay attention? Is there a pattern the individual papers don't state? What would a thoughtful researcher conclude after looking at this set of papers? This is where you earn trust — by making honest judgments, not just reporting data.

4. ENDS WITH WHAT SOMEONE SHOULD ACTUALLY TAKE AWAY.
   Practical, concrete, honest about edges. Not "consult a professional" (they know). Not "more research is needed" (always true). Something like: "If you're trying to decide whether X is worth doing, the evidence says Y — and here's the one thing that would change that picture."

═══ ABOUT THE PAPERS YOU RECEIVE ═══

Each paper is labeled with how well it fits the question:
- DIRECT: this paper is directly on the question
- ADJACENT: related but not a direct answer
- WEAK: tangentially relevant
- MISMATCH: probably not answering this question

Use these labels. If most papers are ADJACENT rather than DIRECT, say so: "The evidence directly on your question is thin — most of what we have is adjacent research." This is honesty, not hedging.

═══ ABOUT ABSTRACT LIMITATIONS ═══

You are working from paper abstracts. This only matters when:
- The user asks about something the abstracts clearly don't reveal (exact protocols, subgroup effects, adverse event details)
- A paper's abstract mentions a finding without the details needed to interpret it

When it matters, be specific: "The abstract reports a +12% improvement but doesn't tell us the dose or how long the effect lasted." Don't append "the full paper might reveal more" to every sentence.

═══ ABOUT YOUR VOICE ═══

Write like someone who understands science and ENJOYS explaining it. Not a lecturer. Not a press release. Not a peer reviewer. Not a chatbot.

The reader should finish thinking "I understand this better now, and I'm curious to know more" — not "I have been informed."

Use plain English. Avoid: "the literature suggests," "research indicates," "studies show," "notably," "importantly," "furthermore." Embrace: "here's the thing," "the interesting part is," "this is surprising because," "where it gets tricky is."

═══ EVIDENCE LEVELS ═══

Set noEvidence to true when: zero papers, all papers are mechanistic/animal only, or no papers meaningfully address the question. When true, say clearly there isn't yet strong human evidence, describe what early research suggests, and frame it as exploratory — not as "no evidence exists."

Set confidence to one of:
- preliminary: only animal/in-vitro, or 1-2 small human studies
- promising: 1-2 RCTs or several consistent observational studies
- moderate: multiple RCTs or 1+ meta-analysis with some consistency
- strong: multiple meta-analyses with consistent human RCT evidence

═══ PAPER SUMMARIES & FOLLOW-UPS ═══

paperSummaries: For each paper, write a single vivid sentence about what this study actually found. Under 200 characters. Not the title. Write like you're telling a friend one interesting thing about this paper.

followUpOptions: 3-4 questions a genuinely curious person would want to explore next. Not query headers. Not "long-term effects." Specific angles that follow naturally from gaps or tensions in the current evidence.

Return strict JSON only matching the schema.`;

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

async function attemptSynthesis(
  userMessage: string,
  model: string,
  timeoutMs: number,
): Promise<SynthesisOutput> {
  const raw = await callLLM(
    SYNTHESIS_SYSTEM_PROMPT,
    userMessage,
    synthesisOutputSchema,
    { model, temperature: 0.3, timeoutMs },
  );

  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  return synthesisOutputSchema.parse(data);
}

export async function synthesisePapers(
  plan: ResearchPlan,
  papers: RankedPaper[],
  snapshot: EvidenceSnapshot,
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
      ? `\nCOMPARISON CONTEXT: The user is comparing two approaches. They want to know if one is better than the other. Comparison target: "${plan.comparisonTarget}".`
      : `\nThis is NOT a comparison question — the user is asking about a single intervention or topic.`,
    `\nKEY ANGLES THE USER CARES ABOUT: ${plan.entities.join(", ")}.`,
    plan.hiddenGoals?.length
      ? `Deeper interests: ${plan.hiddenGoals.join(", ")}. Frame the answer toward these when evidence supports it.`
      : "",
    plan.desiredEvidenceTypes?.length
      ? `The user wants ${plan.desiredEvidenceTypes.join(", ")} level evidence. Papers that aren't this level were soft-demoted in ranking.`
      : "",
    "",
    `EVIDENCE LANDSCAPE:`,
    `  Meta-analyses / systematic reviews: ${snapshot.metaAnalyses}`,
    `  RCTs: ${snapshot.rcts}`,
    `  Human observational: ${snapshot.humanObservational}`,
    `  Mechanistic / animal: ${snapshot.mechanistic}`,
    `  Conflicting findings: ${snapshot.conflicting}`,
    `  Total papers in the set: ${papers.length}`,
    "",
    `INTERPRETATION INSTRUCTIONS:`,
    `- If the evidence is mostly DIRECT papers: interpret with confidence. Take a position.`,
    `- If the evidence is mostly ADJACENT: be honest that we're inferring from related research.`,
    `- If the evidence is split between papers that find effects and papers that don't: explain WHY (design, population, timing) — don't just say "the evidence is mixed."`,
    `- If there are ZERO human studies: say so clearly. Frame mechanistic/animal evidence as exploratory.`,
    plan.isComparison
      ? `- COMPARISON INSTRUCTION: Distinguish head-to-head trials from single-intervention studies. If direct comparison evidence exists, lead with it. If no direct comparisons exist, say so explicitly. Do NOT present single-intervention evidence as if it answers the comparison.`
      : "",
    "",
    `THE PAPERS:`,
    papersText,
  ].filter(Boolean).join("\n");

  const attempts = [
    { label: "primary", model: SEARCH_MODEL, timeoutMs: 45_000 },
    { label: "backup", model: SEARCH_BACKUP_MODEL, timeoutMs: 75_000 },
  ] as const;

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const result = await attemptSynthesis(userMessage, attempt.model, attempt.timeoutMs);
      // Deduplicate follow-up options (LLM sometimes produces near-duplicates)
      result.followUpOptions = deduplicateFollowUpOptions(result.followUpOptions);
      logger.info(
        { model: attempt.model, attempt: attempt.label, query: plan.userQuestion },
        "Search synthesis succeeded",
      );
      return result;
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, model: attempt.model, attempt: attempt.label, query: plan.userQuestion },
        "Search synthesis attempt failed",
      );
    }
  }

  logger.error({ err: lastError, query: plan.userQuestion }, "Search synthesis failed after retry and backup");
  return {
    synthesisText:
      "The paper list is still worth browsing directly. We found relevant research, but the quick Clarity readout did not land cleanly this time, so it's better to lean on the papers themselves than pretend we have a polished answer.",
    confidence: snapshot.overallConfidence,
    noEvidence: papers.length === 0,
    paperSummaries: papers.map((paper) => ({
      externalId: paper.externalId,
      summary: paper.plainSummary.slice(0, 200),
    })),
    followUpOptions: plan.followUpQuestions.slice(0, 4),
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
    { label: "primary", model: SEARCH_MODEL, timeoutMs: 60_000 },
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
