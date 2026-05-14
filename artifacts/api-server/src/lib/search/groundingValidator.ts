import type { RankedPaper, EvidenceSnapshot, GroundingFlag, GroundingResult } from "./types";

// Numeric claim patterns — each must capture both the value AND its unit/context
const NUMERIC_CLAIM_PATTERNS: Array<{ pattern: RegExp; unitGroup: number }> = [
  { pattern: /(\d+\.?\d*)\s*(g\/kg|gram[s]?\s*per\s*kilogram)/gi, unitGroup: 2 },
  { pattern: /(\d+\.?\d*)\s*(mg|g|mcg|iu|mmol|gram[s]?)\s*(per\s+day|daily|\/day|per\s+week)/gi, unitGroup: 2 },
  { pattern: /(\d+)\s*%\s+(reduction|increase|improvement|decrease)\b/gi, unitGroup: 2 },
  { pattern: /(\d+\.?\d*)\s*(times|fold)\s+(more|less|higher|lower|greater)/gi, unitGroup: 2 },
  { pattern: /(\d+)\s*(?:to|-)\s*(\d+)\s*(mg|g|minutes?|hours?|weeks?|months?)\b/gi, unitGroup: 3 },
  { pattern: /(\d+)\s*(minutes?|hours?)\s+(per|a)\s+(day|week)\b/gi, unitGroup: 2 },
  { pattern: /(\d+\.?\d*)\s*(sessions?|sets?|reps?)\s+(per|a)\s+(week|day)\b/gi, unitGroup: 2 },
  { pattern: /(\d+)\s*(kg|lb[s]?|pound[s]?)\s+(of\s+)?(protein|muscle|lean\s+mass)/gi, unitGroup: 2 },
  // Dosage recommendation patterns — "take X mg", "dose of X mg", "X mg is recommended"
  { pattern: /(?:take|dose\s+of|recommend(?:ed)?|optimal)\s+(\d+\.?\d*)\s*(mg|g|mcg|iu|gram[s]?)/gi, unitGroup: 2 },
  { pattern: /(\d+\.?\d*)\s*(mg|g|mcg|iu)\s+(?:of\s+\w+\s+)?(?:is\s+)?(?:recommended|optimal|suggested|effective)/gi, unitGroup: 2 },
];

// "Studies show/found/demonstrate" patterns — claims attributed to retrieved research
const STUDIES_SHOW_PATTERNS = [
  /studies?\s+(show|found?|demonstrat|suggest|indicat|reveal|confirm)/gi,
  /research\s+(show|found?|demonstrat|suggest|indicat|reveal|confirm)/gi,
  /evidence\s+(show|found?|demonstrat|suggest|indicat|confirm)/gi,
  /trials?\s+(show|found?|demonstrat|suggest|confirm)/gi,
  // Additional patterns for model-prior leakage
  /it\s+(?:is\s+)?(?:well[\s-]known|established|widely\s+accepted)\s+that\b/gi,
  /(?:generally|consistently|reliably)\s+(?:shown?|found?|demonstrat|confirm)/gi,
  /the\s+(?:science|literature|data)\s+(?:consistently\s+)?(?:show|support|suggest)/gi,
];

// Causal language that overstates observational evidence
const CAUSAL_PHRASES = [
  /\bcauses?\s+(?:a\s+)?(?:significant|measurable|meaningful)?\s*(?:improvements?|increases?|decreases?|reductions?)\b/gi,
  /\bproves?\s+that\b/gi,
  /\bconfirms?\s+(?:that\s+)?(?:it|this|the\s+\w+)\b/gi,
  /\bleads?\s+(?:directly\s+)?to\s+(?:improved|better|higher|lower)\b/gi,
  /\bresults?\s+in\s+(?:significant|measurable|demonstrable)\b/gi,
  // Stronger causation language
  /\bdemonstrates?\s+(?:that\s+)?(?:it|this|\w+)\s+(?:directly\s+)?(?:causes?|produces?|drives?)\b/gi,
  /\bhas\s+been\s+(?:proven?|shown?|demonstrated?)\s+to\s+(?:cause|produce|drive|prevent)\b/gi,
];

