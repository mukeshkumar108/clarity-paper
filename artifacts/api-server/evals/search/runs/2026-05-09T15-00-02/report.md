# Clarity Search — Eval Report

**Run:** 2026-05-09T15-00-02
**Queries evaluated:** 10 (9 succeeded, 1 failed)
**Total latency:** 1714.6s
**Average latency per query:** 171.5s
**Median latency per query:** 71.0s
**Average papers per result:** 10.0
**Repair loop triggered:** 7/10 queries
**Grounding issues detected:** 1/10 queries

**Confidence distribution:**
- promising: 2
- preliminary: 4
- moderate: 3

**Initial retrieval quality distribution:**
- weak: 5
- acceptable: 1
- failed: 3

---

## Failed Queries

- **sleep-02** `does melatonin actually improve sleep quality` — terminated

---

## supp-02: supplements

**Query:** is magnesium glycinate useful for sleep?
**Context:** Should distinguish magnesium forms; dose question mixed in.

### Planner output

**Intent:** `claim_check`
**Entities:** magnesium glycinate, sleep
**Hidden goals:** sleep quality, sleep onset latency, sleep duration, insomnia, sleep disorders, anxiety, relaxation

**Query variants (5):**
- magnesium glycinate sleep quality randomized controlled trial
- magnesium glycinate insomnia treatment
- magnesium glycinate sleep mechanism GABA
- magnesium glycinate sleep onset latency adults
- magnesium forms sleep comparison

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 35 |
| After dedup | 27 |
| After guideline filter | 26 |
| Ranked (top 10) | 10 |
| Source: openalex | 35 |

### Retrieval quality

**Initial quality:** 🔴 weak — score: **0.252**
- top5Align=0.435 interventionMatch=0.000 popMatch=1.000 evidenceBonus=1.000
- penalties: offTopic=-0.080 guideline=0.000 conflation=0.000 diseaseBleed=-0.070
**Trigger repair:** yes — critical issue(s): off_topic_high_citation
**Issues detected:**
- `[critical] off_topic_high_citation`: 1 off-topic paper(s) in top 5, 1 with high citation authority

**⟳ Repair loop triggered** — strategy: `tighten_around_intervention`
- Original score: 0.252 → Repaired score: 0.252
- Decision: repaired score 0.252 did not improve over original 0.252 (threshold: 0.05)
**Repair queries used:**
- magnesium glycinate sleep efficacy
- magnesium glycinate sleep randomized controlled trial
- magnesium glycinate sleep outcomes
- magnesium glycinate sleep intervention
**Papers before repair:** 10 → **after:** 10
**Final quality:** 🔴 weak — score: 0.252

**Grounding validation:** ✅ clean

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 3 |
| Human RCTs | 4 |
| Human observational | 4 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `promising`
**No evidence:** No
**Latency:** 70.2s

### Synthesis

> The evidence on magnesium glycinate specifically for sleep is very limited — most studies use other forms like magnesium oxide or citrate. Overall, magnesium supplementation shows a modest, inconsistent benefit for sleep quality, mainly in people with low magnesium levels or specific health conditions like depression or PCOS. A 2024 systematic review found that while some studies report small improvements in sleep, the evidence is not strong enough to make a general recommendation, and we don't know if glycinate is better than other forms.

**Follow-up options generated:**
- What form of magnesium has the most evidence for sleep?
- How does magnesium compare to melatonin or other sleep aids?
- Are there any risks of taking magnesium long-term for sleep?
- What dose of magnesium was used in the studies that did find a sleep benefit?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Examining the Effects of Supplemental Magnesium on Self-Reported Anxie… | 2024 | systematic_review | strongest | 0.89 |
| 2 | Evidence‐Based Integrative Treatments for Headache | 2019 | systematic_review | strongest | 0.87 |
| 3 | Effect of magnesium supplementation in improving hyperandrogenism, hir… | 2022 | rct | strongest | 0.80 |
| 4 | Vitamin/mineral/micronutrient supplement for autism spectrum disorders… | 2022 | rct | strongest | 0.76 |
| 5 | Understanding nutrition, depression and mental illnesses | 2008 | rct | strongest | 0.72 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## supp-03: supplements

