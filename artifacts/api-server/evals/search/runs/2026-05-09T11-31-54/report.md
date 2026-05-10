# Clarity Search — Eval Report

**Run:** 2026-05-09T11-31-54
**Queries evaluated:** 27 (27 succeeded, 0 failed)
**Total latency:** 2129.8s
**Average latency per query:** 78.9s
**Average papers per result:** 10.0

**Confidence distribution:**
- moderate: 13
- promising: 5
- preliminary: 5
- strong: 4

---

## supp-01: supplements

**Query:** does creatine actually help the brain?
**Context:** Canonical test case. Should find RCTs and meta-analyses.

### Planner output

**Intent:** `claim_check`
**Entities:** creatine, brain function
**Hidden goals:** cognitive performance, memory, mental fatigue, neuroprotection, brain energy metabolism, mood

**Query variants (6):**
- creatine supplementation cognitive function randomized controlled trial
- creatine brain energy metabolism mechanism
- creatine mental fatigue sleep deprivation
- creatine memory performance healthy adults
- creatine neuroprotection neurodegenerative disease
- creatine mood anxiety depression

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 31 |
| After dedup/filter | 31 |
| Ranked (top 10) | 10 |
| Source: openalex | 31 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 5 |
| Human RCTs | 4 |
| Human observational | 2 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 32.1s

### Synthesis

> The best evidence we have comes from recent meta-analyses of randomized controlled trials, which suggest that creatine supplementation can improve memory, particularly in older adults, but the effects on other cognitive functions like attention or executive function are less clear. These benefits are most consistently seen in people whose brains might be under more metabolic stress, such as due to aging, fatigue, or certain health conditions, rather than in young, healthy individuals. It's important to know that the studies used doses of around 5 grams per day, and the improvements were modest—creatine isn't a magic brain booster, but it may offer a small edge in specific situations.

**Follow-up options generated:**
- How does creatine actually get into the brain, and does everyone absorb it the same way?
- Are there specific situations—like sleep deprivation or intense mental work—where creatine might help more?
- What’s the difference between taking creatine for your muscles versus your brain?
- Could creatine have any long-term effects on brain health that we don’t know about yet?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | The effects of creatine supplementation on cognitive function in adult… | 2024 | meta_analysis | strongest | 0.91 |
| 2 | Effects of creatine supplementation on memory in healthy individuals: … | 2022 | meta_analysis | strongest | 0.89 |
| 3 | Beyond sports: Efficacy and safety of creatine supplementation in path… | 2019 | meta_analysis | strongest | 0.86 |
| 4 | Interrelationship between Sleep and Exercise: A Systematic Review | 2017 | systematic_review | strongest | 0.78 |
| 5 | Creatine Supplementation Associated or Not with Strength Training upon… | 2013 | rct | strongest | 0.75 |

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

## supp-02: supplements

**Query:** is magnesium glycinate useful for sleep?
**Context:** Should distinguish magnesium forms; dose question mixed in.

### Planner output

**Intent:** `claim_check`
**Entities:** magnesium glycinate, sleep
**Hidden goals:** sleep quality, sleep onset latency, sleep duration, insomnia, sleep disorders, mechanism of action, safety

**Query variants (5):**
- magnesium glycinate sleep quality randomized controlled trial
- magnesium glycinate insomnia treatment
- magnesium glycinate sleep mechanism GABA
- magnesium glycinate sleep onset duration
- magnesium forms sleep comparison

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 36 |
| After dedup/filter | 25 |
| Ranked (top 10) | 10 |
| Source: semantic_scholar | 1 |
| Source: openalex | 35 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 3 |
| Human RCTs | 5 |
| Human observational | 2 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `promising`
**No evidence:** No
**Latency:** 32.8s

### Synthesis

> The evidence on magnesium glycinate specifically for sleep is very limited, as most studies have used other forms like magnesium oxide or citrate. A 2024 systematic review found that magnesium supplementation may improve sleep quality, but the effect is small and not all studies agree. One small trial in women with PCOS showed better sleep with magnesium oxide, but this doesn't directly tell us about glycinate. Overall, there's some promising signal that magnesium in general might help with sleep, but we don't have strong human trials on glycinate itself.

**Follow-up options generated:**
- What's the difference between magnesium glycinate and other forms like citrate or oxide?
- Are there any risks or side effects of taking magnesium for sleep long-term?
- How does magnesium actually work in the brain to potentially affect sleep?
- What other non-supplement approaches have stronger evidence for improving sleep?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Examining the Effects of Supplemental Magnesium on Self-Reported Anxie… | 2024 | systematic_review | strongest | 0.89 |
| 2 | Evidence‐Based Integrative Treatments for Headache | 2019 | systematic_review | strongest | 0.87 |
| 3 | Effect of magnesium supplementation in improving hyperandrogenism, hir… | 2022 | rct | strongest | 0.80 |
| 4 | AASLD Practice Guidance on the clinical assessment and management of n… | 2023 | rct | strongest | 0.78 |
| 5 | ESRA19-0605 Opioid free anaesthesia with ra techniques: what is the co… | 2019 | meta_analysis | strongest | 0.77 |

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
| Raw retrieved | 39 |
| After dedup/filter | 34 |
| Ranked (top 10) | 10 |
| Source: semantic_scholar | 8 |
| Source: openalex | 31 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 1 |
| Human RCTs | 9 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `preliminary`
**No evidence:** Yes ⚠️
**Latency:** 50.8s

### Synthesis

> The claim that 20g of creatine is good for the brain and Alzheimer's isn't directly supported by the evidence you provided. None of the retrieved studies actually tested creatine for cognitive function or Alzheimer's disease in humans. The papers cover unrelated topics like blueberry polyphenols, rheumatoid arthritis, and anesthesia, so there's no human data here to evaluate creatine's effects on the brain or dementia risk.

**Follow-up options generated:**
- What does the broader research actually say about creatine and brain health?
- Are there any studies on high-dose creatine for neurological conditions?
- What’s the difference between creatine’s effects on muscle and on the brain?
- How do I spot when a podcast claim might be overstating the evidence?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Management of Immune-Related Adverse Events in Patients Treated With I… | 2021 | systematic_review | strongest | 0.81 |
| 2 | Wild Blueberry (Poly)phenols can Improve Vascular Function And Cogniti… | 2023 | rct | strongest | 0.76 |
| 3 | Antioxidant strategies for Alzheimer's disease | 2002 | rct | strongest | 0.73 |
| 4 | Can Creatine Supplementation Improve Body Composition and Objective Ph… | 2015 | rct | strongest | 0.73 |
| 5 | Daily mango (Mangifera indica L.) consumption supplemented with probio… | 2025 | rct | strongest | 0.73 |

> ⚠️ **Warnings:** Synthesizer flagged no good evidence

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

## supp-04: supplements

**Query:** does vitamin D deficiency actually matter
**Context:** Very common topic. Should find large meta-analyses.

### Planner output

**Intent:** `claim_check`
**Entities:** vitamin D deficiency
**Hidden goals:** health consequences of vitamin D deficiency, symptoms of vitamin D deficiency, diseases linked to vitamin D deficiency, impact on overall well-being

**Query variants (5):**
- health effects of vitamin D deficiency meta-analysis
- vitamin D deficiency symptoms randomized controlled trial
- long-term outcomes vitamin D insufficiency
- vitamin D deficiency bone health cardiovascular disease
- immune function vitamin D deficiency clinical study

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 38 |
| After dedup/filter | 38 |
| Ranked (top 10) | 10 |
| Source: semantic_scholar | 14 |
| Source: openalex | 24 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 8 |
| Human RCTs | 2 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 74.3s

