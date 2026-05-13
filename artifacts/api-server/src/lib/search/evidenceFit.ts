import type { RankedPaper, ResearchPlan, EvidenceFit, EvidenceFitLabel } from "./types";
import { looksConflicting } from "./evidenceClassifier";
import { DISEASE_TITLE_TERMS } from "./retrievalJudge";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function hasDiseaseBleed(title: string, userQuestion: string): boolean {
  const titleLower = title.toLowerCase();
  const questionLower = userQuestion.toLowerCase();
  return DISEASE_TITLE_TERMS.some(
    (term) => titleLower.includes(term) && !questionLower.includes(term),
  );
}

function evaluateInterventionMatch(
  title: string,
  abstract: string,
  entities: string[],
): EvidenceFit["interventionMatch"] {
  if (entities.length === 0) return "different";

  const titleLower = title.toLowerCase();
  const abstractLower = abstract.toLowerCase();
  const primary = entities[0].toLowerCase();

  // Exact: primary entity appears verbatim in title
  if (titleLower.includes(primary)) return "exact";

  // Close: primary entity in abstract, with at least one secondary entity in title
  const secondaryInTitle = entities.slice(1).some((e) => titleLower.includes(e.toLowerCase()));
  if (abstractLower.includes(primary) && secondaryInTitle) return "close";

  // Close: primary entity in abstract, abstract has good entity density
  if (abstractLower.includes(primary)) {
    const entityHits = entities.filter((e) => abstractLower.includes(e.toLowerCase())).length;
    if (entityHits >= Math.ceil(entities.length * 0.5)) return "close";
  }

  // Broader class: entity token overlap in title
  const primaryTokens = tokenize(primary);
  const titleTokens = tokenize(titleLower);
  const tokenOverlap = [...primaryTokens].filter((t) => titleTokens.has(t)).length;
  if (tokenOverlap > 0 && primaryTokens.size > 0 && tokenOverlap / primaryTokens.size >= 0.4) {
    return "broader_class";
  }

  // Broader class: any entity token appears in abstract
  if (entities.some((e) => {
    const eTokens = tokenize(e);
    const hits = [...eTokens].filter((t) => abstractLower.includes(t)).length;
    return hits > 0 && eTokens.size > 0 && hits / eTokens.size >= 0.4;
  })) {
    return "broader_class";
  }

  return "different";
}

function evaluateOutcomeMatch(
  abstract: string,
  hiddenGoals: string[],
  entities: string[],
): EvidenceFit["outcomeMatch"] {
  if (hiddenGoals.length === 0 && entities.length <= 1) return "related";

  const abstractLower = abstract.toLowerCase();
  const targets = hiddenGoals.length > 0 ? hiddenGoals : entities;

  // Exact: 2+ hidden goals appear in abstract, or primary outcome phrase appears
  const goalHits = targets.filter((g) => abstractLower.includes(g.toLowerCase()));
  if (goalHits.length >= 2 || (goalHits.length >= 1 && targets.length === 1)) {
    return "exact";
  }

  // Related: at least one target appears
  if (goalHits.length >= 1) return "related";

  // Related: secondary entities appear (the paper is in the same domain)
  const secondaryEntityHits = entities.slice(1).filter((e) => abstractLower.includes(e.toLowerCase()));
  if (secondaryEntityHits.length > 0) return "related";

  return "different";
}

function evaluatePopulationMatch(
  title: string,
  abstract: string,
  plan: ResearchPlan,
): EvidenceFit["populationMatch"] {
  const queryLower = (plan.normalizedEnglishQuestion || plan.userQuestion).toLowerCase();

  // If paper has disease bleed and user didn't ask about that disease
  if (hasDiseaseBleed(title, plan.normalizedEnglishQuestion || plan.userQuestion)) {
    return "different";
  }

  // Population constraint check: if planner specified populations, check them
  if (plan.inclusionCriteria?.length) {
    const text = `${title} ${abstract}`.toLowerCase();
    const inclusionHits = plan.inclusionCriteria.filter((c) => text.includes(c.toLowerCase()));
    if (inclusionHits.length === 0) return "different";
    if (inclusionHits.length >= plan.inclusionCriteria.length * 0.5) return "exact";
    return "overlapping";
  }

  // Default: if the query mentions specific populations
  const populationSignals = ["men", "women", "adults", "children", "elderly", "healthy", "patients"];
  const queryHasPop = populationSignals.some((p) => queryLower.includes(p));
  if (!queryHasPop) return "overlapping";

  const titleLower = title.toLowerCase();
  const popMatch = populationSignals.filter((p) => queryLower.includes(p) && titleLower.includes(p));
  if (popMatch.length > 0) return "exact";

  return "overlapping";
}

