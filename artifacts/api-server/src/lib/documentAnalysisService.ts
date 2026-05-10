import { callLLM, isDemoMode } from "./openRouterProvider";
import { logger } from "./logger";
import {
  buildAnalysisFromPasses,
  editorialSummarySchema,
  llmAnalysisSchema,
  normalizeAnalysisDraft,
  structuredAnalysisSchema,
  type EditorialSummaryDraft,
  type NormalizedAnalysis,
  type StructuredAnalysisDraft,
} from "./analysisContract";

const LEGAL_DISCLAIMER =
  "Clarity Paper provides research explanation and analysis, not medical or professional advice. Always consult a qualified professional before making health or lifestyle changes based on research.";
const STRUCTURED_MODEL =
  process.env.OPENROUTER_STRUCTURED_MODEL || process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
const EDITORIAL_MODEL = process.env.OPENROUTER_EDITORIAL_MODEL || "deepseek/deepseek-v4-pro";
const REVIEW_MODEL = process.env.OPENROUTER_REVIEW_MODEL || EDITORIAL_MODEL;
const REVIEW_PASS_ENABLED = process.env.CLARITY_ENABLE_REVIEW_PASS === "true";

const STRUCTURED_SYSTEM_PROMPT = `You are a scientific research analyst. Your job is to extract structured understanding from a research paper or abstract.

This output is internal only.
- Never write for a human reader
- Never add prose, narrative, or editorial commentary
- Never optimize for warmth, readability, or persuasion

Rules:
- Extract factual information only
- Be concise and precise
- Keep null results when they are present
- Keep limitations factual and deduplicated
- Keep suggested questions specific to this paper
- Do not invent sample sizes, effect sizes, funding details, preregistration, peer review status, or citations
- If a field cannot be determined from the available text, use the closest schema-compatible empty value without fabrication
- Do not add fields that are not in the schema

paperMetadata extraction rules:
- title: extract the full title of the paper exactly as it appears. If not present, use "".
- authors: extract all author names exactly as they appear (first + last name). If not present, use empty array [].
- journal: extract the journal or conference name exactly. If not present, use "".
- publicationYear: extract the four-digit publication year as a string (e.g. "2023"). If not present, use "".
- These fields must never be fabricated. If you cannot find them in the paper text, leave them empty.

Return strict JSON only matching the schema exactly.`;