### Synthesis

> Yes, vitamin D deficiency does matter, but the strength of evidence varies by health outcome. The clearest harm is to bone health—severe deficiency causes rickets in children and osteomalacia in adults, and lower levels accelerate bone loss and fracture risk. For other conditions like depression, infections, or diabetes, many observational studies show links, but randomized trials have not consistently proven that low vitamin D is the direct cause, so the relationship may be partly due to other factors. Overall, deficiency is very common globally and is a genuine concern for skeletal health, while its role in other diseases remains an area of active investigation.

**Follow-up options generated:**
- What blood level is actually considered deficient, and how is it tested?
- How much vitamin D do most people need to avoid bone problems, and can you get enough from sun alone?
- Are there specific groups of people who should be more concerned about their vitamin D status?
- What are the early signs of a bone issue from vitamin D deficiency that someone might notice?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Global and regional prevalence of vitamin D deficiency in population-b… | 2023 | meta_analysis | strongest | 0.95 |
| 2 | Prevalence of vitamin D deficiency in Africa: a systematic review and … | 2019 | meta_analysis | strongest | 0.92 |
| 3 | Global summary of maternal and newborn vitamin D status – a systematic… | 2015 | meta_analysis | strongest | 0.89 |
| 4 | Vitamin D supplementation in pregnancy: a systematic review | 2014 | meta_analysis | strongest | 0.89 |
| 5 | Causal Relationship between Obesity and Vitamin D Status: Bi-Direction… | 2013 | meta_analysis | strongest | 0.89 |

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

## supp-05: supplements

**Query:** omega-3 fish oil for depression — does it actually work?
**Context:** Good RCT evidence exists. Mixed results worth surfacing.

### Planner output

**Intent:** `claim_check`
**Entities:** omega-3 fish oil, depression
**Hidden goals:** efficacy, symptom reduction, mood improvement, mechanism of action, types of depression, dosage

**Query variants (5):**
- omega-3 fatty acids major depressive disorder meta-analysis
- fish oil EPA DHA antidepressant effects randomized controlled trial
- omega-3 inflammation depression mechanism
- fish oil supplementation mood disorders clinical study
- omega-3 dosage depression treatment

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 34 |
| After dedup/filter | 30 |
| Ranked (top 10) | 10 |
| Source: openalex | 34 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 7 |
| Human RCTs | 3 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 93.2s

### Synthesis

> The evidence from multiple meta-analyses of randomized controlled trials suggests omega-3 fish oil can have a small-to-moderate benefit for depression, but the effect is not consistent across all studies. The benefit seems most reliable for supplements that contain more EPA than DHA, with a common threshold being at least 60% EPA, and for people with a formal diagnosis of major depressive disorder rather than milder symptoms. Some research also hints that people with low blood levels of omega-3s might respond better, and higher doses may work a bit faster, but this is still being explored. Overall, it's not a guaranteed fix, but it's a reasonable option to discuss with a doctor, especially as an add-on to other treatments.

**Follow-up options generated:**
- What's the difference between EPA and DHA, and why might that matter for mood?
- Are there specific types of depression that seem to respond better to omega-3s?
- How does fish oil compare to standard antidepressants in the studies?
- What do we know about using omega-3s to prevent depression rather than treat it?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Efficacy of omega-3 highly unsaturated fatty acids in the treatment of… | 2016 | meta_analysis | strongest | 0.85 |
| 2 | Role of Omega-3 Fatty Acids in the Treatment of Depressive Disorders: … | 2014 | meta_analysis | strongest | 0.84 |
| 3 | Meta-Analysis of the Effects of Eicosapentaenoic Acid (EPA) in Clinica… | 2011 | meta_analysis | strongest | 0.83 |
| 4 | A Meta-Analytic Review of Double-Blind, Placebo-Controlled Trials of A… | 2007 | meta_analysis | strongest | 0.82 |
| 5 | Omega-3 fatty acids as treatments for mental illness: which disorder a… | 2007 | meta_analysis | strongest | 0.82 |

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
**Hidden goals:** anti-aging effects, NAD+ levels, cellular health, metabolic health, human trials, safety

**Query variants (5):**
- NMN supplementation human longevity clinical trials
- NMN anti-aging mechanisms NAD+ metabolism
- Nicotinamide mononucleotide effects on lifespan aging markers
- NMN safety and side effects long-term use
- NMN metabolic health benefits human studies

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 24 |
| After dedup/filter | 15 |
| Ranked (top 10) | 10 |
| Source: openalex | 24 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Human RCTs | 2 |
| Human observational | 5 |
| Mechanistic / animal | 3 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `preliminary`
**No evidence:** Yes ⚠️
**Latency:** 46.1s

### Synthesis

> There is currently no direct human evidence from clinical trials that NMN extends lifespan or healthspan. Most research on NAD+ precursors has focused on nicotinamide riboside (NR) and nicotinamide, with small studies showing they can raise NAD+ levels, but long-term longevity outcomes remain untested. Animal studies suggest NMN may improve some markers of aging, but human data on safety and efficacy are very limited, so it's too early to say if it's 'worth taking' for longevity.

**Follow-up options generated:**
- What's the difference between NMN and nicotinamide riboside (NR), and does one have better human evidence?
- Are there any ongoing human trials testing NMN for aging or age-related conditions?
- What do animal studies actually show about NMN and lifespan?
- What are the known safety concerns or side effects of NMN in humans?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | A nonrandomized study of single oral supplementation within the daily … | 2020 | rct | strongest | 0.83 |
| 2 | Chronic nicotinamide riboside supplementation is well-tolerated and el… | 2018 | rct | strongest | 0.74 |
| 3 | Nicotinamide mononucleotide (NMN) as an anti-aging health product – Pr… | 2021 | unknown | human_observational | 0.71 |
| 4 | Harnessing lactic acid bacteria for nicotinamide mononucleotide biosyn… | 2024 | unknown | human_observational | 0.57 |
| 5 | Cardiac Energy Metabolism in Heart Failure | 2021 | unknown | human_observational | 0.50 |

> ⚠️ **Warnings:** Synthesizer flagged no good evidence

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

## supp-07: supplements

**Query:** ashwagandha for stress and anxiety — what does the evidence say
**Context:** Some small RCTs exist. Should note study quality limitations.

### Planner output

**Intent:** `claim_check`
**Entities:** ashwagandha, stress, anxiety
**Hidden goals:** efficacy, safety, mechanisms of action, optimal dosage, duration of effect, specific anxiety disorders

**Query variants (5):**
- ashwagandha randomized controlled trial stress anxiety
- Withania somnifera anxiolytic effects mechanism
- ashwagandha generalized anxiety disorder clinical study
- ashwagandha cortisol reduction human trials
- ashwagandha side effects safety profile

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 32 |
| After dedup/filter | 25 |
| Ranked (top 10) | 10 |
| Source: openalex | 32 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 2 |
| Human RCTs | 8 |
| Human observational | 1 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `promising`
**No evidence:** No
**Latency:** 89.4s

### Synthesis

> The evidence from multiple randomized controlled trials and a recent meta-analysis suggests that ashwagandha can help reduce perceived stress and anxiety in adults, particularly those with mild to moderate symptoms. The effects appear modest but consistent, with most studies using root or root-and-leaf extracts standardized to withanolides at daily doses ranging from 240 mg to 600 mg over 6 to 12 weeks. However, the overall certainty of the evidence is considered low due to small study sizes and variable extract preparations, so while the signal is promising, it's not definitive. It's also worth noting that most research has focused on general stress and anxiety rather than diagnosed anxiety disorders, so the benefit for specific conditions like generalized anxiety disorder is less clear.

