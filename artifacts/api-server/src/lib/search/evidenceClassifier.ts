import type { StudyDesign, PopulationType } from "./types";

const DESIGN_PATTERNS: Array<{ pattern: RegExp; type: StudyDesign; priority: number }> = [
  { pattern: /\bmeta[- ]?analysis\b/i, type: "meta_analysis", priority: 10 },
  { pattern: /\bsystematic review\b/i, type: "systematic_review", priority: 9 },
  {
    pattern:
      /\brandomized controlled trial\b|\brandomised controlled trial\b|\bRCT\b|\bdouble[- ]?blind.*placebo\b|\bplacebo[- ]?controlled.*randomi[sz]ed\b/i,
    type: "rct",
    priority: 8,
  },
  { pattern: /\bclinical trial\b|\brandomized\b|\brandomised\b/i, type: "rct", priority: 7 },
  {
    pattern: /\bcohort study\b|\blongitudinal study\b|\bprospective cohort\b|\bretrospective cohort\b/i,
    type: "cohort",
    priority: 5,
  },
  {
    pattern: /\bcross[- ]?sectional\b/i,
    type: "cross_sectional",
    priority: 4,
  },
  {
    pattern: /\bcase report\b|\bcase series\b|\bcase study\b/i,
    type: "case_report",
    priority: 3,
  },
  {
    pattern: /\beditorial\b|\bcommentary\b|\bletter to the editor\b|\bopinion\b/i,
    type: "editorial",
    priority: 2,
  },
];

const HUMAN_PATTERNS = [
  /\bparticipants\b/i,
  /\bsubjects\b/i,
  /\bpatients\b/i,
  /\badults\b/i,
  /\bvolunteers\b/i,
  /\bhealthy (men|women|adults|individuals)\b/i,
  /\bchildren\b/i,
  /\belderly\b/i,
  /\bhuman subjects\b/i,
];

const ANIMAL_PATTERNS = [
  /\bmice\b/i,
  /\brats\b/i,
  /\bmurine\b/i,
  /\bcanine\b/i,
  /\bprimate\b/i,
  /\bzebrafish\b/i,
  /\banimal model\b/i,
  /\bin vivo\b.*\b(mice|rat|mouse|rodent)/i,
  /\bSprague[- ]Dawley\b/i,
  /\bC57BL\b/i,
];

const IN_VITRO_PATTERNS = [
  /\bin vitro\b/i,
  /\bcell line\b/i,
  /\bcell culture\b/i,
  /\bHeLa\b/,
  /\bHEK293\b/,
  /\bcellular\b/i,
];

const CONFLICTING_PATTERNS = [
  /\bno significant (effect|difference|improvement|change|benefit)\b/i,
  /\bdid not (improve|affect|alter|change|reduce|increase)\b/i,
  /\bfailed to (improve|demonstrate|show|replicate)\b/i,
  /\bnull (result|hypothesis was (not )?rejected)\b/i,
  /\bnot significantly\b/i,
  /\bcontradicts\b/i,
  /\bno evidence (of|for|that)\b/i,
];

export function classifyStudyDesign(
  abstract: string,
  title: string,
  publicationTypes: string | null,
): StudyDesign {
  const text = `${title} ${abstract}`;

  const matched: Array<{ type: StudyDesign; priority: number }> = [];

  for (const { pattern, type, priority } of DESIGN_PATTERNS) {
    if (pattern.test(text)) {
      matched.push({ type, priority });
    }
  }

  if (matched.length === 0) return "unknown";
  matched.sort((a, b) => b.priority - a.priority);
  return matched[0].type;
}

export function classifyPopulationType(
  abstract: string,
  title: string,
): PopulationType {
  const text = `${title} ${abstract}`;

  // In vitro takes precedence over animal if abstract is clearly in vitro
  const inVitroMatches = IN_VITRO_PATTERNS.filter((p) => p.test(text));
  const animalMatches = ANIMAL_PATTERNS.filter((p) => p.test(text));
  const humanMatches = HUMAN_PATTERNS.filter((p) => p.test(text));

  if (inVitroMatches.length > 0 && humanMatches.length === 0 && animalMatches.length === 0) {
    return "in_vitro";
  }
  if (animalMatches.length > 0 && humanMatches.length === 0) {
    return "animal";
  }
  if (humanMatches.length > 0) {
    return "human";
  }
  return "unknown";
}

export function looksConflicting(abstract: string): boolean {
  return CONFLICTING_PATTERNS.some((p) => p.test(abstract));
}