**Query:** I heard on a podcast that 20g creatine is good for the brain and Alzheimer's
**Context:** Claim-check intent. Dose-specific claim. Should flag limited Alzheimer's evidence.

### Planner output

**Intent:** `claim_check`
**Entities:** creatine, 20g creatine, cognitive performance, Alzheimer's disease
**Hidden goals:** neuroprotection, cognitive decline prevention, safety of high-dose creatine, mechanisms of creatine in brain health, creatine for specific cognitive functions

**Query variants (5):**
- creatine 20g cognitive function randomized controlled trial
- creatine Alzheimer's disease prevention clinical study
- high dose creatine brain health safety side effects
- creatine neuroprotection mechanisms Alzheimer's
- creatine supplementation memory elderly Alzheimer's

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 31 |
| After dedup | 26 |
| After guideline filter | 25 |
| Ranked (top 10) | 10 |
| Source: openalex | 31 |

### Retrieval quality

**Initial quality:** 🔴 weak — score: **0.145**
- top5Align=0.215 interventionMatch=0.200 popMatch=1.000 evidenceBonus=1.000
- penalties: offTopic=-0.080 guideline=0.000 conflation=0.000 diseaseBleed=-0.140
**Trigger repair:** yes — critical issue(s): off_topic_high_citation
**Issues detected:**
- `[critical] off_topic_high_citation`: 1 off-topic paper(s) in top 5, 1 with high citation authority
- `[minor] population_mismatch`: 2 top-5 paper(s) have population mismatch (disease-specific or animal when query is general)

**⟳ Repair loop triggered** — strategy: `tighten_around_intervention`
- Original score: 0.145 → Repaired score: 0.167
- Decision: repaired score 0.167 did not improve over original 0.145 (threshold: 0.05)
**Repair queries used:**
- 20g creatine cognitive performance Alzheimer's disease
- high dose creatine Alzheimer's disease cognition
- creatine supplementation 20g Alzheimer's brain function
- creatine 20g neuroprotection Alzheimer's clinical trial
**Papers before repair:** 10 → **after:** 10
**Final quality:** 🔴 weak — score: 0.145

**Grounding validation:** ✅ clean

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 1 |
| Human RCTs | 4 |
| Human observational | 6 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `preliminary`
**No evidence:** No
**Latency:** 84.9s

### Synthesis

> The claim that 20 grams of creatine is good for the brain and Alzheimer's isn't directly supported by human evidence. Most research on creatine and brain health has explored its potential for conditions like depression or age-related muscle loss, not Alzheimer's disease specifically, and the few Alzheimer's studies that exist have used antioxidants generally, not creatine. I found no human studies testing a 20-gram dose for cognitive benefits or Alzheimer's; typical creatine studies for muscle or mood use lower doses, and high-dose effects on the brain are unknown. The idea likely stems from creatine's role in cellular energy, but there's no clinical data to back up this specific podcast claim.

**Follow-up options generated:**
- What does the research actually say about creatine for memory or thinking in healthy people?
- Are there any studies on high-dose creatine for other brain conditions, like traumatic brain injury?
- What's the difference between the muscle and brain effects of creatine, and why might the dose matter?
- Could creatine be more relevant for early cognitive decline rather than full Alzheimer's?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Management of Immune-Related Adverse Events in Patients Treated With I… | 2021 | systematic_review | strongest | 0.81 |
| 2 | Antioxidant strategies for Alzheimer's disease | 2002 | rct | strongest | 0.73 |
| 3 | Can Creatine Supplementation Improve Body Composition and Objective Ph… | 2015 | rct | strongest | 0.73 |
| 4 | The Effects of Normal as Compared with Low Hematocrit Values in Patien… | 1998 | rct | strongest | 0.68 |
| 5 | Global, regional, and national comparative risk assessment of 79 behav… | 2016 | rct | human_observational | 0.63 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## supp-06: supplements

**Query:** is NMN worth taking for longevity
**Context:** Mostly mechanistic evidence in humans. Should produce preliminary/exploratory result.