function evaluateFindingDirection(
  abstract: string,
  entities: string[],
): EvidenceFit["findingDirection"] {
  if (entities.length === 0) return "unrelated";

  const abstractLower = abstract.toLowerCase();
  const primaryPresent = entities.some((e) => abstractLower.includes(e.toLowerCase()));
  if (!primaryPresent) return "unrelated";

  const isConflicting = looksConflicting(abstract);

  // Positive finding signals
  const positivePatterns = [
    /\bsignificant\s+(improvement|reduction|increase|decrease|benefit|effect)\b/i,
    /\beffective\b/i,
    /\bbeneficial\b/i,
    /\bimproved\b/i,
    /\breduced\b/i,
    /\bsuperior\b/i,
  ];
  const hasPositive = positivePatterns.some((p) => p.test(abstract));

  if (hasPositive && !isConflicting) return "supports_claim";
  if (hasPositive && isConflicting) return "mixed";
  if (!hasPositive && isConflicting) return "contradicts";
  if (!hasPositive && !isConflicting) return "mixed";

  return "mixed";
}

function isHeadToHeadComparison(
  title: string,
  abstract: string,
  plan: ResearchPlan,
): boolean {
  if (!plan.isComparison) return false;
  if (!plan.comparisonTarget) return false;

  const text = `${title} ${abstract}`.toLowerCase();
  const target = plan.comparisonTarget.toLowerCase();

  const comparisonPatterns = [
    /\bvs\.?\b/,
    /\bversus\b/,
    /\bcompared\s+(to|with)\b/,
    /\bcomparison\b/,
    /\bhead[\s-]to[\s-]head\b/,
  ];

  const hasComparisonLanguage = comparisonPatterns.some((p) => p.test(text));
  const mentionsTarget = text.includes(target);

  return hasComparisonLanguage && mentionsTarget;
}

function computeOverallFit(fit: Omit<EvidenceFit, "overall">): EvidenceFitLabel {
  const { interventionMatch, outcomeMatch, populationMatch, findingDirection, isHeadToHead } = fit;

  // For comparison intents: head-to-head is what matters most
  if (isHeadToHead && interventionMatch !== "different" && populationMatch !== "different") {
    return "direct";
  }

  // Direct: intervention exact or close, outcome exact or related, population not different, finding supports or mixed
  if (
    (interventionMatch === "exact" || interventionMatch === "close") &&
    (outcomeMatch === "exact" || outcomeMatch === "related") &&
    populationMatch !== "different" &&
    (findingDirection === "supports_claim" || findingDirection === "mixed")
  ) {
    return "direct";
  }

  // Adjacent: intervention close or broader, outcome related, no major population mismatch
  if (
    (interventionMatch === "close" || interventionMatch === "broader_class") &&
    (outcomeMatch === "exact" || outcomeMatch === "related") &&
    populationMatch !== "different"
  ) {
    return "adjacent";
  }

  // Adjacent: good intervention + outcome but null/contradicting findings (still useful evidence)
  if (
    (interventionMatch === "exact" || interventionMatch === "close") &&
    (outcomeMatch === "exact" || outcomeMatch === "related") &&
    populationMatch !== "different" &&
    (findingDirection === "null" || findingDirection === "contradicts")
  ) {
    return "adjacent";
  }

  // Weak: intervention broader_class or different, OR population mismatch
  if (
    interventionMatch === "broader_class" ||
    outcomeMatch === "different" ||
    populationMatch === "different"
  ) {
    return "weak";
  }

  // Mismatch: intervention different with no outcome overlap
  if (interventionMatch === "different" || findingDirection === "unrelated") {
    return "mismatch";
  }

  return "weak";
}

export function evaluateEvidenceFit(paper: RankedPaper, plan: ResearchPlan): EvidenceFit {
  const interventionMatch = evaluateInterventionMatch(paper.title, paper.abstract, plan.entities);
  const outcomeMatch = evaluateOutcomeMatch(paper.abstract, plan.hiddenGoals, plan.entities);
  const populationMatch = evaluatePopulationMatch(paper.title, paper.abstract, plan);
  const findingDirection = evaluateFindingDirection(paper.abstract, plan.entities);
  const isHeadToHead = isHeadToHeadComparison(paper.title, paper.abstract, plan);

  const partial: Omit<EvidenceFit, "overall"> = {
    interventionMatch,
    outcomeMatch,
    populationMatch,
    findingDirection,
    isHeadToHead,
  };

  return {
    ...partial,
    overall: computeOverallFit(partial),
  };
}