**Follow-up options generated:**
- How does ashwagandha compare to standard anxiety medications or therapy?
- Are there any known side effects or risks with long-term ashwagandha use?
- What's the difference between ashwagandha extracts — does the withanolide content matter?
- Could ashwagandha help with sleep problems that often come with stress?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | A New Ashwagandha Formulation (Zenroot™) Alleviates Stress and Anxiety… | 2025 | rct | strongest | 0.90 |
| 2 | Shoden promotes Relief from stress and anxiety: A randomized, double-b… | 2024 | rct | strongest | 0.88 |
| 3 | An investigation into the stress-relieving and pharmacological actions… | 2019 | rct | strongest | 0.85 |
| 4 | Adaptogenic and Anxiolytic Effects of Ashwagandha Root Extract in Heal… | 2019 | rct | strongest | 0.85 |
| 5 | Body Weight Management in Adults Under Chronic Stress Through Treatmen… | 2016 | rct | strongest | 0.83 |

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

## sleep-01: sleep

**Query:** what does science say about sleep deprivation and cognitive performance
**Context:** Well-studied area. Should find strong human evidence.

### Planner output

**Intent:** `topic_exploration`
**Entities:** sleep deprivation, cognitive performance
**Hidden goals:** memory, attention, executive function, reaction time, mood, long-term effects, recovery from sleep deprivation

**Query variants (6):**
- sleep deprivation impact on executive function
- chronic sleep restriction effects on memory
- acute sleep loss attention performance
- mechanisms of cognitive impairment sleep deprivation
- sleep deprivation reaction time meta-analysis
- sleep deprivation academic performance students

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 38 |
| After dedup/filter | 37 |
| Ranked (top 10) | 10 |
| Source: openalex | 30 |
| Source: semantic_scholar | 8 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 4 |
| Human observational | 8 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `strong`
**No evidence:** No
**Latency:** 45.7s

### Synthesis

> The evidence strongly shows that sleep deprivation reliably impairs cognitive performance, especially attention, executive function, and mood. Meta-analyses of human studies confirm that both total sleep loss and partial sleep restriction reduce functioning, with mood being more affected than cognitive or motor performance. Brain imaging studies reveal that acute sleep loss alters activity in attention networks. Observational research consistently links poor sleep quality or insufficient sleep to lower academic and work performance, though individual responses vary.

**Follow-up options generated:**
- How long does it take to recover cognitive function after sleep deprivation?
- Does sleep quality matter more than sleep quantity for thinking clearly?
- Are there ways to reduce the impact of a poor night's sleep on performance the next day?
- What does long-term sleep loss do to the risk of dementia or memory decline?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Fatigue in Anesthesia | 2002 | meta_analysis | strongest | 0.86 |
| 2 | How Acute Total Sleep Loss Affects the Attending Brain: A Meta-Analysi… | 2015 | meta_analysis | strongest | 0.84 |
| 3 | Effect of acupuncture on cognitive impairment induced by sleep depriva… | 2025 | meta_analysis | human_observational | 0.79 |
| 4 | Sleep Duration and Executive Function in Adults | 2023 | unknown | human_observational | 0.73 |
| 5 | Effects of Sleep Deprivation on Performance: A Meta-Analysis | 1996 | meta_analysis | human_observational | 0.70 |

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

### Planner output

**Intent:** `claim_check`
**Entities:** melatonin, sleep quality
**Hidden goals:** sleep onset latency, sleep duration, sleep efficiency, insomnia, jet lag, circadian rhythm disorders, side effects, dosage

**Query variants (5):**
- melatonin supplementation sleep quality meta-analysis
- melatonin efficacy primary insomnia randomized controlled trial
- melatonin sleep architecture polysomnography
- melatonin jet lag subjective sleep quality
- melatonin adverse effects sleep

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 25 |
| After dedup/filter | 25 |
| Ranked (top 10) | 10 |
| Source: openalex | 25 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 6 |
| Human RCTs | 4 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 54.2s

### Synthesis

> Melatonin can modestly improve sleep quality for some people, particularly those with insomnia, circadian rhythm disorders, or jet lag. Randomized trials show it helps you fall asleep faster and may improve sleep efficiency, especially in older adults or those with low natural melatonin. However, the benefits are often small and not everyone responds; it's not a universal sleep aid for healthy sleepers. For conditions like delayed sleep phase syndrome, taking melatonin at the right time can shift sleep schedules earlier.

**Follow-up options generated:**
- What dose and timing of melatonin works best for jet lag?
- How does melatonin compare to other sleep aids like valerian or prescription drugs?
- Are there any long-term risks of taking melatonin every night?
- Does melatonin help with sleep problems caused by shift work?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Effects of Melatonin Supplementation on Sleep Quality in Breast Cancer… | 2023 | meta_analysis | strongest | 0.94 |
| 2 | The efficacy of exogenous melatonin supplement in ameliorating irritab… | 2022 | meta_analysis | strongest | 0.93 |
| 3 | Comparative effects of pharmacological interventions for the acute and… | 2022 | meta_analysis | strongest | 0.89 |
| 4 | Melatonin in autism spectrum disorders: a systematic review and meta‐a… | 2011 | meta_analysis | strongest | 0.83 |
| 5 | Efficacy and safety of exogenous melatonin for secondary sleep disorde… | 2006 | meta_analysis | strongest | 0.81 |

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
**Hidden goals:** sleep onset latency, sleep duration, sleep architecture, subjective sleep quality, objective sleep measures, impact on health, mechanisms of action

**Query variants (5):**
- blue light exposure before sleep meta-analysis
- blue light melatonin suppression sleep quality
- circadian rhythm disruption electronic devices sleep
- blue light filtering glasses sleep randomized controlled trial
- impact of screen time on sleep in adolescents

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 30 |
| After dedup/filter | 30 |
| Ranked (top 10) | 10 |
| Source: openalex | 30 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 3 |
| Human RCTs | 2 |
| Human observational | 5 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 54.1s

### Synthesis

> Evidence from systematic reviews and controlled trials shows that evening blue light exposure can suppress melatonin, shift circadian timing, and reduce sleep quality. The effect is consistent enough that blue-light blocking interventions often improve sleep onset and quality, though individual sensitivity varies. While 'ruins' may overstate the case, the disruption is real and measurable.

**Follow-up options generated:**
- How long before bed should I avoid blue light to see a benefit?
- Do blue-light blocking glasses actually work, and are they all the same?
- Is all blue light bad, or just from screens and LEDs?
- What about night mode or warm light settings on phones—do they help?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Systematic review of light exposure impact on human circadian rhythm | 2018 | systematic_review | strongest | 0.81 |
| 2 | The chronotherapeutic treatment of bipolar disorders: A systematic rev… | 2019 | systematic_review | strongest | 0.79 |
| 3 | Blue-Light Filtering Spectacle Lenses: Optical and Clinical Performanc… | 2017 | rct | strongest | 0.78 |
| 4 | Is Sleep Duration Associated With Childhood Obesity? A Systematic Revi… | 2008 | meta_analysis | strongest | 0.77 |
| 5 | BLUES - stabilizing mood and sleep with blue blocking eyewear in bipol… | 2023 | rct | strongest | 0.74 |

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

## mental-01: mental_health

**Query:** tell me about meditation and anxiety
**Context:** Topic exploration. Wide evidence base.

### Planner output