### Planner output

**Intent:** `claim_check`
**Entities:** NMN, longevity
**Hidden goals:** anti-aging, NAD+ levels, cellular health, metabolic health, human trials, safety

**Query variants (5):**
- NMN supplementation human trials longevity
- nicotinamide mononucleotide anti-aging mechanisms
- NMN NAD+ metabolism aging
- NMN clinical studies lifespan extension
- safety profile NMN long-term use

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 34 |
| After dedup | 28 |
| After guideline filter | 28 |
| Ranked (top 10) | 10 |
| Source: semantic_scholar | 7 |
| Source: openalex | 27 |

### Retrieval quality

**Initial quality:** 🔴 weak — score: **0.283**
- top5Align=0.210 interventionMatch=0.600 popMatch=1.000 evidenceBonus=1.000
- penalties: offTopic=-0.080 guideline=0.000 conflation=-0.080 diseaseBleed=0.000
**Trigger repair:** yes — critical issue(s): off_topic_high_citation
**Issues detected:**
- `[critical] off_topic_high_citation`: 1 off-topic paper(s) in top 5, 1 with high citation authority
- `[major] intervention_or_entity_conflation`: 1 top-5 paper(s) appear to cover a different entity than the one queried

**⟳ Repair loop triggered** — strategy: `tighten_around_intervention`
- Original score: 0.283 → Repaired score: 0.090
- Decision: repaired score 0.090 did not improve over original 0.283 (threshold: 0.05)
**Repair queries used:**
- NMN human clinical trials longevity outcomes
- nicotinamide mononucleotide supplementation lifespan extension human
- NMN anti-aging effects human studies
- NMN efficacy longevity human
**Papers before repair:** 10 → **after:** 10
**Final quality:** 🔴 weak — score: 0.283

**Grounding validation:** ✅ clean

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 2 |
| Human RCTs | 4 |
| Human observational | 5 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `preliminary`
**No evidence:** No
**Latency:** 96.4s

### Synthesis

> The evidence for NMN's longevity benefits in humans is still preliminary. While NMN supplementation reliably increases NAD+ levels in the blood, which is a key molecule linked to aging, the direct evidence that this translates into longer life or slowed aging in people is lacking. Most human studies are short-term and focus on safety and markers like physical performance, not actual lifespan. So, while it's a promising area of research, we don't yet have strong human evidence that taking NMN is 'worth it' for longevity.

**Follow-up options generated:**
- How does NMN compare to other NAD+ boosters like nicotinamide riboside (NR)?
- What are the known side effects or safety concerns with long-term NMN use?
- Are there any human studies looking at NMN's effect on specific age-related diseases, like heart or brain health?
- What dose of NMN has been used in human trials, and how was it taken?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | EFFICACY OF NICOTINAMIDE MONONUCLEOTIDE SUPPLEMENTATION (NMN) IN BLOOD… | 2024 | systematic_review | strongest | 0.85 |
| 2 | A nonrandomized study of single oral supplementation within the daily … | 2020 | rct | strongest | 0.83 |
| 3 | Improved Physical Performance Parameters in Patients Taking Nicotinami… | 2024 | systematic_review | strongest | 0.80 |
| 4 | The efficacy and safety of β-nicotinamide mononucleotide (NMN) supplem… | 2022 | rct | strongest | 0.78 |
| 5 | Chronic nicotinamide riboside supplementation is well-tolerated and el… | 2018 | rct | strongest | 0.74 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## sleep-02: sleep

**Query:** does melatonin actually improve sleep quality
**Context:** Should distinguish dose effects and sleep initiation vs duration.

> ⚠️ **Failed:** terminated
> Latency: 1023.8s

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## sleep-03: sleep

**Query:** blue light before bed ruins sleep — is this actually proven
**Context:** Claim-check. Evidence is more mixed than popular press suggests.

### Planner output

**Intent:** `claim_check`
**Entities:** blue light exposure, sleep quality, circadian rhythm, melatonin suppression
**Hidden goals:** sleep onset latency, sleep duration, sleep architecture, subjective sleep quality, objective sleep measures, impact of electronic devices, mechanisms of action

