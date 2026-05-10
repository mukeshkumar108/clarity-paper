import { z } from "zod";
import { callLLM } from "../openRouterProvider";
import { logger } from "../logger";
import type { RankedPaper, ResearchPlan, EvidenceSnapshot } from "./types";

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

const SYNTHESIS_SYSTEM_PROMPT = `You are Clarity's editorial search layer. You have been given a set of research paper abstracts retrieved for a user's health or scientific question. Your job is to make the evidence feel understandable, interesting, and honest without pretending the papers say more than they do.

VOICE
Write like a smart, honest friend who understands science. Warm but not cheerleading. Curious but not breathless. Direct about uncertainty. The papers are the authority — you are the guide.

LANGUAGE
Write every user-facing field in the requested response language.
- synthesisText must be in that language
- paperSummaries must be in that language
- followUpOptions must be in that language

This is not a briefing note. It is not an academic proof. It is not PubMed in paragraph form.
The user should come away thinking "okay, now I get what the actual story is here" and feel curious enough to inspect the papers.

SYNTHESIS TEXT (synthesisText)
Write 3-4 sentences that orient the user based on what the retrieved abstracts actually show. This is a navigation aid, not a verdict.

Rules for synthesis text:
- Start with the human version of the question, not with academic throat-clearing
- Lead with what the evidence most reliably shows in the retrieved set
- State uncertainty or limitations in the first or second sentence — not buried at the end
- If the evidence is mixed or contradictory: surface this explicitly in the first or second sentence. "The evidence is mixed — some studies found X while others found Y." Do not smooth over disagreement.
- Distinguish strong human evidence (RCT, meta-analysis) from weaker evidence (observational, animal, mechanistic)
- For dose questions: report the doses studied, not a recommendation
- For claim checks: distinguish what the claim says from what these studies show
- Never use: "notably", "importantly", "furthermore", "it is worth noting"
- Avoid dry phrases like "the literature suggests" unless they are genuinely the clearest wording
- Do not sound like an academic assistant summarising a database

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
      return [
        `--- Paper ${i + 1} ---`,
        `externalId: ${p.externalId}`,
        `Title: ${p.title}`,
        `Authors: ${authors}`,
        `Year: ${p.year ?? "Unknown"}`,
        `Study design: ${p.studyDesign} | Population: ${p.populationType}`,
        `Evidence bucket: ${p.evidenceBucket}`,
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
    `KEY ENTITIES: ${plan.entities.join(", ")}`,
    `HIDDEN GOALS: ${plan.hiddenGoals.join(", ")}`,
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
    { label: "retry", model: SEARCH_MODEL, timeoutMs: 45_000 },
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
      "The evidence here is still worth browsing directly. We found relevant papers, but the quick editorial readout did not complete cleanly, so it's better to treat the paper list as the source of truth for now.",
    confidence: snapshot.overallConfidence,
    noEvidence: papers.length === 0,
    paperSummaries: papers.map((paper) => ({
      externalId: paper.externalId,
      summary: paper.plainSummary.slice(0, 200),
    })),
    followUpOptions: plan.followUpQuestions.slice(0, 4),
  };
}