**Intent:** `topic_exploration`
**Entities:** meditation, anxiety
**Hidden goals:** anxiety reduction, stress management, mental well-being, mechanisms of action, types of meditation, effectiveness

**Query variants (6):**
- meditation practices anxiety reduction meta-analysis
- mindfulness-based stress reduction generalized anxiety disorder
- transcendental meditation anxiety symptoms randomized controlled trial
- neurobiological mechanisms meditation anxiety relief
- different types of meditation effects on anxiety
- meditation interventions for social anxiety disorder

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 40 |
| After dedup/filter | 36 |
| Ranked (top 10) | 10 |
| Source: openalex | 40 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 6 |
| Human RCTs | 4 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `strong`
**No evidence:** No
**Latency:** 44.4s

### Synthesis

> Multiple meta-analyses and randomized trials show that meditation can meaningfully reduce anxiety. The strongest evidence is for mindfulness-based programs and Transcendental Meditation, with studies finding benefits for generalized anxiety disorder, stress-related anxiety, and anxiety tied to health conditions like chronic pain or heart disease. Effects are often moderate in size and tend to be larger for people with higher anxiety to start with. While meditation isn't a replacement for professional care, the research consistently points to it as a helpful tool for managing anxiety.

**Follow-up options generated:**
- How does meditation compare to therapy or medication for anxiety?
- What's the difference between mindfulness meditation and Transcendental Meditation for anxiety?
- How long or how often do you need to meditate to see a change in anxiety?
- Are there specific types of anxiety, like social anxiety or panic attacks, that meditation helps most?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Yoga for improving health-related quality of life, mental health and c… | 2017 | meta_analysis | strongest | 0.90 |
| 2 | Mind–body practices for patients with cardiac disease: a systematic re… | 2014 | meta_analysis | strongest | 0.89 |
| 3 | Effects of the Transcendental Meditation Technique on Trait Anxiety: A… | 2013 | meta_analysis | strongest | 0.88 |
| 4 | Mindfulness Based Stress Reduction (MBSR) for Improving Health, Qualit… | 2012 | meta_analysis | strongest | 0.88 |
| 5 | 2614 – Interventions to Reduce Stress in University Students: A Review… | 2013 | meta_analysis | strongest | 0.88 |

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

## mental-02: mental_health

**Query:** does exercise help with depression as much as antidepressants?
**Context:** Comparative claim. Should note RCT limitations in exercise trials.

### Planner output

**Intent:** `claim_check`
**Entities:** exercise, depression, antidepressants
**Hidden goals:** treatment efficacy, comparative effectiveness, symptom reduction, remission rates, long-term outcomes, side effects

**Query variants (5):**
- exercise versus antidepressants major depressive disorder meta-analysis
- comparative efficacy physical activity pharmacological treatment depression
- exercise antidepressant combination therapy depression outcomes
- mechanisms of action exercise depression vs antidepressants
- long-term effectiveness exercise antidepressants depression

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 41 |
| After dedup/filter | 31 |
| Ranked (top 10) | 10 |
| Source: openalex | 33 |
| Source: semantic_scholar | 8 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 6 |
| Human RCTs | 4 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 83.2s

### Synthesis

> For non-severe depression, exercise appears to be about as effective as antidepressants, and combining them may work better than either alone. The evidence for this comes from recent meta-analyses of randomized trials, though most studies are relatively short-term. For more severe depression, the picture is less clear from these papers, but exercise is consistently shown to reduce symptoms compared to no treatment. This doesn't mean exercise can simply replace medication for everyone—individual factors and preferences matter a lot.

**Follow-up options generated:**
- What types of exercise seem to work best for depression?
- How long and how often do you need to exercise to see a mood benefit?
- Are there risks or side effects of using exercise as a treatment for depression?
- How does exercise compare to talk therapy for depression?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Exercise for depression | 2013 | meta_analysis | strongest | 0.89 |
| 2 | Comparative effectiveness of exercise, antidepressants and their combi… | 2022 | meta_analysis | strongest | 0.89 |
| 3 | Effectiveness of indoor rock climbing and bouldering as treatment for … | 2025 | systematic_review | strongest | 0.87 |
| 4 | Interventions to improve return to work in depressed people | 2020 | rct | strongest | 0.85 |
| 5 | Exercise therapy for chronic fatigue syndrome | 2019 | rct | strongest | 0.85 |

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

## mental-03: mental_health

**Query:** what is the evidence for psychedelics in treating PTSD
**Context:** Emerging area. Should surface phase 2/3 trials. Mostly promising/preliminary.

### Planner output

**Intent:** `topic_exploration`
**Entities:** psychedelics, PTSD
**Hidden goals:** efficacy, safety, mechanisms of action, specific psychedelic compounds, long-term effects, adverse events

**Query variants (6):**
- psychedelic-assisted psychotherapy PTSD randomized controlled trial
- MDMA psilocybin PTSD treatment efficacy
- psychedelics mechanism of action PTSD neurobiology
- long-term outcomes psychedelic therapy PTSD
- adverse effects psychedelics PTSD treatment
- ayahuasca ibogaine PTSD clinical studies

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 37 |
| After dedup/filter | 25 |
| Ranked (top 10) | 10 |
| Source: openalex | 37 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 3 |
| Human RCTs | 7 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 57.2s

### Synthesis

> The strongest evidence is for MDMA-assisted therapy, with two large phase 3 trials showing it significantly reduces PTSD symptoms compared to placebo with therapy. A systematic review of MDMA and ketamine for PTSD found MDMA promising, while ketamine had mixed results. Evidence for classic psychedelics like psilocybin and LSD in PTSD is still very limited, with no large trials yet. These treatments are always paired with psychotherapy, so the effect is from the combination, not the drug alone.

**Follow-up options generated:**
- How does MDMA-assisted therapy compare to standard PTSD treatments like prolonged exposure or SSRIs?
- What are the main safety concerns or side effects seen in these psychedelic trials?
- Are there any studies on psilocybin or LSD specifically for PTSD, or is the focus mainly on MDMA?
- What role does the therapy component play—could the drug work without it?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Psychedelics assisting therapy, or therapy assisting psychedelics? The… | 2025 | rct | strongest | 0.91 |
| 2 | Psychedelics and mental health: reimagining care through science, insi… | 2025 | rct | strongest | 0.91 |
| 3 | What can we learn from the history of research on psychedelic drugs in… | 2021 | meta_analysis | strongest | 0.91 |
| 4 | Psychedelics and Psychedelic-Assisted Psychotherapy | 2020 | rct | strongest | 0.85 |
| 5 | Psychedelic Treatments for Psychiatric Disorders: A Systematic Review … | 2020 | systematic_review | strongest | 0.85 |

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

## mental-04: mental_health

**Query:** gut microbiome and depression — is the connection real
**Context:** Mechanistic evidence is strong; human intervention RCTs are thin.

### Planner output

**Intent:** `claim_check`
**Entities:** gut microbiome, depression
**Hidden goals:** gut-brain axis, mental health, mood regulation, neurotransmitters, inflammation, probiotics, prebiotics, dietary interventions

**Query variants (5):**
- gut microbiome depression systematic review meta-analysis
- gut-brain axis major depressive disorder mechanisms
- probiotics prebiotics depression randomized controlled trial
- microbiota-gut-brain axis mood disorders clinical studies
- dysbiosis depression inflammation biomarkers

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 28 |
| After dedup/filter | 23 |
| Ranked (top 10) | 10 |
| Source: openalex | 28 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 6 |
| Human RCTs | 1 |
| Human observational | 5 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 118.1s

### Synthesis