**Query variants (5):**
- blue light exposure sleep quality meta-analysis
- electronic device use bedtime sleep disturbance randomized controlled trial
- blue light melatonin suppression human studies
- circadian rhythm disruption blue light sleep outcomes
- blue light filtering glasses sleep improvement

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 31 |
| After dedup | 29 |
| After guideline filter | 26 |
| Ranked (top 10) | 10 |
| Source: openalex | 31 |

### Retrieval quality

**Initial quality:** ⚠️ acceptable — score: **0.372**
- top5Align=0.347 interventionMatch=0.000 popMatch=1.000 evidenceBonus=1.000
- penalties: offTopic=0.000 guideline=0.000 conflation=0.000 diseaseBleed=0.000
**Trigger repair:** no

**Grounding validation:** ✅ clean

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 6 |
| Human observational | 5 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 67.6s

### Synthesis

> The evidence is pretty clear that blue light before bed can disrupt your sleep, but the story is more nuanced than 'blue light ruins sleep.' Strong mechanistic studies show that blue-wavelength light powerfully suppresses melatonin, a hormone that helps regulate sleep. A meta-analysis of observational studies found that children who use screens near bedtime tend to have worse sleep, though this shows a correlation, not necessarily that the blue light itself is the sole cause. However, a recent systematic review of clinical trials found that blue-light filtering glasses don't seem to improve sleep quality for most adults, which suggests that the light from screens might not be strong enough to cause major problems on its own, or that other factors like mental stimulation from the device play a big role.

**Follow-up options generated:**
- What's the difference between blue light from screens and blue light from the sun?
- Are blue-light blocking glasses worth it, or are there better ways to protect sleep?
- How late in the evening should I really put my phone away to make a difference?
- Does the brightness of the screen matter as much as the color of the light?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Blue-light filtering spectacle lenses for visual performance, sleep, a… | 2023 | systematic_review | strongest | 0.86 |
| 2 | Management Recommendations on Sleep Disturbance of Patients with Parki… | 2018 | meta_analysis | strongest | 0.83 |
| 3 | Circadian rhythm sleep-wake disorders (CRSWDs): Linking circadian misa… | 2020 | meta_analysis | strongest | 0.82 |
| 4 | Association Between Portable Screen-Based Media Device Access or Use a… | 2016 | meta_analysis | strongest | 0.82 |
| 5 | Systematic review of light exposure impact on human circadian rhythm | 2018 | systematic_review | strongest | 0.81 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## nutr-04: nutrition

**Query:** protein intake for muscle growth — how much is actually enough
**Context:** Dose question. Good meta-analysis evidence exists.

### Planner output

**Intent:** `dose_question`
**Entities:** protein intake, muscle growth
**Hidden goals:** optimal protein dosage, muscle protein synthesis, resistance training, body composition, protein timing, protein sources

**Query variants (6):**
- optimal protein intake muscle hypertrophy randomized controlled trial
- protein requirements resistance trained individuals muscle gain
- protein dose muscle protein synthesis maximum
- high protein intake safety kidney function
- protein intake elderly muscle mass retention
- protein timing muscle growth

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 39 |
| After dedup | 34 |
| After guideline filter | 33 |
| Ranked (top 10) | 10 |
| Source: openalex | 39 |

### Retrieval quality

**Initial quality:** ❌ failed — score: **0.009**
- top5Align=0.170 interventionMatch=0.000 popMatch=1.000 evidenceBonus=1.000
- penalties: offTopic=-0.160 guideline=0.000 conflation=0.000 diseaseBleed=-0.140
**Trigger repair:** yes — critical issue(s): off_topic_high_citation
**Issues detected:**
- `[critical] off_topic_high_citation`: 2 off-topic paper(s) in top 5, 2 with high citation authority
- `[minor] population_mismatch`: 2 top-5 paper(s) have population mismatch (disease-specific or animal when query is general)
- `[major] missing_canonical_evidence_likely`: Top-3 papers all have low topical relevance — canonical papers for this query may not have been retrieved

