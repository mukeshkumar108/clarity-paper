import type { RankedPaper, EvidenceSpan, SourceSnippet, SupportType, GroundingDiagnostics } from "./types";

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_SNIPPETS_PER_CLAIM = 3;
const MAX_SNIPPETS_PER_PAPER = 2;
const MIN_SNIPPET_SCORE = 0.10;
const MIN_CLAIM_LENGTH = 40;
const MIN_CLAIM_WORDS = 6;
const MIN_ABSTRACT_SENTENCE_LENGTH = 30;

// P5 taxonomy thresholds — chosen to produce meaningful distinctions
// strongly_supported: >= 0.42 (clear alignment on intervention + outcome)
// partially_supported: >= 0.22 (some aspects match, not comprehensive)
// related_evidence: >= 0.10 (same domain but different focus)
const STRONGLY_SUPPORTED_THRESHOLD = 0.42;
const PARTIALLY_SUPPORTED_THRESHOLD = 0.22;

// Entity keywords get 2× weight — they are the precise thing the user asked about
const ENTITY_WEIGHT = 2.0;

// Bigrams contribute 1.5× vs unigrams — they capture domain phrases like "working memory"
const BIGRAM_WEIGHT = 1.5;

// Negation halves the score — the snippet may contradict the claim
const NEGATION_MULTIPLIER = 0.5;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "as", "is", "was", "are", "were", "been", "be", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might", "must",
  "shall", "can", "not", "this", "that", "these", "those", "than", "then", "when",
  "where", "which", "who", "how", "what", "why", "there", "their", "they", "them",
  "it", "its", "some", "any", "more", "most", "also", "very", "such", "both", "each",
  "other", "into", "through", "during", "before", "after", "above", "between", "out",
  "off", "over", "under", "no", "only", "same", "so", "just", "because", "while",
  "although", "however", "though", "whether", "about", "across", "against", "along",
  "among", "around", "without", "within", "show", "shows", "showed", "shown", "suggest",
  "suggests", "suggested", "indicate", "indicates", "indicated", "find", "found",
  "result", "results", "study", "studies", "research", "evidence", "paper", "trial",
  "trials", "analysis", "review", "data", "patients", "participants", "subjects",
  "associated", "significantly", "significant", "compared", "using", "used", "including",
  "included", "based", "reported", "observed", "increase", "decrease", "higher", "lower",
  "effects", "effect", "showed", "conducted", "examined", "evaluated", "assessed",
]);

// Negation indicators — if found within 60 chars before a matched keyword, the snippet may contradict
const NEGATION_WORDS = [
  "not", "no", "without", "failed", "failed to", "did not", "does not", "do not",
  "cannot", "could not", "neither", "nor", "never", "absent", "lack", "lacked",
  "lacking", "no significant", "no evidence", "not significant", "not associated",
  "not improve", "not reduce", "not affect",
];

// Skip clauses that should not become evidence claims
const SKIP_PREFIXES = [
  /^(note:|disclaimer:|always|individual|please|consult|speak to|talk to|see a|ask)/i,
  /^(the evidence shows|based on|overall,|in summary|to summarize|in conclusion)/i,
  /^(it.s important|it is important|keep in mind|bear in mind|remember that)/i,
  /^(as with all|as with any|as always)/i,
];

const SKIP_PATTERNS = [
  /professional|physician|healthcare provider|healthcare professional|doctor|clinician/i,
  /personal decisions should involve|consult with|speak with a/i,
  /individual response varies|personal medical/i,
];

// ─── Claim extraction ─────────────────────────────────────────────────────────

export function extractClaims(synthesisText: string): string[] {
  const raw = synthesisText
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return raw.filter((sentence) => {
    if (sentence.length < MIN_CLAIM_LENGTH) return false;
    if (sentence.split(/\s+/).length < MIN_CLAIM_WORDS) return false;
    if (SKIP_PREFIXES.some((p) => p.test(sentence))) return false;
    if (SKIP_PATTERNS.some((p) => p.test(sentence))) return false;
    return true;
  });
}

// ─── Keyword and bigram extraction ───────────────────────────────────────────

/** Unigrams: words with ≥ 4 chars not in stopwords, OR short numeric tokens like "5g", "200mg" */
function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase().replace(/[^\w\s]/g, " ");
  return lower
    .split(/\s+/)
    .filter((w) => {
      if (!w) return false;
      // Always keep numeric tokens (dosages, measurements)
      if (/\d/.test(w)) return w.length >= 2;
      return w.length >= 4 && !STOPWORDS.has(w);
    });
}

function extractBigrams(keywords: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < keywords.length - 1; i++) {
    bigrams.push(`${keywords[i]} ${keywords[i + 1]}`);
  }
  return bigrams;
}

function buildEntitySet(entities: string[]): Set<string> {
  const set = new Set<string>();
  for (const entity of entities) {
    for (const kw of extractKeywords(entity)) {
      set.add(kw);
    }
    // Also add the full entity phrase (lowercased, trimmed)
    const phrase = entity.toLowerCase().trim();
    if (phrase) set.add(phrase);
  }
  return set;
}

// ─── Negation detection ───────────────────────────────────────────────────────

function hasNegationNearKeyword(snippetLower: string, keyword: string): boolean {
  const idx = snippetLower.indexOf(keyword);
  if (idx === -1) return false;
  // Scan the 60 chars before the keyword
  const window = snippetLower.slice(Math.max(0, idx - 60), idx);
  return NEGATION_WORDS.some((neg) => window.includes(neg));
}

// ─── Number matching ─────────────────────────────────────────────────────────

function extractNumbers(text: string): Set<string> {
  const matches = text.match(/\b\d+\.?\d*\b/g);
  return new Set(matches ?? []);
}