> Multiple meta-analyses of randomized controlled trials show that probiotics, prebiotics, and synbiotics can modestly reduce depressive symptoms, indicating a real, causal connection between the gut microbiome and depression. Observational studies also consistently find differences in gut bacteria composition between people with and without depression. While the effect sizes are small and not all individual studies agree, the intervention evidence moves beyond mere correlation to suggest the gut-brain axis plays a role in mood regulation.

**Follow-up options generated:**
- What specific probiotic strains have shown the most promise for mood?
- How does diet influence the gut-brain connection in depression?
- Are there any risks or side effects to using probiotics for mental health?
- What's the difference between prebiotics and probiotics when it comes to depression?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Efficacy and safety of gut microbiome-targeted treatment in patients w… | 2025 | meta_analysis | strongest | 0.98 |
| 2 | Effects of Prebiotics and Probiotics on Symptoms of Depression and Anx… | 2024 | meta_analysis | strongest | 0.96 |
| 3 | The efficacy of probiotics, prebiotics, and synbiotics on anxiety, dep… | 2025 | meta_analysis | strongest | 0.91 |
| 4 | Effect of prebiotics, probiotics, synbiotics on depression: results fr… | 2023 | meta_analysis | strongest | 0.90 |
| 5 | Effect of probiotic interventions on depressive symptoms: A narrative … | 2018 | rct | strongest | 0.83 |

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

## nutr-01: nutrition

**Query:** what does science actually say about fasting?
**Context:** Broad topic. Should bucket different fasting types and outcomes.

### Planner output

**Intent:** `topic_exploration`
**Entities:** fasting, intermittent fasting, time-restricted eating, alternate-day fasting
**Hidden goals:** weight loss, metabolic health, cardiovascular health, longevity, cognitive function, inflammation, disease prevention, safety, mechanisms of action

**Query variants (6):**
- intermittent fasting metabolic health randomized controlled trial
- fasting effects on weight loss and body composition
- time-restricted eating cardiovascular disease risk factors
- fasting neuroprotection cognitive performance
- mechanisms of fasting cellular autophagy longevity
- safety and adverse effects of prolonged fasting

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 33 |
| After dedup/filter | 31 |
| Ranked (top 10) | 10 |
| Source: openalex | 33 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 1 |
| Human RCTs | 9 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 32.1s

### Synthesis

> Overall, the evidence suggests that intermittent fasting and time-restricted eating can lead to modest weight loss and improvements in some cardiometabolic risk factors, like blood pressure and insulin sensitivity. However, most of the weight loss appears to come from eating fewer calories overall, not from fasting itself. The research is moderate in strength, with several randomized trials and a recent meta-analysis showing consistent but not dramatic effects, and long-term safety and sustainability are still being studied.

**Follow-up options generated:**
- How does fasting compare to simple calorie counting for keeping weight off long-term?
- Are there specific health conditions where fasting might be risky?
- What does the evidence say about fasting and muscle mass or athletic performance?
- Does the timing of the eating window matter, or just the total hours fasted?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | The Effect of Time-Restricted Eating on Metabolic Risk Factors for Car… | 2025 | meta_analysis | strongest | 0.91 |
| 2 | Intermittent fasting and time-restricted eating role in dietary interv… | 2022 | rct | strongest | 0.84 |
| 3 | Twelve Months of Time-restricted Eating and Resistance Training Improv… | 2021 | rct | strongest | 0.84 |
| 4 | Intermittent Fasting Improves Cardiometabolic Risk Factors and Alters … | 2020 | rct | strongest | 0.80 |
| 5 | Intermittent fasting and ‘metabolic switch’: Effects on metabolic synd… | 2020 | rct | strongest | 0.80 |

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

## nutr-02: nutrition

**Query:** is red meat actually bad for you
**Context:** Contested area. Should surface conflicting findings prominently.

### Planner output

**Intent:** `claim_check`
**Entities:** red meat
**Hidden goals:** cardiovascular disease risk, cancer risk, mortality, nutrient intake, gut microbiome, inflammation, processed meat vs unprocessed meat

**Query variants (6):**
- red meat consumption cardiovascular disease meta-analysis
- red meat intake cancer risk systematic review
- unprocessed red meat mortality prospective cohort
- red meat gut microbiome TMAO
- red meat nutrient density health outcomes
- processed red meat vs unprocessed red meat health effects

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 37 |
| After dedup/filter | 34 |
| Ranked (top 10) | 10 |
| Source: openalex | 37 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 7 |
| Human RCTs | 1 |
| Human observational | 8 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 60.7s

### Synthesis

> Evidence from multiple large meta-analyses of observational studies consistently shows that higher consumption of red meat, particularly processed red meat, is associated with a modestly increased risk of cardiovascular disease, stroke, type 2 diabetes, colorectal cancer, and overall mortality. However, these findings are correlations, not proof of causation, and the health risks appear to be small when red meat is eaten in the context of an overall healthy diet. The strength of the associations is stronger for processed meats than for unprocessed red meat, but individual risk also depends on overall dietary patterns and lifestyle.

**Follow-up options generated:**
- How does the processed meat risk compare to unprocessed red meat?
- What are the proposed biological mechanisms linking red meat to cancer?
- Would replacing red meat with fish or plant protein reduce my risk?
- How much red meat is considered safe according to these studies?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Role of Total, Red, Processed, and White Meat Consumption in Stroke In… | 2017 | systematic_review | strongest | 0.89 |
| 2 | 'Mediterranean' dietary pattern for the primary prevention of cardiova… | 2013 | rct | strongest | 0.71 |
| 3 | Red meat consumption, cardiovascular diseases, and diabetes: a systema… | 2023 | meta_analysis | human_observational | 0.85 |
| 4 | Associations of the consumption of unprocessed red meat and processed … | 2022 | meta_analysis | human_observational | 0.84 |
| 5 | A systematic review on consumer acceptance of alternative proteins: Pu… | 2020 | systematic_review | human_observational | 0.81 |

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

## nutr-03: nutrition

**Query:** does eating breakfast matter for weight loss
**Context:** Claim-check. RCT evidence doesn't strongly support breakfast myth.

### Planner output

**Intent:** `claim_check`
**Entities:** eating breakfast, weight loss
**Hidden goals:** meal timing, metabolism, satiety, caloric intake, dietary patterns

**Query variants (5):**
- breakfast consumption weight loss randomized controlled trial
- skipping breakfast body weight meta-analysis
- meal frequency metabolic rate obesity
- breakfast timing satiety appetite regulation
- breakfast composition weight management

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 32 |
| After dedup/filter | 30 |
| Ranked (top 10) | 10 |
| Source: openalex | 32 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 6 |
| Human RCTs | 4 |
| Human observational | 2 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `strong`
**No evidence:** No
**Latency:** 44.9s

### Synthesis

> The best available evidence from randomized controlled trials shows that eating breakfast does not appear to cause weight loss, and may lead to slightly higher daily calorie intake. Observational studies do link breakfast skipping to lower body weight, but that is likely correlation, not causation—people who skip breakfast may have other healthier habits. For weight loss, the quality of your overall diet and total calorie intake matters more than whether you eat breakfast. If breakfast helps you control hunger later in the day, it could be a useful tool, but it is not required for weight loss.