**⟳ Repair loop triggered** — strategy: `tighten_around_intervention`
- Original score: 0.009 → Repaired score: 0.208
- Decision: repaired score 0.208 > original 0.009 + threshold
**Repair queries used:**
- protein intake muscle hypertrophy dose response
- optimal protein intake resistance training muscle gain
- protein requirements muscle protein synthesis skeletal muscle growth
**Papers before repair:** 10 → **after:** 10
**Final quality:** 🔴 weak — score: 0.208

**Grounding validation:** ⚠️ 2 unsupported numeric
**Unsupported numeric claims:**
- `e reviews, a daily protein intake in the range of 1.6 grams per kilogram of body weight is often cited as sufficient to `
- `ance training. Some reviews suggest intakes up to 2.2 g/kg may be helpful for leaner individuals or during c`

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Human RCTs | 1 |
| Human observational | 9 |
| **Total** | **10** |

**Overall confidence:** `promising`
**Synthesis confidence:** `preliminary`
**No evidence:** No
**Latency:** 71.0s

### Synthesis

> Based on narrative reviews, a daily protein intake in the range of 1.6 grams per kilogram of body weight is often cited as sufficient to maximize muscle protein synthesis when paired with resistance training. Some reviews suggest intakes up to 2.2 g/kg may be helpful for leaner individuals or during caloric deficits, but these figures come from aggregating small studies rather than consistent dose-response meta-analyses. The available evidence in these papers is correlational, drawing on lab-based measurements of muscle protein synthesis rather than long-term randomized trials of different protein doses, so the exact 'enough' amount remains a preliminary estimate.

**Follow-up options generated:**
- What’s the most effective timing for protein intake around a workout?
- Is animal protein better than plant protein for muscle building?
- How do protein needs for muscle growth change with age?
- Can very high protein intakes be harmful, and if so, at what level?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | A.S.P.E.N. Clinical Guidelines: Nutrition Support of the Critically Il… | 2009 | rct | strongest | 0.70 |
| 2 | Recent Perspectives Regarding the Role of Dietary Protein for the Prom… | 2018 | unknown | human_observational | 0.68 |
| 3 | Nutritional interventions to augment resistance training-induced skele… | 2015 | unknown | human_observational | 0.61 |
| 4 | Protein Nutrition, Exercise and Aging | 2004 | unknown | human_observational | 0.58 |
| 5 | A focus on leucine in the nutritional regulation of human skeletal mus… | 2023 | unknown | human_observational | 0.57 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## long-01: longevity

**Query:** what are the strongest lifestyle factors for a longer life
**Context:** Broad topic exploration. Should find Lancet/NEJM quality cohort studies.

### Planner output

**Intent:** `topic_exploration`
**Entities:** lifestyle factors, longevity, lifespan
**Hidden goals:** mortality reduction, healthy aging, disease prevention, quality of life in old age

**Query variants (6):**
- lifestyle interventions all-cause mortality meta-analysis
- dietary patterns longevity prospective cohort
- physical activity lifespan systematic review
- social connection mortality risk
- sleep duration healthy aging
- stress management telomere length

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 38 |
| After dedup | 38 |
| After guideline filter | 35 |
| Ranked (top 10) | 10 |
| Source: openalex | 38 |

### Retrieval quality

**Initial quality:** 🔴 weak — score: **0.342**
- top5Align=0.263 interventionMatch=0.000 popMatch=1.000 evidenceBonus=1.000
- penalties: offTopic=0.000 guideline=0.000 conflation=0.000 diseaseBleed=0.000
**Trigger repair:** no

**Grounding validation:** ✅ clean

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 7 |
| Human RCTs | 3 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 70.7s

### Synthesis

> The strongest evidence points to comprehensive lifestyle changes—particularly combining a healthy diet, regular physical activity, and not smoking—as the most effective way to reduce the risk of early death. Meta-analyses of randomized trials show that intensive lifestyle interventions can lower all-cause and cardiovascular mortality in people with prediabetes, type 2 diabetes, or heart disease. Replacing saturated fat with polyunsaturated fat also appears to reduce cardiovascular events, which may extend life. While physical activity alone is consistently linked to better brain health and mental well-being, its direct impact on lifespan is best supported when part of a broader healthy lifestyle.