// Model-prior leakage phrases — claims that sound like general knowledge, not paper-specific
const MODEL_PRIOR_PHRASES = [
  /(?:as\s+we\s+know|as\s+is\s+(?:well\s+)?known|as\s+(?:previously\s+)?established)\b/gi,
  /(?:extensive|overwhelming|robust|substantial)\s+(?:evidence|research|literature)\s+(?:show|support|suggest|confirm)/gi,
  /(?:numerous|many|most|several)\s+studies\s+have\s+(?:shown?|found?|confirmed?|demonstrated?)\b/gi,
  /(?:the\s+)?scientific\s+consensus\s+(?:is|holds?|suggests?|indicates?)\b/gi,
];

// ─── Numeric claim extraction ─────────────────────────────────────────────────

interface NumericClaim {
  text: string;
  value: string;
  unit: string;
}

function extractNumericClaims(text: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  const seen = new Set<string>();

  for (const { pattern, unitGroup } of NUMERIC_CLAIM_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of text.matchAll(pattern)) {
      const value = m[1];
      const unit = m[unitGroup]?.toLowerCase() ?? "";
      if (!value) continue;

      const key = `${value}:${unit}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const start = Math.max(0, m.index! - 50);
      const end = Math.min(text.length, m.index! + m[0].length + 50);
      claims.push({
        text: text.slice(start, end).replace(/\s+/g, " ").trim(),
        value,
        unit,
      });
    }
  }
  return claims;
}

// ─── Grounding check — require value AND unit context in abstract ─────────────

function findGroundingPaper(claim: NumericClaim, papers: RankedPaper[]): string | null {
  for (const paper of papers) {
    const abstract = paper.abstract.toLowerCase();
    if (!abstract.includes(claim.value)) continue;

    // Require either the unit or a synonym near the value
    const unitVariants = buildUnitVariants(claim.unit);
    if (unitVariants.length === 0) {
      // No unit to check — numeric value alone is sufficient
      return paper.externalId;
    }

    // Check that a unit variant appears within 60 characters of the value in the abstract
    const valueIdx = abstract.indexOf(claim.value);
    if (valueIdx === -1) continue;
    const window = abstract.slice(Math.max(0, valueIdx - 60), valueIdx + claim.value.length + 60);
    if (unitVariants.some((v) => window.includes(v))) {
      return paper.externalId;
    }
  }
  return null;
}

function buildUnitVariants(unit: string): string[] {
  const u = unit.toLowerCase().trim();
  if (!u) return [];

  // Unit synonym groups
  const groups: Record<string, string[]> = {
    "g/kg": ["g/kg", "grams per kilogram", "gram per kg", "g per kg", "g/kg/day"],
    "gram": ["g", "gram", "grams", "g/day"],
    "mg": ["mg", "milligram", "milligrams", "mg/day"],
    "mcg": ["mcg", "microgram", "micrograms", "μg"],
    "iu": ["iu", "international unit"],
    "minutes": ["minute", "minutes", "min", "mins"],
    "hours": ["hour", "hours", "hr", "hrs"],
    "weeks": ["week", "weeks", "wk"],
    "months": ["month", "months", "mo"],
    "reduction": ["reduction", "decrease", "lower", "decline", "fell"],
    "increase": ["increase", "higher", "rise", "improvement"],
    "fold": ["fold", "times", "×"],
    "sessions": ["session", "sessions"],
  };

  for (const [key, synonyms] of Object.entries(groups)) {
    if (u.includes(key) || synonyms.some((s) => u.includes(s))) {
      return synonyms;
    }
  }
  return [u];
}

// ─── "Studies show" violation detection ──────────────────────────────────────

function extractStudiesShowClaims(text: string): string[] {
  // First, strip sentences that are labelled inferences — they are
  // explicitly permitted reasoning, not claims about retrieved papers.
  const nonInferenceText = filterLabelledInference(text);

  const claims: string[] = [];
  for (const pattern of STUDIES_SHOW_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of nonInferenceText.matchAll(pattern)) {
      const start = m.index!;
      const end = Math.min(nonInferenceText.length, start + 150);
      claims.push(nonInferenceText.slice(start, end).replace(/\s+/g, " ").trim());
    }
  }
  return [...new Set(claims)];
}

function isStudiesShowClaimGrounded(claim: string, papers: RankedPaper[]): boolean {
  // Extract key nouns/adjectives from the claim and check if any paper abstract supports them
  const words = claim
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !["studies", "found", "shows", "demonstrate", "suggest", "research", "evidence", "trials", "indicate", "reveal", "confirm"].includes(w));

  if (words.length === 0) return true;

  const significantWords = words.slice(0, 6);
  return papers.some((p) => {
    const absLower = p.abstract.toLowerCase();
    const matchCount = significantWords.filter((w) => absLower.includes(w)).length;
    return matchCount >= Math.ceil(significantWords.length * 0.5);
  });
}

// ─── Causal overreach detection ───────────────────────────────────────────────

// Labeled inference phrases — exempt from causal language check because
// they explicitly signal that the statement is inference, not fact.
const LABELLED_INFERENCE_PREFIXES = [
  /^mechanistically[\s,]/i,
  /^from first principles[\s,]/i,
  /^this does not directly prove/i,
  /^this doesn't directly prove/i,
  /^this does not directly show/i,
  /^at a mechanistic level/i,
  /^based on the mechanism/i,
  /^theoretically[\s,]/i,
  /^in theory[\s,]/i,
];

// Split text into sentences, filtering out labeled-inference sentences
// that explicitly signal reasoning rather than factual claims.
// Used by causal overreach, "studies show", and model-prior checks.
function filterLabelledInference(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter(
    (s) => !LABELLED_INFERENCE_PREFIXES.some((p) => p.test(s.trim())),
  ).join(" ");
}

function hasCausalOverreach(synthesisText: string, snapshot: EvidenceSnapshot): boolean {
  const hasStrongDesigns = snapshot.rcts > 0 || snapshot.metaAnalyses > 0;
  if (hasStrongDesigns) return false;

  const nonInferenceText = filterLabelledInference(synthesisText);

  return CAUSAL_PHRASES.some((p) => {
    p.lastIndex = 0;
    return p.test(nonInferenceText);
  });
}

// ─── Model-prior leakage detection ───────────────────────────────────────────

function detectModelPriorLeakage(synthesisText: string): number {
  // Model-prior leakage should only be flagged in sentences that are NOT
  // labelled as inference. Sentences starting with "Mechanistically..." or
  // "From first principles..." are explicitly permitted reasoning.
  const nonInferenceText = filterLabelledInference(synthesisText);

  let count = 0;
  for (const pattern of MODEL_PRIOR_PHRASES) {
    pattern.lastIndex = 0;
    const matches = [...nonInferenceText.matchAll(pattern)];
    count += matches.length;
  }
  return count;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function validateGrounding(
  synthesisText: string,
  papers: RankedPaper[],
  snapshot: EvidenceSnapshot,
): GroundingResult {
  const numericClaims = extractNumericClaims(synthesisText);

  const flags: GroundingFlag[] = numericClaims.map((claim) => {
    const matchedIn = findGroundingPaper(claim, papers);
    return {
      claim: claim.text,
      supported: matchedIn !== null,
      papersChecked: papers.length,
      matchedIn: matchedIn ?? undefined,
    };
  });

  const unsupportedNumericClaims = flags.filter((f) => !f.supported).length;
  const causalOverreach = hasCausalOverreach(synthesisText, snapshot);

  // "Studies show" violations: claimed research backing but no paper supports the specific claim
  const studiesShowClaims = extractStudiesShowClaims(synthesisText);
  const studiesShowViolations = studiesShowClaims.filter(
    (claim) => !isStudiesShowClaimGrounded(claim, papers),
  ).length;

  // Model-prior leakage: language that implies broad consensus not derivable from the retrieved set
  const modelPriorLeakage = detectModelPriorLeakage(synthesisText);

  return {
    flags,
    causalOverreach,
    unsupportedNumericClaims,
    studiesShowViolations,
    modelPriorLeakage,
  };
}