**Follow-up options generated:**
- What about breakfast's effect on metabolism or energy levels throughout the day?
- Is there an ideal time to eat breakfast for overall health?
- How does breakfast influence appetite and cravings later on?
- If I do eat breakfast, what kind is healthiest?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Breakfast Skipping, Body Composition, and Cardiometabolic Risk: A Syst… | 2020 | meta_analysis | strongest | 0.87 |
| 2 | Effect of breakfast on weight and energy intake: systematic review and… | 2019 | meta_analysis | strongest | 0.86 |
| 3 | Eating compared to skipping breakfast has no discernible benefit for o… | 2017 | systematic_review | strongest | 0.82 |
| 4 | Effect of time restricted eating on body weight and fasting glucose in… | 2021 | rct | strongest | 0.81 |
| 5 | Interventions for preventing obesity in children | 2019 | rct | strongest | 0.74 |

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
**Hidden goals:** optimal protein dosage, protein timing, protein sources, resistance training, muscle protein synthesis, lean body mass, muscle hypertrophy

**Query variants (6):**
- optimal protein intake muscle hypertrophy randomized controlled trial
- protein dosage resistance training muscle gain
- protein intake per kg body weight muscle growth
- high protein intake safety kidney function
- protein timing muscle protein synthesis
- plant-based protein vs animal protein muscle growth

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 42 |
| After dedup/filter | 38 |
| Ranked (top 10) | 10 |
| Source: openalex | 42 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 3 |
| Human RCTs | 1 |
| Human observational | 7 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `promising`
**No evidence:** No
**Latency:** 63.9s

### Synthesis

> Based on the available evidence, a daily protein intake of about 1.6 grams per kilogram of body weight appears sufficient to maximize resistance training-induced muscle growth for most people, with intakes up to 2.2 g/kg potentially offering small additional benefits. The review by Morton et al. highlights that total daily protein intake is the primary driver, while timing around exercise may provide a modest extra boost, especially in older adults. However, the direct evidence from the papers provided is limited, and individual needs can vary based on factors like age and training intensity. Therefore, while these figures are a reasonable target, they should be considered as part of a balanced diet and exercise program.

**Follow-up options generated:**
- What’s the best type of protein for building muscle — animal vs. plant-based?
- How should I adjust protein intake as I get older to maintain muscle mass?
- Does spreading protein out across meals make a difference compared to one big serving?
- Are there any side effects to eating large amounts of protein for years?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Guidelines for the Provision and Assessment of Nutrition Support Thera… | 2016 | meta_analysis | strongest | 0.85 |
| 2 | AASLD Practice Guidance on the clinical assessment and management of n… | 2023 | rct | strongest | 0.78 |
| 3 | Guidelines for the Provision and Assessment of Nutrition Support Thera… | 2009 | meta_analysis | strongest | 0.77 |
| 4 | Standards of Medical Care in Diabetes—2013 | 2012 | meta_analysis | human_observational | 0.68 |
| 5 | Dietary protein intake and human health | 2016 | unknown | human_observational | 0.62 |

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
**Entities:** lifestyle factors, longevity
**Hidden goals:** mortality reduction, healthy aging, disease prevention, quality of life, life expectancy

**Query variants (6):**
- lifestyle interventions mortality risk meta-analysis
- dietary patterns longevity prospective cohort
- physical activity all-cause mortality systematic review
- social connection life expectancy
- sleep duration cardiovascular disease mortality
- stress management telomere length

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 64 |
| After dedup/filter | 61 |
| Ranked (top 10) | 10 |
| Source: semantic_scholar | 25 |
| Source: openalex | 39 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 9 |
| Human RCTs | 1 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 75.4s

### Synthesis

> The most consistent and robust evidence points to regular physical activity as a top lifestyle factor for a longer life, with clear dose-response links to lower all-cause mortality. Adequate sleep duration—not too short or too long—also shows a strong association with reduced cardiovascular deaths. Combined lifestyle programs that address exercise, diet, and smoking further lower mortality, especially in people with existing heart disease. Most of this evidence comes from large observational studies, so while the associations are strong, they don't prove causation on their own.

**Follow-up options generated:**
- How much physical activity is enough to see a real benefit?
- What about diet—are there specific eating patterns linked to longer life?
- Does the type of exercise matter, or is any movement good?
- How do social connections or stress compare to these physical factors?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Exercise/physical activity and health outcomes: an overview of Cochran… | 2020 | meta_analysis | strongest | 0.82 |
| 2 | Dose-response associations between accelerometry measured physical act… | 2019 | meta_analysis | strongest | 0.81 |
| 3 | The association of physical function and physical activity with all-ca… | 2018 | meta_analysis | strongest | 0.81 |
| 4 | The impact of physical activity and an additional behavioural risk fac… | 2019 | systematic_review | strongest | 0.79 |
| 5 | AASLD Practice Guidance on the clinical assessment and management of n… | 2023 | rct | strongest | 0.78 |

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

## long-02: longevity

**Query:** does calorie restriction extend lifespan in humans
**Context:** Mostly animal evidence. Should clearly separate mechanistic from human evidence.

### Planner output

**Intent:** `claim_check`
**Entities:** calorie restriction, lifespan, humans
**Hidden goals:** longevity, aging mechanisms, healthspan, disease prevention, metabolic health

**Query variants (5):**
- calorie restriction human longevity randomized controlled trial
- intermittent fasting lifespan human studies
- calorie restriction metabolic pathways aging humans
- long-term calorie restriction health outcomes humans
- calorie restriction effects on age-related diseases humans

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 28 |
| After dedup/filter | 25 |
| Ranked (top 10) | 10 |
| Source: openalex | 28 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 1 |
| Human RCTs | 6 |
| Human observational | 4 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `preliminary`
**No evidence:** No
**Latency:** 105.2s

### Synthesis

> While calorie restriction extends lifespan in many animal species, there is no direct evidence from human studies that it extends human lifespan. Randomized controlled trials in humans, such as the CALERIE studies, have found that calorie restriction improves various markers of health and aging—like metabolic health, mood, and quality of life—but these trials were too short to measure actual lifespan. The claim that calorie restriction extends human lifespan is not yet supported by human evidence; current data only show improvements in healthspan-related biomarkers. The evidence is preliminary for lifespan extension, as no human study has tracked participants long enough to observe effects on longevity.

**Follow-up options generated:**
- What specific health benefits of calorie restriction have been shown in humans?
- How does calorie restriction compare to intermittent fasting for healthspan?
- Are there any risks or downsides to long-term calorie restriction?
- What are the most promising calorie restriction mimetics being studied?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Proteomic Analysis of Human Plasma during Intermittent Fasting | 2019 | rct | strongest | 0.81 |
| 2 | Effect of Calorie Restriction on Mood, Quality of Life, Sleep, and Sex… | 2016 | rct | strongest | 0.79 |
| 3 | Effect of 6-Month Calorie Restriction on Biomarkers of Longevity, Meta… | 2006 | rct | strongest | 0.76 |
| 4 | Physical Activity and Bone Health | 2004 | rct | strongest | 0.76 |
| 5 | Examination of Cognitive Function During Six Months of Calorie Restric… | 2007 | rct | strongest | 0.74 |

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
**Hidden goals:** anti-aging mechanisms, healthspan, age-related diseases, safety profile, side effects, clinical trials

**Query variants (5):**
- rapamycin human clinical trials longevity
- rapamycin anti-aging mechanisms humans
- rapamycin healthspan markers human studies
- rapamycin side effects long-term human use
- rapamycin mTOR pathway aging humans

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 25 |
| After dedup/filter | 23 |
| Ranked (top 10) | 10 |
| Source: openalex | 25 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Human observational | 10 |
| **Total** | **10** |

**Overall confidence:** `promising`
**Synthesis confidence:** `preliminary`
**No evidence:** No
**Latency:** 61.9s

### Synthesis