**Follow-up options generated:**
- How much exercise is enough to see a longevity benefit?
- What specific diet patterns are linked to longer life?
- Does stress management really affect how long you live?
- How does sleep duration impact lifespan?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | How physical activity context relates to cognition across the lifespan… | 2025 | meta_analysis | strongest | 0.91 |
| 2 | Effects of reducing sedentary behaviour by increasing physical activit… | 2024 | meta_analysis | strongest | 0.90 |
| 3 | Mechanisms Linking Physical Activity with Psychiatric Symptoms Across … | 2023 | systematic_review | strongest | 0.86 |
| 4 | Long-term Effect of Lifestyle Interventions on the Cardiovascular and … | 2022 | meta_analysis | strongest | 0.84 |
| 5 | Physical activity correlates across the lifespan in people with epilep… | 2019 | systematic_review | strongest | 0.81 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## long-03: longevity

**Query:** rapamycin for longevity in humans — what is actually known
**Context:** Mostly animal/mechanistic. Very limited human data should trigger honest caveat.

### Planner output

**Intent:** `topic_exploration`
**Entities:** rapamycin, longevity, humans
**Hidden goals:** anti-aging mechanisms, healthspan, age-related diseases, side effects, clinical trials

**Query variants (5):**
- rapamycin human clinical trials longevity
- rapamycin anti-aging mechanisms humans
- rapamycin healthspan markers human studies
- rapamycin side effects long-term human use
- rapamycin age-related disease prevention humans

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 26 |
| After dedup | 23 |
| After guideline filter | 22 |
| Ranked (top 10) | 10 |
| Source: openalex | 26 |

### Retrieval quality

**Initial quality:** 🔴 weak — score: **0.246**
- top5Align=0.293 interventionMatch=0.200 popMatch=1.000 evidenceBonus=0.333
- penalties: offTopic=-0.080 guideline=0.000 conflation=0.000 diseaseBleed=0.000
**Trigger repair:** yes — critical issue(s): off_topic_high_citation
**Issues detected:**
- `[critical] off_topic_high_citation`: 1 off-topic paper(s) in top 5, 1 with high citation authority

**⟳ Repair loop triggered** — strategy: `tighten_around_intervention`
- Original score: 0.246 → Repaired score: 0.569
- Decision: repaired score 0.569 > original 0.246 + threshold
**Repair queries used:**
- rapamycin human longevity clinical trials
- rapamycin human lifespan extension studies
- rapamycin human aging biomarkers clinical
- rapamycin human healthspan outcomes
**Papers before repair:** 10 → **after:** 10
**Final quality:** ⚠️ acceptable — score: 0.569

**Grounding validation:** ✅ clean

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Human RCTs | 3 |
| Human observational | 7 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `promising`
**No evidence:** No
**Latency:** 57.4s

### Synthesis

> The strongest human evidence on rapamycin for longevity comes from a few small, short-term clinical trials, not from studies that directly measured lifespan. A 48-week placebo-controlled trial in healthy older adults found that intermittent low-dose rapamycin (5–10 mg weekly) appeared safe and was linked to improvements in some healthspan markers like visceral fat, but it did not assess longevity itself. A separate small pilot trial in people with early Alzheimer’s showed that daily rapamycin was tolerated and hinted at possible brain-related benefits, though these are very early signals. Overall, we have promising but preliminary data on safety and certain aging biomarkers in humans, and no direct evidence that rapamycin extends human life.