function numberMatchBonus(claimNums: Set<string>, snippetLower: string): number {
  if (claimNums.size === 0) return 0;
  const snippetNums = extractNumbers(snippetLower);
  const shared = [...claimNums].filter((n) => snippetNums.has(n)).length;
  // Small bonus: 0.05 per matched number, up to 0.15
  return Math.min(0.15, shared * 0.05);
}

// ─── Snippet scoring ──────────────────────────────────────────────────────────

function scoreSnippet(
  snippetLower: string,
  unigrams: string[],
  bigrams: string[],
  entitySet: Set<string>,
  claimNumbers: Set<string>,
): number {
  if (unigrams.length === 0) return 0;

  let weightedMatches = 0;
  let totalWeight = 0;

  // Unigram scoring with entity boosting and negation penalty
  for (const kw of unigrams) {
    const isEntity = entitySet.has(kw);
    const weight = isEntity ? ENTITY_WEIGHT : 1.0;
    totalWeight += weight;

    if (snippetLower.includes(kw)) {
      const negated = hasNegationNearKeyword(snippetLower, kw);
      weightedMatches += negated ? weight * NEGATION_MULTIPLIER : weight;
    }
  }

  // Bigram scoring — higher weight, captures domain phrases
  for (const bg of bigrams) {
    const weight = BIGRAM_WEIGHT;
    totalWeight += weight;
    if (snippetLower.includes(bg)) {
      weightedMatches += weight;
    }
  }

  if (totalWeight === 0) return 0;
  const base = Math.max(0, weightedMatches / totalWeight);

  // Number proximity bonus (P2: dosage/measurement matching)
  const numBonus = numberMatchBonus(claimNumbers, snippetLower);

  return Math.min(1.0, base + numBonus);
}

function classifySupportType(score: number): SupportType {
  if (score >= STRONGLY_SUPPORTED_THRESHOLD) return "strongly_supported";
  if (score >= PARTIALLY_SUPPORTED_THRESHOLD) return "partially_supported";
  return "related_evidence";
}

// ─── Abstract sentence splitting ──────────────────────────────────────────────

function splitAbstractSentences(abstract: string): string[] {
  return abstract
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_ABSTRACT_SENTENCE_LENGTH);
}

// ─── Per-paper snippet extraction ─────────────────────────────────────────────

interface CandidateSnippet {
  text: string;
  paragraphIndex: number;
  score: number;
}

function extractPaperSnippets(
  unigrams: string[],
  bigrams: string[],
  entitySet: Set<string>,
  claimNumbers: Set<string>,
  paper: RankedPaper,
): CandidateSnippet[] {
  if (!paper.abstract || paper.abstract.length < 50) return [];
  if (unigrams.length === 0) return [];

  const sentences = splitAbstractSentences(paper.abstract);
  const candidates: CandidateSnippet[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const text = sentences[i];
    const lower = text.toLowerCase();
    const score = scoreSnippet(lower, unigrams, bigrams, entitySet, claimNumbers);
    if (score < MIN_SNIPPET_SCORE) continue;

    // P6 safety guarantee: only emit text that exists verbatim in the abstract
    if (!paper.abstract.includes(text)) continue;

    candidates.push({ text, paragraphIndex: i, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, MAX_SNIPPETS_PER_PAPER);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildEvidenceSpans(
  synthesisText: string,
  papers: RankedPaper[],
  entities: string[] = [],
): EvidenceSpan[] {
  const entitySet = buildEntitySet(entities);
  const claims = extractClaims(synthesisText);

  return claims.map((claimText, claimIdx) => {
    const claimId = `claim_${claimIdx}`;
    const unigrams = extractKeywords(claimText);
    const bigrams = extractBigrams(unigrams);
    const claimNumbers = extractNumbers(claimText.toLowerCase());

    const allSnippets: SourceSnippet[] = [];

    for (const paper of papers) {
      const candidates = extractPaperSnippets(unigrams, bigrams, entitySet, claimNumbers, paper);
      for (const candidate of candidates) {
        allSnippets.push({
          snippetId: `${claimId}_${paper.externalId}_${candidate.paragraphIndex}`,
          paperExternalId: paper.externalId,
          paperTitle: paper.title,
          paperYear: paper.year,
          doi: paper.doi,
          openAccessPdfUrl: paper.openAccessPdfUrl,
          paragraphIndex: candidate.paragraphIndex,
          text: candidate.text,
          confidence: Math.round(candidate.score * 1000) / 1000,
          supportType: classifySupportType(candidate.score),
        });
      }
    }

    // Best snippets across all papers, sorted by confidence
    allSnippets.sort((a, b) => b.confidence - a.confidence);

    return {
      claimId,
      claimText,
      evidence: allSnippets.slice(0, MAX_SNIPPETS_PER_CLAIM),
    };
  });
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

export function computeSpanDiagnostics(spans: EvidenceSpan[]): GroundingDiagnostics {
  const totalClaims = spans.length;
  const claimsWithDirectSupport = spans.filter((s) =>
    s.evidence.some((e) => e.supportType === "strongly_supported"),
  ).length;
  const claimsWithAnySupport = spans.filter((s) => s.evidence.length > 0).length;

  const allSnippets = spans.flatMap((s) => s.evidence);
  const avgSnippetConfidence =
    allSnippets.length > 0
      ? Math.round(
          (allSnippets.reduce((sum, s) => sum + s.confidence, 0) / allSnippets.length) * 1000,
        ) / 1000
      : 0;

  return { totalClaims, claimsWithDirectSupport, claimsWithAnySupport, avgSnippetConfidence };
}