const EDITORIAL_SYSTEM_PROMPT = `You are writing for people who are curious but cognitively tired.

Your reader saw a health claim online, or got handed a paper they don't have
time to fully read, or wants to know if the science actually backs up what
they were told. They are not stupid. They are busy, and intimidated by
academic language. Many of them have never read a research paper in full.

Your mission is not to summarise. It is to make someone feel like they
understand something they didn't before — and want to know more.

THE VOICE

Write like a smart, honest friend who happens to understand science. Not a
professor. Not a journalist filing copy. Not a peer reviewer covering their
liability. A friend who tells you the interesting part, flags the catch, and
is honest about what we don't know yet.

Warm but never dumbed down. Curious but never breathless. Direct but never cold.

The reader should finish thinking: "huh, I want to know more about this" —
not "okay, I have been informed."

Before you write any sentence, ask: would a smart person say this out loud
to a friend? If not, rewrite it.

YOUR SOURCE MATERIAL

You will receive structured JSON extracted from the paper. This is raw
factual data — not your output. Do not reproduce these strings. Do not
paraphrase them sentence by sentence. Transform them completely.

The extraction tells you what happened. Your job is to explain what it
means and why anyone should care.

---

SECTION 1: OPENING HOOK → field: openingHook

2-3 sentences. The question already forming in the reader's head. Start
mid-thought, like a conversation already in progress.

NEVER open with: "This study", "Researchers", "A new study shows",
"The paper", "This paper", "Scientists found". These announce. They don't
start a conversation.

BAD: "This study provides evidence that gratitude interventions can
positively impact mental health and well-being."

GOOD: "Most of us have been told at some point to keep a gratitude journal.
But does it actually do anything — or is it the kind of advice that sounds
nice and doesn't hold up when you look closely?"

---

SECTION 2: ONE-LINE ORIENTATION → field: orientation

One sentence. The single most important thing the study found. Plain English.
No jargon. Flows naturally from the hook — don't restart.

---

SECTION 3: WHAT THEY FOUND → field: findings (array of heading + body)

3-5 findings. Each has:

HEADING (field: heading)
4-8 words. A curious observation — like a chapter title, not a sentence.
Not a statistic. Not a scale name. Something a person would actually say.

BAD: "Gratitude interventions led to a 3.67% higher score on the GQ-6"
BAD: "Statistically significant improvement in life satisfaction measures"
GOOD: "Gratitude actually moves the needle"
GOOD: "The effect was real, but modest"
GOOD: "Sleep quality didn't budge"

BODY (field: body)
2-3 sentences. Start with what it means to a person — not what was
measured. Numbers come after the meaning, if they appear at all.

BAD: "Participants showed a 3.67% increase on the GQ-6 scale compared
to controls."

GOOD: "People who kept a gratitude journal consistently said they felt
more grateful — not just in the moment, but measurably so on standardised
tests taken weeks later. The effect wasn't huge, but it was consistent
across many different types of gratitude practice."

Include at least one finding that surprises. Include null results —
something that didn't change is often the most interesting finding.

---

SECTION 4: TRUST → field: trustNarrative

3-4 sentences. Don't list limitations. Make an honest judgment.
Lead with the strongest reason to take this seriously.
Then the most important reason for caution.
End with one calibrating sentence — not a warning, not a dismissal.
"Think of this as X, not Y."

---

SECTION 5: QUESTIONS → field: questionsWorthAsking

4 questions a curious, slightly sceptical reader would actually ask.
First or second person. Personal, not generic.

BAD: "What are the long-term effects of gratitude interventions?"
GOOD: "Would this still work if I already think of myself as a
pretty positive person?"

---

SECTION 6: HOW THE STUDY WAS DESIGNED → field: deeperDive.howDesignedBody
Title → field: deeperDive.howDesignedTitle (default: "How the study was designed")

3-4 sentences. Plain English. No jargon without an inline explanation.

If this is a meta-analysis or systematic review, explain what that means
before saying anything else. Do not assume the reader knows.

EXAMPLE: "The researchers didn't run a new experiment themselves. Instead,
they gathered every rigorous study on gratitude practices they could find
and pooled all the results together. This approach — called a meta-analysis
— is powerful because you're not relying on one group of people in one lab;
you're looking at the pattern across dozens of studies. The trade-off is
that if those studies used very different methods, combining them can get
messy."

---

SECTION 7: WHAT THIS CAN'T TELL US → field: deeperDive.cantTellUsBody
Title → field: deeperDive.cantTellUsTitle (default: "What this study can't tell us")

3-5 sentences. Genuine gaps — not boilerplate caveats.
Who was left out? What can this design not answer by definition?
What does it leave you genuinely wondering?
Write like you're being honest with a friend, not covering liability.

---

SECTION 8: BIGGER PICTURE → field: deeperDive.biggerPictureBody
Title → field: deeperDive.biggerPictureTitle (default: "Where this fits in the bigger picture")

3-5 sentences. What came before this? What does it add?
What should come next? Teach the reader something about how science
works in this area — not just what this paper says.

---

SECTION 9: FOR THE TECHNICALLY CURIOUS → field: deeperDive.technicallyCuriousBody
Title → field: deeperDive.technicallyCuriousTitle (default: "For the technically curious")

For readers who want methodology, statistics, and tradeoffs. This is the
only section where specific numbers, p-values, effect sizes, and
statistical terminology are appropriate. Write in clear prose — no bullet
points, no field labels.

---

ABSOLUTE RULES

Never open the hook with "This study", "Researchers", "A new study",
"The paper" or any phrase that announces rather than starts a conversation
Never start a finding heading with a number, percentage, or scale name
Never reproduce source extraction strings verbatim or near-verbatim —
transform them completely
Never write findings as bullet points
Never use: "notably," "importantly," "furthermore," "it is worth noting,"
"delve," "significant" (unless referring to p-values specifically)
Never announce structure ("here's what they found:", "in conclusion:")
Never write a disclaimer — calibrate trust through honest framing instead
Never repeat the same caveat twice
Never condescend — the reader is intelligent, just not a scientist

Return strict JSON only matching the schema exactly.`;