**Follow-up options generated:**
- What are the known side effects of rapamycin in humans, especially with long-term use?
- How does rapamycin compare to other potential anti-aging drugs like metformin?
- Are there any ongoing large-scale trials testing rapamycin for longevity or healthspan?
- What specific aging biomarkers did the rapamycin trials measure, and how meaningful are they?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Rapamycin treatment for Alzheimer’s disease and related dementias: a p… | 2025 | rct | strongest | 0.88 |
| 2 | Influence of rapamycin on safety and healthspan metrics after one year… | 2025 | rct | strongest | 0.88 |
| 3 | Evaluating the effect of rapamycin treatment in Alzheimer’s disease an… | 2024 | rct | strongest | 0.86 |
| 4 | Chronic <scp>mTOR</scp> inhibition in mice with rapamycin alters <scp>… | 2015 | unknown | human_observational | 0.66 |
| 5 | Clinical Trials Targeting Aging | 2022 | unknown | human_observational | 0.61 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## fit-02: fitness

**Query:** how much does strength training reduce all-cause mortality
**Context:** Large cohort studies exist. Should produce moderate-strong evidence.

### Planner output

**Intent:** `claim_check`
**Entities:** strength training, all-cause mortality
**Hidden goals:** dose-response relationship, mechanisms of action, specific populations, comparison with other exercise types

**Query variants (5):**
- strength training all-cause mortality meta-analysis
- resistance exercise longevity systematic review
- muscle strength mortality risk cohort study
- strength training dose-response all-cause mortality
- resistance training cardiovascular disease mortality

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 36 |
| After dedup | 32 |
| After guideline filter | 29 |
| Ranked (top 10) | 10 |
| Source: openalex | 36 |

### Retrieval quality

**Initial quality:** ❌ failed — score: **0.005**
- top5Align=0.300 interventionMatch=0.000 popMatch=1.000 evidenceBonus=1.000
- penalties: offTopic=-0.160 guideline=-0.120 conflation=0.000 diseaseBleed=-0.070
**Trigger repair:** yes — critical issue(s): off_topic_high_citation, guideline_or_consensus_pollution
**Issues detected:**
- `[critical] off_topic_high_citation`: 2 off-topic paper(s) in top 5, 2 with high citation authority
- `[critical] guideline_or_consensus_pollution`: 1 clinical guideline/consensus document(s) in top 5 (should have been filtered)

**⟳ Repair loop triggered** — strategy: `tighten_around_intervention`
- Original score: 0.005 → Repaired score: 0.311
- Decision: repaired score 0.311 > original 0.005 + threshold
**Repair queries used:**
- strength training all-cause mortality
- resistance exercise all-cause mortality
- muscle strengthening all-cause mortality
- weight training all-cause mortality
**Papers before repair:** 10 → **after:** 10
**Final quality:** 🔴 weak — score: 0.311

**Grounding validation:** ✅ clean

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 2 |
| Human RCTs | 2 |
| Human observational | 8 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 110.8s

### Synthesis

> Evidence from large observational studies and meta-analyses consistently shows that regular strength training is associated with a 10–20% lower risk of dying from any cause. This association appears independent of aerobic exercise, though combining both types of activity seems to offer the greatest benefit. Most of this evidence comes from cohort studies, not randomized controlled trials, so it shows correlation rather than definitively proving causation. A J-shaped pattern has been observed in some research, suggesting that benefits plateau or may even diminish at very high volumes, but the optimal dose is still being clarified.

**Follow-up options generated:**
- How does combining strength training with aerobic exercise change the risk reduction?
- What's the minimum effective dose of strength training for seeing a benefit?
- Does the benefit of strength training differ between men and women or by age?
- How does strength training compare to aerobic exercise alone for reducing mortality?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Effects of Exercise on the Resting Heart Rate: A Systematic Review and… | 2018 | meta_analysis | strongest | 0.91 |
| 2 | Muscle-strengthening activities are associated with lower risk and mor… | 2022 | meta_analysis | strongest | 0.89 |
| 3 | Prospective Associations of Different Combinations of Aerobic and Musc… | 2023 | cohort | human_observational | 0.74 |
| 4 | Aerobic, muscle-strengthening, and flexibility physical activity and r… | 2023 | cohort | human_observational | 0.73 |
| 5 | Associations between aerobic and muscle-strengthening physical activit… | 2022 | cohort | human_observational | 0.72 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## fit-03: fitness

**Query:** does zone 2 cardio training have specific benefits over other intensities
**Context:** Mechanistic case strong; RCTs on humans comparing zones are limited.