> The evidence for rapamycin's effects on human longevity is still early and indirect. The most relevant human data comes from a small 2014 study showing that a rapamycin analog improved immune response to a flu vaccine in older adults, which is a sign of healthier aging but not a direct measure of lifespan. Most other human studies are observational reviews or discuss mechanisms, while animal research shows lifespan extension in rodents and marmosets, but with potential metabolic side effects. Overall, there are no long-term human trials proving rapamycin extends life or healthspan, and its safety profile for this use is not established.

**Follow-up options generated:**
- What are the known side effects of rapamycin in people who take it for other reasons?
- Are there any ongoing human trials testing rapamycin specifically for aging?
- How does rapamycin compare to other potential anti-aging drugs like metformin?
- What did the animal studies actually show about lifespan extension — how big was the effect?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Multifaceted role of mTOR (mammalian target of rapamycin) signaling pa… | 2023 | unknown | human_observational | 0.66 |
| 2 | Intestinal Fork Head Regulates Nutrient Absorption and Promotes Longev… | 2017 | unknown | human_observational | 0.64 |
| 3 | mTOR inhibition improves immune function in the elderly | 2014 | unknown | human_observational | 0.63 |
| 4 | Calorie Restriction and Dietary Restriction Mimetics: A Strategy for I… | 2014 | unknown | human_observational | 0.63 |
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

## fit-01: fitness

**Query:** is cold exposure and ice baths real or hype?
**Context:** Claim-check. Some evidence for performance recovery, inflammation mixed.

### Planner output

**Intent:** `topic_exploration`
**Entities:** cold exposure, ice baths
**Hidden goals:** physiological effects of cold exposure, therapeutic benefits of cold exposure, risks of cold exposure, mechanisms of action, performance enhancement, recovery, mental health benefits

**Query variants (6):**
- cold water immersion physiological effects
- ice bath recovery athletic performance
- cold exposure mental health benefits
- cryotherapy immune system modulation
- cold shock protein mechanisms
- risks of cold water immersion

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 38 |
| After dedup/filter | 37 |
| Ranked (top 10) | 10 |
| Source: openalex | 38 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 2 |
| Human RCTs | 2 |
| Human observational | 8 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `promising`
**No evidence:** No
**Latency:** 66.0s

### Synthesis

> The evidence on cold exposure and ice baths for recovery is mixed but leans toward a real, modest benefit for reducing muscle soreness after intense exercise. Meta-analyses and some randomized trials show that cold water immersion can lessen soreness and perceived fatigue compared to doing nothing, though the effects are often small and study quality varies. However, not all studies agree—one trial found ice baths didn't reduce soreness or swelling—and the benefits may depend on factors like water temperature and timing. Overall, it's not pure hype, but the effects are likely more about temporary relief than dramatically speeding up healing.

**Follow-up options generated:**
- What's the difference between cold water immersion and contrast water therapy for recovery?
- Are there mental health benefits from cold exposure, or is that mostly anecdotal?
- How do ice baths compare to other recovery methods like active recovery or compression?
- What are the known risks or downsides of regular cold water immersion?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Ice-water immersion and delayed-onset muscle soreness: a randomised co… | 2007 | rct | strongest | 0.69 |
| 2 | The effects of multiple cold water immersions on indices of muscle dam… | 2008 | rct | strongest | 0.69 |
| 3 | The Effect of Post-Exercise Cryotherapy on Recovery Characteristics: A… | 2015 | meta_analysis | human_observational | 0.69 |
| 4 | Contrast Water Therapy and Exercise Induced Muscle Damage: A Systemati… | 2013 | meta_analysis | human_observational | 0.68 |
| 5 | Global, regional, and national incidence, prevalence, and years lived … | 2017 | unknown | human_observational | 0.57 |

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
- resistance exercise longevity dose-response
- muscle strength cardiovascular disease mortality
- strength training cancer mortality risk
- resistance training elderly all-cause mortality

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 44 |
| After dedup/filter | 34 |
| Ranked (top 10) | 10 |
| Source: openalex | 37 |
| Source: semantic_scholar | 7 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 3 |
| Human RCTs | 3 |
| Human observational | 6 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `promising`
**No evidence:** No
**Latency:** 92.7s

### Synthesis

> Evidence from large observational studies consistently shows that regular strength training is associated with a lower risk of dying from any cause, with benefits often seen at 30–60 minutes per week. The relationship appears J-shaped, meaning risk may increase again at very high volumes, though data at those levels are sparse. These findings come from cohort studies, not randomized trials, so they show correlation rather than proving causation. The strongest signal is for a modest, consistent routine rather than more extreme amounts.

**Follow-up options generated:**
- How does the mortality benefit of strength training compare to aerobic exercise like walking or running?
- What’s the ideal weekly dose of strength training for longevity, and does it differ by age?
- Are there specific health conditions where strength training shows the biggest survival advantage?
- What might explain the J-shaped curve—why could too much strength training be risky?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Effects of exercise on kidney and physical function in patients with n… | 2020 | meta_analysis | strongest | 0.87 |
| 2 | International Exercise Recommendations in Older Adults (ICFSR): Expert… | 2021 | rct | strongest | 0.76 |
| 3 | Abstract P5-07-13: Effect of a 12 Week Virtual Supervised Exercise Pro… | 2023 | rct | strongest | 0.73 |
| 4 | Exercise training and NR supplementation to improve muscle mass and fi… | 2022 | rct | strongest | 0.68 |
| 5 | The PRISMA Statement for Reporting Systematic Reviews and Meta-Analyse… | 2009 | meta_analysis | human_observational | 0.67 |

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
**Hidden goals:** cardiovascular adaptation, mitochondrial function, fat oxidation, lactate threshold, VO2 max improvement, disease prevention, longevity

**Query variants (5):**
- zone 2 training benefits vs high intensity interval training
- moderate intensity continuous training mitochondrial biogenesis
- zone 2 exercise fat oxidation capacity
- lactate threshold training cardiovascular adaptations
- low intensity steady state exercise metabolic health outcomes

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 39 |
| After dedup/filter | 36 |
| Ranked (top 10) | 10 |
| Source: semantic_scholar | 7 |
| Source: openalex | 32 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Human RCTs | 8 |
| Human observational | 3 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `preliminary`
**No evidence:** No
**Latency:** 124.2s

### Synthesis

> The evidence directly comparing zone 2 cardio to other intensities for specific benefits is surprisingly limited. Most studies compare moderate-intensity continuous training (MICT), which overlaps with zone 2, to high-intensity interval training (HIIT), and they generally find both improve fitness, but HIIT often leads to greater gains in cardiorespiratory fitness and mitochondrial adaptations. There is a lack of research isolating zone 2's unique effects on fat oxidation or longevity compared to other intensities in humans.

**Follow-up options generated:**
- What does the research say about zone 2 training specifically for improving mitochondrial function?
- How do different exercise intensities affect fat burning during and after a workout?
- Is there evidence that a mix of zone 2 and high-intensity training is better than either alone?
- What are the proposed longevity benefits of zone 2, and are they supported by human trials?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | AASLD Practice Guidance on the clinical assessment and management of n… | 2023 | rct | strongest | 0.78 |
| 2 | Interventions for preventing obesity in children | 2019 | rct | strongest | 0.74 |
| 3 | High‐intensity interval training in chronic kidney disease: A randomiz… | 2019 | rct | strongest | 0.74 |
| 4 | Exercise Snacks are a Time-Efficient Alternative to Moderate-Intensity… | 2024 | rct | strongest | 0.71 |
| 5 | Myocardial Adaptation to High-Intensity (Interval) Training in Previou… | 2015 | rct | strongest | 0.70 |

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

