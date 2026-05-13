import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import { logger } from "../logger";
import type { RankedPaper, ResearchPlan, EvidenceSnapshot } from "./types";
import { extractClaims } from "./evidenceSpans";

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

const SYNTHESIS_SYSTEM_PROMPT = `You are Clarity. You have paper abstracts. Give the user a SHORT ANSWER first, then the nuance, then practical takeaways.

REQUIRED STRUCTURE - FOLLOW EXACTLY:

**Short answer:** [1-2 sentences with clear yes/no/mixed verdict]
**The evidence:** [2-3 sentences on what studies actually found, with specifics]
**So practically:** [1-2 sentences on what this means for the user]

EXAMPLE OF PERFECT OUTPUT:

"Short answer: Yes, creatine probably helps physical performance during acute sleep deprivation—but podcasts often exaggerate how much it helps mentally.

The evidence: Across 8 studies, the clearest benefit is maintaining physical power output and reducing fatigue during sleep restriction. Two RCTs found creatine preserved deep sleep quality, but cognitive effects are much less consistent—one study found +12% working memory improvement, another found no effect at all.

So practically: Gym session after poor sleep? Likely helpful. Exam or complex decision-making? Don't expect miracles. The podcasts are highlighting the one strong positive study while glossing over the mixed cognitive results."

BAD OUTPUT (NEVER DO THIS):
❌ "Studies are mixed. Would you like me to explore mechanism?"
❌ "Research suggests creatine may have potential benefits..."
❌ "One study looked at... Another study found..."
❌ "More research is needed to fully understand..."

RULES:
- START with the actual answer, not setup or hedging
- Use SPECIFIC numbers and details from papers (not vague "some studies")
- When evidence contradicts, EXPLAIN the contradiction directly
- Address POPULAR CLAIMS (podcasts, headlines) if relevant—say what's overhyped
- Make JUDGMENT CALLS: "This is overhyped" / "This is actually solid" / "Here's the catch"
- NEVER use academic filler: "the literature suggests" / "research indicates" / "studies show"
- NEVER end with "would you like me to explore..."—the options come after the answer

FOLLOW-UP OPTIONS (followUpOptions):
These should be GENUINELY USEFUL next steps based on gaps in current evidence:
- Specific angles not covered (dosing details, timing, populations)
- Why contradictions exist (study design differences)
- Comparisons to alternatives
- Practical protocols

Never generic: "long-term effects" / "mechanism of action"
Always specific: "high-dose protocols podcasts reference" / "how caffeine compares"

CAUSAL LANGUAGE CONSTRAINT — hard rule:
Only use causal language ("causes", "leads to", "produces", "proves") when the evidence includes RCTs or meta-analyses. For observational-only evidence, use "associated with", "linked to", "suggests", "may", "appears to".

GENERALIZATION CONSTRAINT — hard rule:
Do not extrapolate findings beyond the population studied. If studies were only in one group (e.g., sleep-deprived adults, elderly patients), name that group — do not generalize to everyone.

ABSTRACTION CONSTRAINT — hard rule:
You are working from paper abstracts, not full texts. This means nuance, subgroup analyses, and methodological detail may be missing. When a more careful answer would require the full paper, acknowledge that: "Based on available abstracts, this appears to show X — but the full paper would reveal whether..."

NO EVIDENCE CASE (noEvidence)
Set noEvidence to true if:
- There are zero papers, OR
- All papers are mechanistic/animal only with no human studies, OR
- No papers meaningfully address the user's actual question

When noEvidence is true, synthesisText should clearly state: there is not yet strong human evidence on this specific question, describe what early/mechanistic research suggests if any, and frame it as exploratory.

CONFIDENCE LEVEL (confidence)
- preliminary: only animal/in-vitro evidence, or 1-2 small human studies
- promising: 1-2 RCTs or several consistent observational studies
- moderate: multiple RCTs or 1+ meta-analysis with some consistency
- strong: multiple meta-analyses with consistent human RCT evidence

PAPER SUMMARIES (paperSummaries)
For each paper in the list, write a single plain-English sentence summarising what this specific study found or studied. Keep it under 200 characters. Do not reproduce the title. Write as if explaining to a curious non-expert. Note the study population if relevant.

FOLLOW-UP OPTIONS (followUpOptions)
Write 3-4 natural follow-up questions the user might want to explore. Feel like genuine curiosity, not query headers.

SAFETY BOUNDARY
Never recommend specific doses or treatments.
Never say "you should take X" or "I recommend X".
For dosing questions: say what doses researchers used and what effects were observed at those doses.
Note: individual response varies and decisions should involve a professional.

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
      const fitNote = fitLabel === "direct" ? "DIRECTLY on the user's question" :
                      fitLabel === "adjacent" ? "ADJACENT — related but not a direct answer" :
                      fitLabel === "weak" ? "WEAK fit — may not fully address the question" :
                      "MISMATCH — probably not answering this question";
      return [
        `--- Paper ${i + 1} ---`,
        `externalId: ${p.externalId}`,
        `Title: ${p.title}`,
        `Authors: ${authors}`,
        `Year: ${p.year ?? "Unknown"}`,
        `Study design: ${p.studyDesign} | Population: ${p.populationType}`,
        `Evidence bucket: ${p.evidenceBucket}`,
        `Evidence fit: ${fitLabel} (${fitNote})`,
        `Abstract: ${abstract}${p.abstract.length > 600 ? "..." : ""}`,
      ].join("\n");
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
    `USER QUESTION: ${plan.userQuestion}`,
    `NORMALIZED ENGLISH QUESTION: ${plan.normalizedEnglishQuestion}`,
    `DETECTED LANGUAGE: ${plan.detectedLanguage}`,
    `RESPONSE LANGUAGE: ${plan.responseLanguage}`,
    `INTENT: ${plan.intentType}`,
    plan.isComparison
      ? `⚠️ COMPARISON QUESTION: The user is comparing two approaches. Target to compare against: "${plan.comparisonTarget}". Prioritize papers that compare these head-to-head. If no direct comparison papers exist, say so explicitly — do NOT present single-intervention evidence as if it answers the comparison. Distinguish between: (1) direct head-to-head evidence, (2) indirect evidence from single-intervention studies, (3) mechanism/inference, (4) what the evidence cannot tell us about the comparison.`
      : "",
    plan.desiredEvidenceTypes?.length
      ? `PREFERRED EVIDENCE TYPES: ${plan.desiredEvidenceTypes.join(", ")}. Prioritize papers matching these types. If few or none exist, note that explicitly.`
      : "",
    `KEY ENTITIES: ${plan.entities.join(", ")}`,
    `HIDDEN GOALS (the angles the user most cares about — frame the answer toward these when evidence supports it): ${plan.hiddenGoals.join(", ")}`,
    "",
    `EVIDENCE SUMMARY:`,
    `- Meta-analyses / systematic reviews: ${snapshot.metaAnalyses}`,
    `- RCTs: ${snapshot.rcts}`,
    `- Human observational: ${snapshot.humanObservational}`,
    `- Mechanistic / animal: ${snapshot.mechanistic}`,
    `- Conflicting findings: ${snapshot.conflicting}`,
    "",
    `RETRIEVED PAPERS (${papers.length} total):`,
    papersText,
  ].join("\n");

  const attempts = [
    { label: "primary", model: SEARCH_MODEL, timeoutMs: 45_000 },
    { label: "backup", model: SEARCH_BACKUP_MODEL, timeoutMs: 75_000 },
  ] as const;

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const result = await attemptSynthesis(userMessage, attempt.model, attempt.timeoutMs);
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

const FOLLOW_UP_SYNTHESIS_PROMPT = `You are Clarity answering a follow-up question in an ongoing investigation.