### Planner output

**Intent:** `claim_check`
**Entities:** zone 2 cardio training, other exercise intensities, cardiovascular health, metabolic health, endurance performance
**Hidden goals:** cardiovascular adaptation, mitochondrial function, fat oxidation, lactate threshold, VO2 max improvement, disease prevention

**Query variants (6):**
- zone 2 training benefits vs high intensity interval training
- moderate intensity continuous training cardiovascular adaptations
- fat oxidation zone 2 exercise lactate threshold
- mitochondrial biogenesis zone 2 cardio
- aerobic base training health outcomes
- zone 2 exercise metabolic syndrome prevention

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 42 |
| After dedup | 36 |
| After guideline filter | 33 |
| Ranked (top 10) | 10 |
| Source: openalex | 42 |

### Retrieval quality

**Initial quality:** ❌ failed — score: **0.079**
- top5Align=0.170 interventionMatch=0.000 popMatch=1.000 evidenceBonus=1.000
- penalties: offTopic=-0.160 guideline=0.000 conflation=0.000 diseaseBleed=-0.070
**Trigger repair:** yes — critical issue(s): off_topic_high_citation
**Issues detected:**
- `[critical] off_topic_high_citation`: 3 off-topic paper(s) in top 5, 3 with high citation authority

**⟳ Repair loop triggered** — strategy: `tighten_around_intervention`
- Original score: 0.079 → Repaired score: 0.000
- Decision: repaired score 0.000 did not improve over original 0.079 (threshold: 0.05)
**Repair queries used:**
- zone 2 cardio training specific benefits vs other exercise intensities
- zone 2 cardio training cardiovascular health outcomes compared to other exercise intensities
- metabolic health benefits zone 2 cardio training versus alternative exercise intensities
- endurance performance improvements zone 2 cardio training against other exercise intensities
**Papers before repair:** 10 → **after:** 10
**Final quality:** ❌ failed — score: 0.079

**Grounding validation:** ✅ clean

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 2 |
| Human RCTs | 7 |
| Human observational | 1 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `preliminary`
**No evidence:** No
**Latency:** 61.8s

### Synthesis

> The available evidence does not directly compare zone 2 cardio to other intensities for the specific benefits often claimed, like mitochondrial function or fat oxidation. In studies of patients with metabolic syndrome or heart failure, high-intensity interval training improved cardiovascular function more than moderate continuous training, which is similar to zone 2. However, these findings come from clinical populations and may not apply to healthy individuals or the unique metabolic adaptations attributed to zone 2.

**Follow-up options generated:**
- What does the research say about zone 2 training and mitochondrial function?
- Are there any studies comparing zone 2 to high-intensity training in healthy people?
- How do different exercise intensities affect fat oxidation?
- What are the practical differences between zone 2 and other training zones?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Using Aerobic Exercise to Improve Health Outcomes and Quality of Life … | 2013 | meta_analysis | strongest | 0.80 |
| 2 | The Physical Activity Guidelines for Americans | 2018 | systematic_review | strongest | 0.79 |
| 3 | Interventions for preventing obesity in children | 2019 | rct | strongest | 0.74 |
| 4 | Aerobic exercise to improve cognitive function in older people without… | 2015 | rct | strongest | 0.72 |
| 5 | Effects of Exercise Training on Depressive Symptoms in Patients With C… | 2012 | rct | strongest | 0.71 |

### Manual scoring

| Metric | Score (1–5) | Notes |
|--------|-------------|-------|
| Retrieval relevance | ___ | Are the papers actually about the topic? |
| Ranking quality | ___ | Are the best papers at the top? |
| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |
| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |
| Overall | ___ | Would you show this to a real user? |

**Reviewer notes:**


---

## How to compare runs

Each run is saved to `evals/search/runs/<timestamp>/`.
To compare two runs, diff the `results.json` files:

```bash
diff <run-a>/results.json <run-b>/results.json
# or use jq to extract specific fields for comparison
jq '[.[] | {id: .query.id, confidence: .synthesis.confidence, rankedCount}]' <run>/results.json
```