## claim-01: claim_check

**Query:** I saw online that seed oils cause inflammation and are toxic
**Context:** Should clearly separate mechanistic omega-6 claims from human RCT evidence.

### Planner output

**Intent:** `claim_check`
**Entities:** seed oils, inflammation, toxicity
**Hidden goals:** oxidative stress, cardiovascular health, metabolic health, omega-6 fatty acids, processing methods, health effects of dietary fats

**Query variants (6):**
- seed oils inflammation human clinical trials
- seed oils oxidative stress mechanisms
- omega-6 fatty acids health effects meta-analysis
- processed seed oils toxicity studies
- dietary fat intake cardiovascular disease risk
- seed oil consumption metabolic syndrome

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 35 |
| After dedup/filter | 28 |
| Ranked (top 10) | 10 |
| Source: openalex | 35 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 5 |
| Human observational | 6 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 45.3s

### Synthesis

> The claim that seed oils cause inflammation and are toxic isn't supported by the evidence you've shared, which largely focuses on omega-3 fatty acids rather than seed oils themselves. In fact, a large meta-analysis found no link between polyunsaturated fat intake (the main type in many seed oils) and cardiovascular disease risk, while another major guideline recommends replacing saturated fats with unsaturated fats for heart health. The studies here don't directly test seed oils for inflammation or toxicity in humans, so there's no strong evidence to back the claim—but they also don't show harm from these fats.

**Follow-up options generated:**
- What's the actual difference between seed oils and omega-3s, and why does that matter for inflammation?
- Are there any human studies that directly test whether seed oils increase inflammation markers?
- How do processing methods like refining or heating change the health effects of seed oils?
- What do long-term dietary patterns tell us about replacing butter or lard with oils like canola or soybean?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Effects of Omega-3 Fatty Acids on Muscle Mass, Muscle Strength and Mus… | 2020 | meta_analysis | strongest | 0.82 |
| 2 | Factors of Risk in the Development of Coronary Heart Disease—Six-Year … | 1961 | meta_analysis | strongest | 0.79 |
| 3 | A meta-analysis of the analgesic effects of omega-3 polyunsaturated fa… | 2007 | meta_analysis | strongest | 0.76 |
| 4 | Treating asthma with omega-3 fatty acids: where is the evidence? A sys… | 2006 | meta_analysis | strongest | 0.75 |
| 5 | Dietary total fat, fatty acids intake, and risk of cardiovascular dise… | 2019 | meta_analysis | human_observational | 0.71 |

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

## claim-02: claim_check

**Query:** is there evidence that social media causes depression in teenagers
**Context:** Contested. Cross-sectional dominates; few RCTs. Should note causation limits.

### Planner output

**Intent:** `claim_check`
**Entities:** social media use, depression, teenagers
**Hidden goals:** causal relationship, risk factors, mental health outcomes, adolescent development, longitudinal effects

**Query variants (5):**
- social media use adolescent depression longitudinal study
- social media mental health outcomes teenagers systematic review
- mechanisms linking social media and depression in adolescents
- social media screen time youth mood disorders
- cyberbullying social media depression risk teenagers

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 32 |
| After dedup/filter | 28 |
| Ranked (top 10) | 10 |
| Source: openalex | 32 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 6 |
| Human RCTs | 3 |
| Human observational | 2 |
| **Total** | **10** |

**Overall confidence:** `strong`
**Synthesis confidence:** `moderate`
**No evidence:** No
**Latency:** 114.6s

### Synthesis

> The evidence shows a clear association between social media use and depressive symptoms in teenagers, but it does not prove that social media directly causes depression. Most studies are observational, meaning they can't rule out that teens who are already depressed might use social media differently. The strongest patterns suggest that problematic use—like compulsive checking or feeling addicted—is more consistently linked to depression than just the amount of time spent, and that factors like sleep loss and social comparison may explain part of the connection.

**Follow-up options generated:**
- What specific behaviors on social media seem most linked to depression, like passive scrolling versus active posting?
- How do things like sleep, exercise, or in-person socializing change the relationship between social media and teen mood?
- Are there any studies that show reducing social media use actually improves depression symptoms in teenagers?
- Do the effects differ for boys and girls, or for younger versus older teens?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Exploring the Relationship Between Social Media Use and Symptoms of De… | 2024 | meta_analysis | strongest | 0.93 |
| 2 | Time Spent on Social Media and Risk of Depression in Adolescents: A Do… | 2022 | meta_analysis | strongest | 0.91 |
| 3 | A Systematic Review of the Association of Internet Gaming Disorder and… | 2023 | systematic_review | strongest | 0.90 |
| 4 | Improving mental health through fostering healthy lifestyles in young … | 2023 | rct | strongest | 0.81 |
| 5 | Association of Screen Time and Depression in Adolescence | 2019 | rct | strongest | 0.81 |

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

## claim-03: claim_check

**Query:** someone told me 10000 steps a day is necessary for health benefits
**Context:** Origin is marketing claim. Steps research has clear dose-response data.

### Planner output

**Intent:** `claim_check`
**Entities:** 10000 steps per day, health benefits
**Hidden goals:** cardiovascular health, mortality risk, weight management, metabolic health, mental well-being, optimal step count, minimum effective dose of steps

**Query variants (6):**
- daily step count all-cause mortality meta-analysis
- optimal step count cardiovascular disease prevention
- health benefits of walking fewer than 10000 steps
- sedentary lifestyle impact on health vs active step count
- step count recommendations public health guidelines
- dose-response relationship daily steps health outcomes

### Retrieval

| Metric | Value |
|--------|-------|
| Raw retrieved | 48 |
| After dedup/filter | 42 |
| Ranked (top 10) | 10 |
| Source: openalex | 41 |
| Source: semantic_scholar | 7 |

### Evidence snapshot

| Bucket | Count |
|--------|-------|
| Meta-analyses / systematic reviews | 9 |
| Human RCTs | 1 |
| Human observational | 3 |
| **Total** | **10** |

**Overall confidence:** `moderate`
**Synthesis confidence:** `strong`
**No evidence:** No
**Latency:** 367.2s

### Synthesis

> The claim that 10,000 steps a day is necessary for health benefits isn't supported by evidence. Large meta-analyses show that even fewer steps—often around 6,000 to 8,000 per day—are associated with lower risks of death and heart disease, with benefits continuing up to about 10,000 steps before leveling off. The 10,000 number appears to be a popular target, not a scientifically established threshold. So while more steps generally correlate with better health, you don't need to hit that specific number to see meaningful gains.

**Follow-up options generated:**
- What's the minimum number of daily steps linked to health benefits?
- Does walking speed or intensity matter more than total steps?
- How do step counts compare to other exercise for preventing heart disease?
- Are the benefits of steps different for younger and older adults?

### Top 5 papers

| # | Title | Year | Design | Bucket | Score |
|---|-------|------|--------|--------|-------|
| 1 | Daily steps and all-cause mortality: a meta-analysis of 15 internation… | 2022 | meta_analysis | strongest | 0.89 |
| 2 | Daily steps and health outcomes in adults: a systematic review and dos… | 2025 | meta_analysis | strongest | 0.88 |
| 3 | The association between daily step count and all-cause and cardiovascu… | 2023 | meta_analysis | strongest | 0.85 |
| 4 | Systematic review of the relationships between objectively measured ph… | 2016 | systematic_review | strongest | 0.83 |
| 5 | Abstract 15520: The Relationships Between Daily Step Counts With All-C… | 2022 | meta_analysis | strongest | 0.79 |

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