Your job is to:
1. Answer the user's specific follow-up question DIRECTLY
2. Explain what changed or became clearer (if new evidence was retrieved)
3. Ground everything in the provided papers
4. Give a verdict first, then nuance

CRITICAL DIFFERENCE FROM INITIAL SEARCH:
- Initial search: "Here's what we found about X"
- Follow-up: "You asked Y, here's the answer based on [existing + new] evidence, and here's what changed"

REQUIRED STRUCTURE:

**Short answer:** [Direct answer to their specific follow-up question - 1-2 sentences]

**The evidence:** [What studies found, citing specific papers when possible]

**What changed:** [ONLY if new papers were retrieved - what did we learn that we didn't know before? How did this clarify or change the picture?]

**So practically:** [What this means for the user's actual question]

EXAMPLE - Follow-up with New Evidence:
User's follow-up: "Is intermittent fasting better than normal calorie restriction for insulin?"
New papers retrieved: 3 head-to-head comparison studies

Short answer: The evidence is genuinely mixed—IF is not clearly superior to CCR for insulin sensitivity, despite podcast claims.

The evidence: I found 3 new RCTs comparing IF vs CCR head-to-head. Two found no significant difference in fasting insulin or HOMA-IR. One smaller study (n=28) favored IF, but the effect disappeared at 6-month follow-up. The similarity suggests the metabolic benefit comes from weight loss itself, not fasting timing.

What changed: The initial synthesis suggested IF "may improve insulin sensitivity" based on studies without comparison groups. These new comparison studies show that benefit is likely from caloric deficit, not the fasting window. The "metabolic magic" claim is not supported by direct comparisons.

So practically: For insulin health, choose whichever approach you'll actually stick to. The timing matters less than the total calories. Don't choose IF expecting unique metabolic benefits beyond weight loss.

EXAMPLE - Follow-up from Current Evidence:
User's follow-up: "Why do the papers disagree on cognitive effects?"
No new papers needed

Short answer: The contradiction is about timing—when they tested cognitive function.

The evidence: Smith tested immediately after sleep deprivation and found +12% working memory improvement. Jones tested after recovery sleep and found no effect. This suggests creatine helps acute sleep loss (in the moment) but doesn't fix underlying sleep debt.

So practically: If you need to perform right after a bad night's sleep, creatine might help. But it won't restore you to fully-rested cognitive performance. Plan accordingly.

RULES:
- ALWAYS answer the user's specific question directly (not a generic summary)
- When new papers were retrieved, explain what changed from previous understanding
- Use specific study details (n=, effect sizes, p-values if available)
- When evidence contradicts, explain WHY (study design, population, timing)
- Address podcast/headline claims explicitly if relevant
- NEVER say "more research is needed" as the main answer
- NEVER hedge so much that the answer becomes meaningless
- Make judgment calls: "This is overhyped" / "This is actually solid" / "Here's the catch"

CAUSAL LANGUAGE CONSTRAINT:
Only use causal language ("causes", "leads to") for RCTs or meta-analyses. Use "associated with" for observational.

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
      return [
        `--- ${label} Paper ${i + 1} ---`,
        `ID: ${p.externalId}`,
        `Title: ${p.title}`,
        `Authors: ${authors}`,
        `Year: ${p.year ?? "Unknown"}`,
        `Study: ${p.studyDesign} | Population: ${p.populationType}`,
        `Fit: ${fitLabel}${p.evidenceFit?.isHeadToHead ? " (head-to-head comparison)" : ""}`,
        `Abstract: ${abstract}${p.abstract.length > 500 ? "..." : ""}`,
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
        "DO NOT REPEAT — these claims were already established in the previous synthesis:",
        ...previousClaims.map((c, i) => `  [${i + 1}] ${c}`),
        "",
        "Only surface what changed, what is new, or what directly answers the follow-up question. You may restate ONE sentence from the previous synthesis for context if necessary.",
        "",
      ]
    : [];

  const userMessage = [
    `ORIGINAL QUERY: ${originalQuery}`,
    `PREVIOUS SYNTHESIS: ${previousSynthesis.slice(0, 800)}`,
    "",
    ...deduplicationBlock,
    `FOLLOW-UP QUESTION: ${followUpQuestion}`,
    `USER'S REAL QUESTION: ${userIntent.mainQuestion}`,
    userIntent.comparisonTarget ? `COMPARISON: vs ${userIntent.comparisonTarget}` : "",
    userIntent.specificOutcome ? `SPECIFIC OUTCOME: ${userIntent.specificOutcome}` : "",
    "",
    `RETRIEVAL STATUS: ${hasNewPapers ? `Retrieved ${newPapers.length} new papers` : "Using existing evidence only"}`,
    hasNewPapers ? `CRITICAL: You MUST fill the "whatChanged" field. Describe what the new papers added that the previous synthesis did not cover. Be specific — name which papers revealed what, and how the picture changed.` : "",
    "",
    `EVIDENCE SNAPSHOT:`,
    `- Meta-analyses: ${evidenceSnapshot.metaAnalyses}`,
    `- RCTs: ${evidenceSnapshot.rcts}`,
    `- Total papers: ${allPapers.length} (${existingPapers.length} existing + ${newPapers.length} new)`,
    "",
    formatPapersForFollowUp(existingPapers, "EXISTING"),
    "",
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
