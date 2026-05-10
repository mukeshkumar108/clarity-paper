export interface EvalQuery {
  id: string;
  query: string;
  category: string;
  notes?: string;
}

export const EVAL_QUERIES: EvalQuery[] = [
  // ── Supplements ──────────────────────────────────────────────────────────
  {
    id: "supp-01",
    query: "does creatine actually help the brain?",
    category: "supplements",
    notes: "Canonical test case. Should find RCTs and meta-analyses.",
  },
  {
    id: "supp-02",
    query: "is magnesium glycinate useful for sleep?",
    category: "supplements",
    notes: "Should distinguish magnesium forms; dose question mixed in.",
  },
  {
    id: "supp-03",
    query: "I heard on a podcast that 20g creatine is good for the brain and Alzheimer's",
    category: "supplements",
    notes: "Claim-check intent. Dose-specific claim. Should flag limited Alzheimer's evidence.",
  },
  {
    id: "supp-04",
    query: "does vitamin D deficiency actually matter",
    category: "supplements",
    notes: "Very common topic. Should find large meta-analyses.",
  },
  {
    id: "supp-05",
    query: "omega-3 fish oil for depression — does it actually work?",
    category: "supplements",
    notes: "Good RCT evidence exists. Mixed results worth surfacing.",
  },
  {
    id: "supp-06",
    query: "is NMN worth taking for longevity",
    category: "supplements",
    notes: "Mostly mechanistic evidence in humans. Should produce preliminary/exploratory result.",
  },
  {
    id: "supp-07",
    query: "ashwagandha for stress and anxiety — what does the evidence say",
    category: "supplements",
    notes: "Some small RCTs exist. Should note study quality limitations.",
  },

  // ── Sleep ─────────────────────────────────────────────────────────────────
  {
    id: "sleep-01",
    query: "what does science say about sleep deprivation and cognitive performance",
    category: "sleep",
    notes: "Well-studied area. Should find strong human evidence.",
  },
  {
    id: "sleep-02",
    query: "does melatonin actually improve sleep quality",
    category: "sleep",
    notes: "Should distinguish dose effects and sleep initiation vs duration.",
  },
  {
    id: "sleep-03",
    query: "blue light before bed ruins sleep — is this actually proven",
    category: "sleep",
    notes: "Claim-check. Evidence is more mixed than popular press suggests.",
  },

  // ── Mental health ─────────────────────────────────────────────────────────
  {
    id: "mental-01",
    query: "tell me about meditation and anxiety",
    category: "mental_health",
    notes: "Topic exploration. Wide evidence base.",
  },
  {
    id: "mental-02",
    query: "does exercise help with depression as much as antidepressants?",
    category: "mental_health",
    notes: "Comparative claim. Should note RCT limitations in exercise trials.",
  },
  {
    id: "mental-03",
    query: "what is the evidence for psychedelics in treating PTSD",
    category: "mental_health",
    notes: "Emerging area. Should surface phase 2/3 trials. Mostly promising/preliminary.",
  },
  {
    id: "mental-04",
    query: "gut microbiome and depression — is the connection real",
    category: "mental_health",
    notes: "Mechanistic evidence is strong; human intervention RCTs are thin.",
  },

  // ── Nutrition ─────────────────────────────────────────────────────────────
  {
    id: "nutr-01",
    query: "what does science actually say about fasting?",
    category: "nutrition",
    notes: "Broad topic. Should bucket different fasting types and outcomes.",
  },
  {
    id: "nutr-02",
    query: "is red meat actually bad for you",
    category: "nutrition",
    notes: "Contested area. Should surface conflicting findings prominently.",
  },
  {
    id: "nutr-03",
    query: "does eating breakfast matter for weight loss",
    category: "nutrition",
    notes: "Claim-check. RCT evidence doesn't strongly support breakfast myth.",
  },
  {
    id: "nutr-04",
    query: "protein intake for muscle growth — how much is actually enough",
    category: "nutrition",
    notes: "Dose question. Good meta-analysis evidence exists.",
  },

  // ── Longevity ─────────────────────────────────────────────────────────────
  {
    id: "long-01",
    query: "what are the strongest lifestyle factors for a longer life",
    category: "longevity",
    notes: "Broad topic exploration. Should find Lancet/NEJM quality cohort studies.",
  },
  {
    id: "long-02",
    query: "does calorie restriction extend lifespan in humans",
    category: "longevity",
    notes: "Mostly animal evidence. Should clearly separate mechanistic from human evidence.",
  },
  {
    id: "long-03",
    query: "rapamycin for longevity in humans — what is actually known",
    category: "longevity",
    notes: "Mostly animal/mechanistic. Very limited human data should trigger honest caveat.",
  },

  // ── Fitness ───────────────────────────────────────────────────────────────
  {
    id: "fit-01",
    query: "is cold exposure and ice baths real or hype?",
    category: "fitness",
    notes: "Claim-check. Some evidence for performance recovery, inflammation mixed.",
  },
  {
    id: "fit-02",
    query: "how much does strength training reduce all-cause mortality",
    category: "fitness",
    notes: "Large cohort studies exist. Should produce moderate-strong evidence.",
  },
  {
    id: "fit-03",
    query: "does zone 2 cardio training have specific benefits over other intensities",
    category: "fitness",
    notes: "Mechanistic case strong; RCTs on humans comparing zones are limited.",
  },

  // ── Claim-checking ────────────────────────────────────────────────────────
  {
    id: "claim-01",
    query: "I saw online that seed oils cause inflammation and are toxic",
    category: "claim_check",
    notes: "Should clearly separate mechanistic omega-6 claims from human RCT evidence.",
  },
  {
    id: "claim-02",
    query: "is there evidence that social media causes depression in teenagers",
    category: "claim_check",
    notes: "Contested. Cross-sectional dominates; few RCTs. Should note causation limits.",
  },
  {
    id: "claim-03",
    query: "someone told me 10000 steps a day is necessary for health benefits",
    category: "claim_check",
    notes: "Origin is marketing claim. Steps research has clear dose-response data.",
  },
];