export type AnalysisResult = NormalizedAnalysis;

const DEMO_ANALYSIS: AnalysisResult = normalizeAnalysisDraft(
  llmAnalysisSchema.parse({
    bottomLine:
      "This is a demo analysis. Add your OPENROUTER_API_KEY environment variable to enable real AI-powered research analysis.",
    trustRating: {
      rating: "Early / exploratory",
      reason: "Demo mode cannot inspect a real paper, so this is only a placeholder analysis.",
      confidenceLevel: "medium",
      citationUse: "Use as background context only.",
    },
    whatPaperActuallyShows: {
      studyType: "Demo",
      population: "Not clear from uploaded text.",
      interventionOrExposure: "Not clear from uploaded text.",
      outcomesMeasured: "Not clear from uploaded text.",
      observedResult: "Once configured, Clarity Paper will produce a trust-focused review instead of a generic summary.",
      claimType: "speculative",
    },
    keyFindings: [
      {
        finding: "Demo mode is active.",
        sourceInPaper: "System state",
        populationOrSample: "App session",
        effectDirection: "No real paper analysis is available yet.",
        strengthOfSupport: "Theoretical / speculative",
        plainEnglishMeaning: "Set an API key to unlock the full research clarity workflow.",
      },
    ],
    realWorldMeaning: {
      summary:
        "Clarity Paper is running in demo mode. Once you add an API key, the app will generate a plain-English trust review of uploaded research.",
    },
    practicalUse: {
      recommendation: "Do not act on this alone",
      reasoning: "There is no real paper output in demo mode.",
      caution: LEGAL_DISCLAIMER,
    },
    disclaimer: LEGAL_DISCLAIMER,
  }),
  { documentType: "demo", text: "" },
);

type QaAnalysisContext = {
  documentType?: string | null;
  briefSummary?: string | null;
  plainEnglishSummary?: string | null;
  gotchas?: Array<{ title?: string; explanation?: string }> | null;
  missingInfo?: Array<{ item?: string; whyItMatters?: string }> | null;
  questionsToAsk?: Array<{ question?: string }> | null;
};


export async function analyseDocument(
  text: string,
  documentType: string,
  researchField: string,
  goal: string,
  preferredLanguage: string = "English",
): Promise<AnalysisResult & { isDemo: boolean }> {
  if (isDemoMode) {
    return { ...DEMO_ANALYSIS, isDemo: true };
  }

  logger.info({ textLength: text.length, structuredModel: STRUCTURED_MODEL }, "Analysing document via single-pass structured extraction");
  const structured = await runStructuredPass(text, documentType, researchField, goal);
  const editorial = await runEditorialPass(structured, documentType, researchField, goal, preferredLanguage);
  const combined = buildAnalysisFromPasses(structured, editorial, { text, documentType });
  return reviewFinalAnalysis({ ...combined, isDemo: false }, text, documentType, researchField, goal);
}

async function runStructuredPass(
  text: string,
  documentType: string,
  researchField: string,
  goal: string,
): Promise<StructuredAnalysisDraft> {
  const userMessage = `Extract the structured scientific understanding from the following research paper.

Paper type: ${documentType || "unknown"}
Research field: ${researchField || "not specified"}
User's goal: ${goal || "understand the findings"}

Paper text:
---
${text}
---

Important:
- Focus on factual extraction and evidence assessment
- Do not write for a human reader
- Keep findings concise and literal
- Keep limitations factual and deduplicated
- Keep suggested questions tied to what this paper specifically leaves open
- Prefer null-style uncertainty over invention`;

  try {
    const raw = await callLLM(STRUCTURED_SYSTEM_PROMPT, userMessage, structuredAnalysisSchema, {
      model: STRUCTURED_MODEL,
      temperature: 0.1,
    });
    return structuredAnalysisSchema.parse(JSON.parse(raw));
  } catch (err) {
    logger.error({ err }, "Structured analysis failed");
    throw err;
  }
}


async function runEditorialPass(
  structured: StructuredAnalysisDraft,
  documentType: string,
  researchField: string,
  goal: string,
  preferredLanguage: string = "English",
): Promise<EditorialSummaryDraft> {
  const userMessage = buildEditorialContext(structured);

  const languagePrefix =
    preferredLanguage !== "English"
      ? `Write your entire response in ${preferredLanguage}. This includes all section headers, findings, trust framing, questions, and deep dive sections. Do not translate scientific terms that have no direct equivalent — keep those in their original form but explain them in ${preferredLanguage}.\n\n`
      : "";
  const systemPrompt = languagePrefix + EDITORIAL_SYSTEM_PROMPT;

  try {
    const raw = await callLLM(systemPrompt, userMessage, editorialSummarySchema, {
      model: EDITORIAL_MODEL,
      temperature: 0.2,
    });
    return editorialSummarySchema.parse(JSON.parse(raw));
  } catch (err) {
    logger.error({ err }, "Editorial synthesis failed");
    return createFallbackEditorialSummary(structured);
  }
}

async function reviewFinalAnalysis(
  draft: AnalysisResult & { isDemo: boolean },
  text: string,
  documentType: string,
  researchField: string,
  goal: string,
): Promise<AnalysisResult & { isDemo: boolean }> {
  if (!REVIEW_PASS_ENABLED || isDemoMode) {
    return draft;
  }

  const reviewSystemPrompt = `You are Clarity Paper's editorial review pass. Improve the human-facing explanation without changing the underlying scientific meaning.

Rules:
- Keep the output in valid JSON matching the schema
- Make the explanation sound more natural and coherent
- Avoid schema leakage or templated wording
- Keep trust framing nuanced and human
- Keep the caveats concise and integrated naturally`;

  const reviewMessage = `Review and improve this editorial summary.

Paper type: ${documentType || "unknown"}
Field: ${researchField || "not specified"}
User's goal: ${goal || "understand findings"}

Paper excerpt:
---
${text.slice(0, 12000)}
---

Draft editorial summary:
---
${JSON.stringify({
      openingHook: draft.editorialView.openingHook,
      orientation: draft.editorialView.orientation,
      findings: draft.editorialView.findings,
      trustNarrative: draft.editorialView.trustNarrative,
      questionsWorthAsking: draft.editorialView.questionsWorthAsking,
      deeperDive: draft.editorialView.deeperDive,
    })}
---

Improve the draft so it is clearer, more coherent, and more useful to a non-expert. Lead with understanding, then calibration, then practical meaning.`;

  try {
    const raw = await callLLM(reviewSystemPrompt, reviewMessage, editorialSummarySchema, {
      model: REVIEW_MODEL,
      temperature: 0.1,
    });
    const reviewed = editorialSummarySchema.parse(JSON.parse(raw));

    return {
      ...draft,
      editorialView: {
        openingHook: reviewed.openingHook || draft.editorialView.openingHook,
        orientation: reviewed.orientation || draft.editorialView.orientation,
        findings: reviewed.findings.length > 0 ? reviewed.findings : draft.editorialView.findings,
        trustNarrative: reviewed.trustNarrative || draft.editorialView.trustNarrative,
        questionsWorthAsking:
          reviewed.questionsWorthAsking.length > 0
            ? reviewed.questionsWorthAsking
            : draft.editorialView.questionsWorthAsking,
        deeperDive: {
          howDesignedTitle: reviewed.deeperDive?.howDesignedTitle || draft.editorialView.deeperDive.howDesignedTitle,
          howDesignedBody: reviewed.deeperDive?.howDesignedBody || draft.editorialView.deeperDive.howDesignedBody,
          cantTellUsTitle: reviewed.deeperDive?.cantTellUsTitle || draft.editorialView.deeperDive.cantTellUsTitle,
          cantTellUsBody: reviewed.deeperDive?.cantTellUsBody || draft.editorialView.deeperDive.cantTellUsBody,
          biggerPictureTitle: reviewed.deeperDive?.biggerPictureTitle || draft.editorialView.deeperDive.biggerPictureTitle,
          biggerPictureBody: reviewed.deeperDive?.biggerPictureBody || draft.editorialView.deeperDive.biggerPictureBody,
          technicallyCuriousTitle:
            reviewed.deeperDive?.technicallyCuriousTitle || draft.editorialView.deeperDive.technicallyCuriousTitle,
          technicallyCuriousBody:
            reviewed.deeperDive?.technicallyCuriousBody || draft.editorialView.deeperDive.technicallyCuriousBody,
        },
      },
      primarySummary: {
        ...draft.primarySummary,
        bottomLine: reviewed.orientation || draft.primarySummary.bottomLine,
        whyThisMatters: reviewed.openingHook || draft.primarySummary.whyThisMatters,
        trustSignal: {
          ...draft.primarySummary.trustSignal,
          summary: reviewed.trustNarrative || draft.primarySummary.trustSignal.summary,
        },
        mainTakeaways:
          reviewed.findings.length > 0
            ? reviewed.findings.map((item) => item.heading || item.body).filter(Boolean)
            : draft.primarySummary.mainTakeaways,
        suggestedQuestions:
          reviewed.questionsWorthAsking.length > 0
            ? reviewed.questionsWorthAsking
            : draft.primarySummary.suggestedQuestions,
      },
      bottomLine: reviewed.orientation || draft.bottomLine,
      takeaway: reviewed.trustNarrative || draft.takeaway,
      practicalRelevance: reviewed.deeperDive?.biggerPictureBody || draft.practicalRelevance,
      suggestedQuestions:
        reviewed.questionsWorthAsking.length > 0 ? reviewed.questionsWorthAsking : draft.suggestedQuestions,
      isDemo: false,
    };
  } catch (err) {
    logger.error({ err }, "Review pass failed");
    return draft;
  }
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function buildEditorialContext(structured: StructuredAnalysisDraft): string {
  const handoff = {
    paper: {
      studyShape: structured.study.type || structured.evidenceSignals.studyType || null,
      whoWasStudied: structured.study.population || null,
      interventionOrExposure: structured.study.interventionOrExposure || null,
      outcomesMeasured: structured.study.outcomes || null,
      mainResult: structured.study.mainResult || null,
      claimType: structured.study.claimType || null,
    },
    findings: structured.findings.slice(0, 5).map((item) => ({
      finding: item.finding || null,
      plainMeaning: item.plainMeaning || null,
      population: item.populationOrSample || null,
      strength: item.supportLevel || null,
      direction: item.effectDirection || null,
    })),
    trust: {
      overallReason: structured.trust.reason || null,
      strongestReasonToTakeItSeriously: structured.trust.supportingSignals[0] || null,
      biggestReasonForCaution: structured.limitations[0]?.limitation || null,
      confidenceLevel: structured.trust.confidenceLevel || null,
      citationUse: structured.trust.citationUse || null,
    },
    limitations: structured.limitations.slice(0, 4).map((item) => ({
      limitation: item.limitation || null,
      whyItMatters: item.whyItMatters || null,
    })),
    likelyMisreadings: structured.misreadings.slice(0, 3).map((item) => ({
      misleadingClaim: item.misleadingClaim || null,
      reality: item.whatThePaperSupports || null,
    })),
    relevance: {
      whyItMatters: structured.relevance.whyItMatters || null,
      practicalMeaning: structured.relevance.practicalMeaning || null,
      actionability: structured.relevance.actionability || null,
      actionabilityReason: structured.relevance.actionabilityReasoning || null,
      caution: structured.relevance.caution || null,
    },
    suggestedQuestionSeeds: structured.suggestedQuestions.slice(0, 4),
    methodology: {
      design: structured.methodologySnapshot.design || null,
      participants: structured.methodologySnapshot.numberOfStudiesOrParticipants || null,
      analysisMethod: structured.methodologySnapshot.analysisMethod || null,
    },
    fieldContext: {
      relatedTerms: structured.keyTerms.slice(0, 4).map((item) => item.term).filter(Boolean),
      missingInfo: structured.missingInfo.slice(0, 3).map((item) => item.item).filter(Boolean),
    },
  };

  return JSON.stringify(handoff, null, 2);
}

function createFallbackEditorialSummary(structured: StructuredAnalysisDraft): EditorialSummaryDraft {
  const mainResult = structured.study.mainResult || "The paper reports a signal";
  const trustReason = structured.trust.reason || "The evidence needs careful interpretation.";
  return {
    openingHook:
      structured.relevance.whyItMatters ||
      "This paper points to an idea that could matter in real life, but it needs context to be interpreted properly.",
    orientation: mainResult,
    findings: dedupeStrings(
      structured.findings.slice(0, 4).map((item) => `${item.finding}|||${item.plainMeaning || item.finding}`).filter(Boolean),
    ).map((item) => {
      const [heading, body] = item.split("|||");
      return { heading, body };
    }),
    trustNarrative: trustReason,
    questionsWorthAsking: structured.suggestedQuestions.slice(0, 4),
    deeperDive: {
      howDesignedTitle: "How the study was designed",
      howDesignedBody:
        structured.methodologySnapshot.design ||
        structured.study.type ||
        "The available text only gives a partial view of the design.",
      cantTellUsTitle: "What this study can't tell us",
      cantTellUsBody:
        structured.nonClaims[0] ||
        structured.limitations[0]?.whyItMatters ||
        "It leaves open questions about how broadly the result applies.",
      biggerPictureTitle: "Where this fits in the bigger picture",
      biggerPictureBody:
        structured.relevance.practicalMeaning ||
        "Treat it as one useful piece of evidence rather than a complete answer on its own.",
      technicallyCuriousTitle: "For the technically curious",
      technicallyCuriousBody:
        structured.methodologySnapshot.analysisMethod ||
        structured.evidenceSignals.statisticalDetail ||
        structured.evidenceSignals.effectSizes ||
        "The available text gives only a partial technical picture, so the design and limitations matter more than any one number here.",
    },
  };
}


export async function answerDocumentQuestion(
  documentText: string,
  question: string,
  analysis?: QaAnalysisContext | null,
  language: string = "English",
): Promise<string> {
  if (isDemoMode) {
    return "Demo mode is active. Add your OPENROUTER_API_KEY environment variable to enable real Q&A. A qualified professional can help you answer this question.";
  }

  const analysisContext = buildQaAnalysisContext(analysis);
  const qaSystemPrompt = `You are answering a question about a specific research paper for a curious intelligent person who is not a scientist.

Write like a smart honest friend who understands the research. Warm but never dumbed down. Direct but never cold.

Answer in 3-5 sentences of flowing prose. No bullet points. No headers. No labels.

Start with the most interesting or most directly useful part of the answer. Be honest about uncertainty — if the paper doesn't answer the question, say so plainly and say what it does suggest instead. If specific numbers or findings are in the paper, share them naturally in context, not as raw data.

The reader should finish feeling like they understand something real — not like they received a briefing document.

Never open with "Great question" or any variation of it.
Never use "notably", "importantly", "furthermore".
Never invent numbers, dosages, effect sizes, or sample characteristics not in the paper.
Write in ${language}.`;

  const textToQuery = normalizeDocumentTextForQa(documentText).slice(0, 20000);

  const userMessage = `Document text:
---
${textToQuery}
---

Prior analysis context:
---
${analysisContext}
---

Question: ${question}`;

  const raw = await callLLM(qaSystemPrompt, userMessage, undefined, {
    model: "google/gemini-2.5-flash",
    temperature: 0.3,
    timeoutMs: 30_000,
  });
  return raw.trim();
}

function buildQaAnalysisContext(analysis?: QaAnalysisContext | null): string {
  if (!analysis) return "No prior analysis available.";

  const parts = [
    analysis.documentType ? `Document type: ${analysis.documentType}` : null,
    analysis.briefSummary ? `Brief summary: ${analysis.briefSummary}` : null,
    analysis.gotchas?.length
      ? `Gotchas: ${analysis.gotchas.slice(0, 3).map((item) => `${(item as any).title} - ${(item as any).explanation}`).join(" | ")}`
      : null,
    analysis.missingInfo?.length
      ? `What is not visible from the uploaded text: ${analysis.missingInfo.slice(0, 4).map((item) => `${(item as any).item} - ${(item as any).whyItMatters}`).join(" | ")}`
      : null,
    analysis.questionsToAsk?.length
      ? `Useful follow-up questions: ${analysis.questionsToAsk.slice(0, 3).map((item) => (item as any).question).join(" | ")}`
      : null,
  ].filter(Boolean);

  return parts.join("\n");
}

function normalizeDocumentTextForQa(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
