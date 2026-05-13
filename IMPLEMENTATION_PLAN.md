# Clarity — Implementation-Ready Architecture & Roadmap

> Target: testable alpha by end of week for Morgan (Yale MD, scientifically literate) and Ashley (non-technical, real-life concerns).

---

## PART 1 — CURRENT ARCHITECTURE MAP

### 1.1 Search Pipeline (Initial Query)

```
Browser                    Vercel API                        Railway                          External APIs
──────                     ──────────                        ────────                         ─────────────
                                                                                                    
POST /search/stream  ──►   routes/search.ts:77            index.ts:runSearch()      ┌─ Semantic Scholar
                           │  requireAuth                  │  getQueryCache         ├─ OpenAlex
                           │  SSE headers                  │  └─ cache hit? emit +   ├─ EuropePMC
                           │  res.flushHeaders()           │     persist & return    ├─ CORE
                           │  runSearch(userId, query,     │                        └─ Cohere Rerank
                           │    progress callback)         ├─ 1. planResearch(query)    ┌─ OpenRouter
                           │  write done event             │   researchPlanner.ts      │  (Gemini Flash Lite)
                           │  res.end()                    │   └─ callLLM() →          └─ Unpaywall
                           ◄── SSE: papers, synthesis,     │      ResearchPlan
                              done                         │
                                                           ├─ 2. retrievePlannedPapers(plan)
                                                           │   retrieval.ts
                                                           │   └─ runBatch(directQueries)
                                                           │      if direct < 12 → runBatch(contextQueries)
                                                           │      └─ Promise.allSettled over 4 sources
                                                           │
                                                           ├─ 3. hydratePapersFromCache(rawPapers)
                                                           │   └─ paper_cache DB read + fire-and-forget upsert
                                                           │
                                                           ├─ 4. deduplicatePapers() + filterGuidelineDocuments()
                                                           │   dedupe.ts — DOI then title fuzzy (Jaccard ≥ 0.85)
                                                           │
                                                           ├─ 4a. rerankByRelevance(plan.normalizedEnglishQuestion, deduped)
                                                           │   reranker.ts — Cohere Rerank 4 Fast
                                                           │   └─ filters < 0.08 relevance, text-guard < 0.12
                                                           │
                                                           ├─ 4b. applyTopicalVeto(plan, rankPapers(reranked))
                                                           │   topicalVeto.ts — Llama 3.1 8B judge
                                                           │   └─ pre-filters: foreign intervention mismatch,
                                                           │      off-topic condition mismatch (disease bleed)
                                                           │
                                                           ├─ 5. rankPapers() + filterTopicallyWeakPapers()
                                                           │   ranking.ts + evidenceClassifier.ts + retrievalJudge.ts
                                                           │   └─ classifyStudyDesign (regex priority: meta → SR → RCT → ...)
                                                           │      classifyPopulationType (human / animal / in_vitro / unknown)
                                                           │      computeEvidenceScore (35% design + 20% recency + 10% citation
                                                           │        + 20% population + 15% entity-outcome fit)
                                                           │      assignEvidenceBucket (strongest / human_observational /
                                                           │        mechanistic / background / conflicting)
                                                           │      sort: bucket order → within-bucket 70% evidence + 30% relevance
                                                           │      cap at 10 papers
                                                           │      filterTopicallyWeakPapers (soft filter on low-relevance
                                                           │        off-topic / conflation / population-mismatch papers)
                                                           │
                                                           ├─ 5a. refreshRetractionStatus(rankedPapers)
                                                           │   └─ openAlexClient.checkRetractionStatus(doi) for strongest bucket
                                                           │
                                                           ├─ 5b. judgeRetrievalQuality(rankedPapers, plan)
                                                           │   retrievalJudge.ts
                                                           │   └─ computeRetrievalQualityScore (8 components)
                                                           │      detectOffTopicHighCitation, detectGuidelinePollution,
                                                           │      detectPopulationMismatch, detectEntityConflation,
                                                           │      detectMissingCanonicalEvidence, detectEvidenceTypeMismatch
                                                           │   └─ shouldTriggerRepair (zero papers / critical issues /
                                                           │      quality < 0.28 / entity conflation)
                                                           │
                                    ┌──────── SSE "papers" event emitted ────────┐
                                    │  onProgress({ type:"papers", ... })         │
                                    └─────────────────────────────────────────────┘
                                                           │
                                                           ├─ 5c. [repairRetrieval] (bounded: max 1 iteration)
                                                           │   queryRepair.ts
                                                           │   └─ pick highest-severity repair recommendation
                                                           │      LLM generates 2-4 repair queries (Gemini Flash Lite)
                                                           │      re-retrieve → dedupe → veto → rank → filter
                                                           │      compare scores → keep if improvement > dynamic threshold
                                                           │
                                                           ├─ 6. synthesisePapers(plan, finalPapers, snapshot) ║ enriches
                                                           │   synthesizer.ts          ║ parallel with
                                                           │   └─ formatPapersForSynthesis (top 10) ║ Unpaywall
                                                           │      LLM call (Gemini Flash Lite, 45s timeout) ║
                                                           │      fallback to Claude Haiku (75s) ║
                                                           │      fallback to hardcoded graceful error if both fail ║
                                                           │
                                                           ├─ 6b. enrichWithUnpaywall(finalPapers)  ║
                                                           │   unpaywallClient.ts — resolves OA PDF links ║
                                                           │
                                                           ├─ 7. applySummariesToPapers(papers, synthesis.paperSummaries)
                                                           │
                                                           ├─ 8. validateGrounding(synthesis, papers, snapshot)
                                                           │   groundingValidator.ts
                                                           │   └─ unsupported numeric claims, causal overreach,
                                                           │      "studies show" violations, model-prior leakage
                                                           │
                                                           ├─ 8a. buildEvidenceSpans(synthesis, papers, entities)
                                                           │   evidenceSpans.ts — deterministic claim→snippet matching
                                                           │   └─ extractClaims → unigrams/bigrams → score each abstract
                                                           │      sentence → classify (strongly ≥0.42 / partially ≥0.22 /
                                                           │      related ≥0.10) → verbatim substring guarantee
                                                           │
                                    ┌─────── SSE "synthesis" event emitted ───────┐
                                    │  onProgress({ type:"synthesis", ... })        │
                                    └──────────────────────────────────────────────┘
                                                           │
                                                           ├─ 9. Build DebugMetadata (per-stage latencies, counts)
                                                           │
                                                           ├─ 10. Persist search_sessions row + prune to 50
                                                           │
                                                           └─ Return SearchResult
```

### 1.2 Follow-Up / Session Pipeline

```
Browser                          Vercel API                                       Railway
──────                           ──────────                                       ───────

POST /search/sessions/:id/messages
                                 routes/search.ts:151
                                 │  requireAuth
                                 ├─ 1. Save user message (kind: "refinement")
                                 │
                                 ├─ 2. orchestrateSidebarInput(session, userInput)
                                 │   sidebarOrchestrator.ts
                                 │   └─ callLLM (Gemini Flash Lite)
                                 │      classify: answer_current_results /
                                 │        refine_current_canvas /
                                 │        focused_retrieval_expansion /
                                 │        clarification_prompt /
                                 │        exhaustive_intent_transparency
                                 │   └─ normalizeAction (deterministic overrides:
                                 │      personal-context reframing, explicit refinement,
                                 │      exhaustive-intent detection, precision-gap questions,
                                 │      broad topic fragments)
                                 │
                                 ├─ 3. Dispatch by action type:
                                 │
                                 │   ┌─ clarification_prompt
                                 │   │  └─ orchestrator reply (no retrieval)
                                 │   │
                                 │   ├─ exhaustive_intent_transparency
                                 │   │  └─ transparency reply (no retrieval)
                                 │   │
                                 │   ├─ answer_current_results
                                 │   │  └─ synthesiseFollowUpAnswer(existing papers only)
                                 │   │     NEW PAPERS: none
                                 │   │     NO grounding validation run
                                 │   │     NO evidence spans built
                                 │   │     NO retrieval judge run
                                 │   │
                                 │   └─ refine_current_canvas / focused_retrieval_expansion
                                 │      ├─ applyPaperFilters OR rerunSearchIntoExistingSession
                                 │      │  └─ rerunSearchIntoExistingSession calls runSearch()
                                 │      │     (full pipeline: plan → retrieve → rank → judge → repair → synthesize)
                                 │      ├─ diff newPapers = papersAfter ∖ papersBefore
                                 │      └─ synthesiseFollowUpAnswer(delta context)
                                 │         EXISTING papers + NEW papers
                                 │         Previous synthesis context (800 chars)
                                 │         whatChanged (optional — LLM may skip)
                                 │
                                 ├─ 4. Save assistant message with metadata
                                 │   (canvasChanged, actionType, focusBadges, focusSummary,
                                 │    retrievalMode, retrievalDelta)
                                 │
                                 └─ Return { messages, updated session }
```

### 1.3 State Architecture

```
Database Tables:
────────────────

search_sessions                    (per investigation)
  ├─ id, user_id, query, planner_output (jsonb)
  ├─ papers (jsonb), synthesis_text, confidence
  ├─ evidence_snapshot (jsonb), follow_up_options (jsonb)
  └─ created_at

search_session_messages            (per turn)
  ├─ id, session_id, role, kind
  ├─ content, metadata (jsonb)
  │   ├─ canvasChanged, actionType
  │   ├─ focusBadges, focusSummary
  │   ├─ retrievalMode, retrievalDelta
  └─ created_at

paper_cache                        (cross-session, persistent)
  ├─ cache_key (pk, e.g. "doi:10.xxx" or "ss:paperId")
  ├─ doi, external_id, source, title, abstract
  ├─ authors, year, study_type, is_retracted
  ├─ citation_count, citation_normalized_percentile
  ├─ open_access_pdf_url, cached_at
  └─ ON CONFLICT DO UPDATE on (cached_at, retraction, open_access)
```

### 1.4 File → Function Map

```
researchPlanner.ts
  ├─ planResearch(query) → ResearchPlan
  ├─ normalizeResearchPlan(plan) → ResearchPlan  (deterministic post-processing)

retrieval.ts
  ├─ retrievePlannedPapers(plan) → RetrievedPaper[]  (staged: direct → context)
  └─ retrievePapers(queryVariants) → RetrievedPaper[]  (flat batch)

semanticScholarClient.ts / openAlexClient.ts / europePMCClient.ts / coreClient.ts
  └─ searchXxx(query) → RetrievedPaper[]  (each with circuit breakers)

dedupe.ts
  ├─ deduplicatePapers(papers) → RetrievedPaper[]
  └─ filterGuidelineDocuments(papers) → RetrievedPaper[]

reranker.ts
  └─ rerankByRelevance(query, papers) → (T & { relevanceScore })[]

topicalVeto.ts
  └─ applyTopicalVeto(plan, rankedPapers) → RankedPaper[]

evidenceClassifier.ts
  ├─ classifyStudyDesign(abstract, title, pubTypes) → StudyDesign
  ├─ classifyPopulationType(abstract, title) → PopulationType
  └─ looksConflicting(abstract) → boolean

ranking.ts
  ├─ computeEvidenceScore(input) → number
  ├─ assignEvidenceBucket(design, pop, score) → EvidenceBucket
  ├─ rankPapers(papers, entities) → RankedPaper[]  (cap 10)
  └─ buildEvidenceSnapshot(papers) → EvidenceSnapshot

retrievalJudge.ts
  ├─ judgeRetrievalQuality(papers, plan) → RetrievalJudgment
  ├─ computeRetrievalQualityScore(papers, plan) → QualityScoreComponents
  ├─ filterTopicallyWeakPapers(papers, plan) → RankedPaper[]
  └─ isGuidelineTitle(title) → boolean

queryRepair.ts
  └─ repairRetrieval(papers, plan, judgment) → { papers, queriesUsed, ... }

synthesizer.ts
  ├─ synthesisePapers(plan, papers, snapshot) → SynthesisOutput
  └─ synthesiseFollowUpAnswer(params) → FollowUpSynthesisOutput

groundingValidator.ts
  └─ validateGrounding(synthesis, papers, snapshot) → GroundingResult

evidenceSpans.ts
  ├─ buildEvidenceSpans(synthesis, papers, entities) → EvidenceSpan[]
  └─ computeSpanDiagnostics(spans) → GroundingDiagnostics

unpaywallClient.ts
  └─ enrichWithUnpaywall(papers) → RankedPaper[]

sidebarOrchestrator.ts
  ├─ orchestrateSidebarInput(session, userInput) → SidebarAction
  └─ normalizeAction(session, input, action) → SidebarAction  (deterministic)

index.ts
  ├─ runSearch(userId, query, onProgress?) → SearchResult  (master orchestrator)
  ├─ getSearchSession(id, userId) → SearchSessionDetail
  ├─ listSearchSessions(userId) → summaries
  ├─ rerunSearchIntoExistingSession(userId, id, query) → result
  ├─ overwriteSearchSession(id, result) → void
  └─ buildSearchResultFromPapers(query, plan, papers) → result

routes/search.ts
  ├─ POST /search  (non-streaming)
  ├─ POST /search/stream  (SSE)
  ├─ GET /search/sessions
  ├─ GET /search/sessions/:id
  ├─ POST /search/sessions/:id/messages  (follow-up)
  └─ POST /search/analyse-paper  (deep-dive from search card)

Frontend:
  use-streaming-search.ts  — SSE consumption via ReadableStream
  search-session.tsx       — ChatCanvas with refinement dispatch
  ChatCanvas.tsx           — synthesis + evidence + follow-up chips
  PaperPathways.tsx        — right sidebar, progressive disclosure
  EvidencePanel.tsx        — claim rows + verbatim snippets
  CurrentFocusStrip.tsx    — current focus state summary
  ResearchTrail.tsx        — collapsed exploration timeline
```

---

## PART 2 — IDENTIFY ARCHITECTURAL DRIFT

### 2.1 Docs That No Longer Match Reality

| Doc | What's wrong |
|-----|-------------|
| `ARCHITECTURE.md:52` | Says `SearchResult.coverageNote` is "always `abstracts_only`" — *correct*, but not a drift. |
| `ARCHITECTURE.md:202-212` | Describes `metadata` format with exact field names from sidebar — *current code matches*. |
| `DECISIONS.md:19` | "Sidebar conversation is operational, not performative" — *implemented correctly*. |
| `AGENTS.md:129-130` | Says "abstract-only ambiguity should not be over-inferred in the sidebar" — *implemented via `looksLikePrecisionGapQuestion` in sidebarOrchestrator.ts*. |

**Overall: docs are well-maintained.** No major drift.

### 2.2 Dead Fields in ResearchPlan

Produced by `planResearch()` (`researchPlanner.ts:37-58`) but **never consumed** by any downstream stage:

| Field | Produced by | Never read by |
|-------|------------|---------------|
| `inclusionCriteria: string[]` | Planner LLM | Anything. Not in retriever, ranker, judge, or synthesizer. |
| `exclusionCriteria: string[]` | Planner LLM | Anything. |
| `desiredEvidenceTypes: string[]` | Planner LLM | Anything. (Check: `ranking.ts`, `retrievalJudge.ts` — neither reads it.) |
| `hiddenGoals: string[]` | Planner LLM | Partially consumed. `synthesizer.ts:164` includes them in the user message but the prompt doesn't instruct the LLM to *use* them. `topicalVeto.ts:109` includes them in the prompt but as informational context only. |

**Wasted LLM output:** 4 fields totaling ~10-20 tokens of structured output per request. The LLM is doing work that gets thrown away.

### 2.3 Duplicated Logic

| Logic | Location 1 | Location 2 | Issue |
|-------|-----------|-----------|-------|
| Guideline detection | `dedupe.ts:3-22` (`GUIDELINE_TITLE_PATTERNS`) | `retrievalJudge.ts:14-34` (`GUIDELINE_TITLE_PATTERNS`) | **Exact copy** of the same 22-element regex array. If a society acronym is added to one, the other silently diverges. |
| Disease bleed terms | `retrievalJudge.ts:42-52` (`DISEASE_TITLE_TERMS`) | Imported by `topicalVeto.ts:4` | Correctly deduplicated via import. |
| Negation patterns | `evidenceClassifier.ts:69-77` (`CONFLICTING_PATTERNS`) | Not shared with `.evidenceSpans.ts`'s `NEGATION_WORDS` | Different negation vocabularies used for different purposes, but conceptually related. Not critical. |
| Entity conflation pairs | `retrievalJudge.ts:69-75` (`CONFLATION_PAIRS`) | Only used by `detectEntityConflationRisk` and `buildRepairRecommendations` | Single source — correct. |

**Fix needed:** Extract `GUIDELINE_TITLE_PATTERNS` into a shared constant in `retrievalJudge.ts` and import it in `dedupe.ts`.

### 2.4 Shallow Abstractions

**Comparison intent is flattened.** The planner prompt at `researchPlanner.ts:118-121` describes comparison queries but the `ResearchPlan` type has no `isComparison` or `comparisonTarget` fields. The comparison intent is encoded only as a query string variant — downstream stages can't distinguish "single-intervention query" from "head-to-head comparison query" structurally.

**Evidence-fit is a gap.** Ranking (`ranking.ts`) scores paper *quality* (design, recency, citations) but not paper *fit* (does this paper answer the user's actual question?). The closest thing is:
- `outcomeFitScore` — simple substring match of entities in title+abstract (line 40-48)
- `relevanceScore` — Cohere semantic similarity (reranker)
- Neither checks whether the paper's findings *directionally* address the question.

**Grounding validation skips follow-ups.** `validateGrounding`, `buildEvidenceSpans`, and `computeSpanDiagnostics` are called in `runSearch` (initial query) but **never** in the follow-up path (`routes/search.ts:215-281`). Follow-up answers can contain unsupported numeric claims or model-prior leakage with no alarm.

### 2.5 Brittle Prompt Contracts

| Boundary | Contract | Brittleness |
|----------|----------|-------------|
| Planner → Retriever | `directQueryVariants`, `contextQueryVariants` | Solid — `normalizeResearchPlan` enforces 2-4 direct, 1-3 context. |
| Planner → Ranker | `entities` only | No `desiredEvidenceTypes`, no `minEvidenceLevel`, no population constraints. Ranker operates blind to planner's evidence-quality intent. |
| Planner → Synthesizer | Full `ResearchPlan` passed | Good — all fields included in user message. But `hiddenGoals` is informational only, not actionable. |
| Synthesizer → Grounding | `synthesisText` string | No structural claim list — `extractClaims` splits on `[.!?]` heuristically. Fragile for compound sentences. |
| Follow-up Synthesizer → None | `synthesisText` only | No grounding validation, no evidence spans, no span diagnostics. Follow-ups are a quality-vacuum zone. |

---

## PART 3 — THE CANONICAL INVESTIGATION PIPELINE

### 3.1 Pipeline Stages

```
USER QUESTION
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 1: INTENT UNDERSTANDING                        │
│ File: researchPlanner.ts                             │
│                                                      │
│ Input:  raw user question (messy human language)     │
│ Output: ResearchPlan                                  │
│                                                      │
│ Responsibilities:                                    │
│  • Detect language, normalize to English for retrieval│
│  • Classify intent (claim_check / topic_exploration / │
│    dose_question / paper_search / paper_explanation)  │
│  • Extract entities with precision                    │
│  • Detect comparison intent + comparison target       │
│  • Set minimum evidence level                         │
│  • Extract population constraints                     │
│  • Generate tagged query lanes                        │
│  • Generate follow-up questions                       │
│                                                      │
│ Schema contract:                                     │
│  → ResearchPlan MUST produce:                        │
│    - intentType, entities, normalizedEnglishQuestion  │
│    - queryLanes[] with category tags                  │
│    - minEvidenceLevel                                 │
│    - isComparison + comparisonTarget                  │
│    - populationConstraint                             │
│    - followUpQuestions[3-4]                           │
│                                                      │
│ Invariants:                                          │
│  • NEVER fabricate entities                          │
│  • NEVER generate queries that are synonyms          │
│  • NEVER include medical recommendations             │
│  • ALWAYS produce at least 2 evidence-lane queries    │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 2: RETRIEVAL PLANNING (EXECUTION)              │
│ File: retrieval.ts                                   │
│                                                      │
│ Input:  ResearchPlan.queryLanes                       │
│ Output: RetrievedPaper[] (raw, undeduped)             │
│                                                      │
│ Responsibilities:                                    │
│  • Execute core lanes first (direct, comparison,      │
│    population_specific)                               │
│  • Gate expansion: only run auxiliary lanes           │
│    (mechanism, adjacent) if core results < threshold  │
│  • Fan out each query to 4 sources in parallel        │
│  • Track source attribution per paper                 │
│                                                      │
│ Schema contract:                                     │
│  → Retrieval MUST:                                   │
│    - Respect lane priority order                      │
│    - Gate auxiliary lanes on core sufficiency         │
│    - Return source attribution                        │
│                                                      │
│ Invariants:                                          │
│  • NEVER skip core lanes                             │
│  • NEVER run auxiliary lanes when core is sufficient  │
│  • ALWAYS deduplicate before gating decision          │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 3: DEDUPLICATION & HARD FILTER                 │
│ File: dedupe.ts                                     │
│                                                      │
│ Input:  RetrievedPaper[]                             │
│ Output: RetrievedPaper[] (deduped, guideline-filtered)│
│                                                      │
│ Responsibilities:                                    │
│  • DOI-based exact dedup                              │
│  • Title Jaccard (≥0.85) fuzzy dedup for DOI-less    │
│  • Merge metadata from multiple sources               │
│  • Filter clinical guidelines / consensus / position  │
│    papers / society statements                        │
│  • Drop papers with thin abstracts and no DOI         │
│                                                      │
│ Invariants:                                          │
│  • NEVER merge papers if title similarity < 0.85     │
│  • ALWAYS keep the longer abstract when merging      │
│  • NEVER filter out DOI-keyed papers with thin abs    │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 4: RELEVANCE SCORING & VETO                     │
│ Files: reranker.ts, topicalVeto.ts                    │
│                                                      │
│ Input:  RetrievedPaper[]                             │
│ Output: (RetrievedPaper & { relevanceScore })[]       │
│                                                      │
│ Responsibilities:                                    │
│  • Cohere Rerank 4 Fast: semantic relevance 0-1       │
│  • Hard filter: relevance < 0.08 → discard            │
│  • Text guard: < 0.12 + no lexical overlap → discard  │
│  • LLM topical veto: remove clearly irrelevant papers │
│  • Deterministic pre-filters: foreign intervention,   │
│    off-topic condition (disease bleed)                 │
│  • Safety floor: never drop below 3 papers            │
│                                                      │
│ Invariants:                                          │
│  • NEVER override evidence hierarchy with relevance  │
│  • NEVER drop below 3 papers from veto               │
│  • ALWAYS fall back to deterministic if LLM fails     │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 5: EVIDENCE-FIT EVALUATION ← NEW               │
│ File: evidenceFit.ts  (to be created)                 │
│                                                      │
│ Input:  Paper[] + ResearchPlan                        │
│ Output: Paper[] + EvidenceFit per paper               │
│                                                      │
│ Responsibilities:                                    │
│  • Per paper: evaluate intervention exactness         │
│    (exact / close / broader_class / different)        │
│  • Per paper: evaluate outcome alignment              │
│    (exact / related / different)                      │
│  • Per paper: evaluate population alignment           │
│    (exact / overlapping / different)                  │
│  • Per paper: evaluate finding direction              │
│    (supports / mixed / null / contradicts / unrelated)│
│  • Compute overall fit score (weighted composite)     │
│  • For comparison intent: check if paper is actually  │
│    comparing interventions head-to-head               │
│  • Re-rank within buckets by evidence-fit → evidence  │
│    score → relevance (in that priority order)         │
│                                                      │
│ Schema contract:                                     │
│  → EvidenceFit MUST produce:                          │
│    - Per-paper fit label for synthesis prompt         │
│    - Aggregate fit metrics for judge                  │
│    - Contradiction detection between top-fit papers   │
│                                                      │
│ Invariants:                                          │
│  • NEVER use LLM for fit — deterministic only         │
│  • NEVER allow a high-fit irrelevant paper to         │
│    outrank a moderate-fit high-evidence paper         │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 6: RANKING & BUCKETING                          │
│ File: ranking.ts, evidenceClassifier.ts               │
│                                                      │
│ Input:  Paper[] + ResearchPlan + EvidenceFit[]        │
│ Output: RankedPaper[] (top 10) + EvidenceSnapshot     │
│                                                      │
│ Responsibilities:                                    │
│  • Classify study design (regex priority: meta → SR   │
│    → RCT → cohort → cross-sectional → case → editorial)│
│  • Classify population (human / animal / in vitro)    │
│  • Compute evidence quality score                     │
│  • Adjust score by desiredEvidenceTypes penalty       │
│  • Assign evidence bucket                             │
│  • Sort: bucket priority → fit-adjusted score         │
│  • Cap at 10 papers, enforce diversity across buckets │
│                                                      │
│ Invariants:                                          │
│  • NEVER let a mechanism paper outrank a meta-analysis│
│  • ALWAYS apply desiredEvidenceTypes soft penalty     │
│  • ALWAYS maintain at least 1 paper per bucket if     │
│    papers exist in that bucket                        │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 7: RETRIEVAL QUALITY JUDGMENT + REPAIR          │
│ Files: retrievalJudge.ts, queryRepair.ts              │
│                                                      │
│ Input:  RankedPaper[] + ResearchPlan                  │
│ Output: RetrievalJudgment + optionally repaired papers│
│                                                      │
│ Responsibilities:                                    │
│  • Score top-5 papers on 8 quality dimensions         │
│  • Detect: off-topic high-citation, guideline pollution│
│    population mismatch, entity conflation,             │
│    missing canonical evidence, evidence type mismatch  │
│  • Trigger repair on: zero papers, critical issues,   │
│    quality < 0.28, entity conflation                   │
│  • Repair: LLM generates tightened queries + re-retrieve│
│  • Compare scores; keep repaired set if improvement   │
│    exceeds dynamic threshold (0.02-0.05)               │
│  • Add: fit-adjusted trigger (if < 3 papers have      │
│    intervention match ≥ "close", repair even if        │
│    topical score is OK)                                │
│                                                      │
│ Invariants:                                          │
│  • MAX 1 repair iteration                            │
│  • NEVER repair if quality ≥ 0.28 with no issues     │
│  • NEVER keep repair results if score didn't improve │
│  • ALWAYS log repair decision and delta              │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 8: SYNTHESIS                                   │
│ File: synthesizer.ts                                 │
│                                                      │
│ Input:  ResearchPlan + RankedPaper[] + EvidenceSnapshot│
│         + EvidenceFit[] + previousSynthesis (if f/u)  │
│ Output: SynthesisOutput                               │
│                                                      │
│ Responsibilities:                                    │
│  • Generate "Short answer" → "The evidence" →         │
│    "So practically" structure                         │
│  • Enforce causal language gating (RCT/meta only)     │
│  • Enforce generalization constraint (name population)│
│  • Enforce abstract-only awareness                    │
│  • Surface contradictions between papers explicitly   │
│  • Use EvidenceFit labels to prioritize claims from   │
│    high-fit papers                                    │
│  • For comparison intents: explicitly check for        │
│    head-to-head evidence; flag gaps                   │
│  • For follow-ups: require whatChanged field when     │
│    hasNewPapers is true                               │
│  • Generate per-paper plain summaries                 │
│  • Generate genuine follow-up questions               │
│  • Reject repetition: receive previous claims as       │
│    "DO NOT RESTATE" constraints                       │
│                                                      │
│ Invariants:                                          │
│  • NEVER use causal language without RCTs/meta       │
│  • NEVER generalize beyond studied population         │
│  • NEVER smooth over contradictions                   │
│  • NEVER fabricate numbers not in papers             │
│  • ALWAYS start with the verdict, not setup           │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 9: GROUNDING VALIDATION & EVIDENCE SPANS        │
│ Files: groundingValidator.ts, evidenceSpans.ts         │
│                                                      │
│ Input:  SynthesisOutput.text + RankedPaper[]          │
│ Output: GroundingResult + EvidenceSpan[]              │
│                                                      │
│ Responsibilities:                                    │
│  • Extract numeric claims from synthesis              │
│  • Verify each numeric claim appears in ≥1 paper      │
│  • Detect causal overreach (causal lang w/o RCTs)    │
│  • Detect "studies show" claims without paper support │
│  • Detect model-prior leakage (broad consensus lang)  │
│  • Build evidence spans: split synthesis into claims, │
│    match each claim to verbatim abstract sentences    │
│  • Score: unigram (1×, entity 2×) + bigram (1.5×) +  │
│    negation (×0.5) + number bonus                     │
│  • Classify: strongly_supported ≥ 0.42,               │
│    partially_supported ≥ 0.22, related_evidence ≥ 0.10│
│  • Safety: ONLY emit verbatim substrings              │
│                                                      │
│ Invariants:                                          │
│  • NEVER use LLM for snippet extraction               │
│  • NEVER emit text not present in paper.abstract     │
│  • ALWAYS run on follow-up synthesis too              │
│  • NEVER exceed 3 snippets per claim, 2 per paper    │
└─────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ STAGE 10: INVESTIGATION STATE UPDATE                  │
│ Files: index.ts, routes/search.ts                     │
│                                                      │
│ Input:  SearchResult + previous session state         │
│ Output: Persisted SearchSessionDetail                 │
│                                                      │
│ Responsibilities:                                    │
│  • Persist session: query, plan, papers, synthesis,   │
│    evidence snapshot, follow-up options                │
│  • Persist turn messages with metadata                │
│  • Update focus state (summary, badges, last action)  │
│  • Track evidence delta: which papers are new, which   │
│    were superseded, why                               │
│  • Prune old sessions (max 50 per user)               │
│  • Populate query cache (1hr TTL, 200 entries)        │
│                                                      │
│ Invariants:                                          │
│  • NEVER lose papers from prior turns silently        │
│  • ALWAYS track what changed between turns            │
│  • NEVER let cache serve stale data without TTL       │
└─────────────────────────────────────────────────────┘
```

### 3.2 Cross-Stage Contracts

```
┌──────────────┐     ResearchPlan      ┌──────────────┐
│   Planner    │ ─────────────────────→│  Retriever   │
│              │  normalizedEnglishQuestion,            │
│              │  queryLanes[].queries,                 │
│              │  entities                              │
└──────────────┘                       └──────────────┘
                                               │
                                          RetrievedPaper[]
                                               │
                                               ▼
┌──────────────┐     ResearchPlan      ┌──────────────┐
│ EvidenceFit  │ ←────────────────────│    Ranker    │
│  Evaluator   │  entities,            │              │
│              │  isComparison,        │              │
│              │  comparisonTarget,    │              │
│              │  populationConstraint │              │
└──────────────┘                       └──────────────┘
       │                                      │
  EvidenceFit[]                          RankedPaper[]
       │                                      │
       └──────────┬───────────────────────────┘
                  │
                  ▼
┌──────────────┐  ResearchPlan + RankedPaper[] + EvidenceFit[]  ┌──────────────┐
│  Synthesizer │ ←─────────────────────────────────────────────→│  Judge       │
│              │                                                │              │
│  Output:     │                                                │  Output:     │
│  synthesisText│                                               │  judgment    │
│  paperSummaries                                               │  repair?     │
│  followUpOptions                                              │              │
└──────────────┘                                                └──────────────┘
       │
  synthesisText
       │
       ▼
┌──────────────┐  synthesisText + RankedPaper[]  ┌──────────────┐
│  Grounding   │ ──────────────────────────────→ │ Evidence     │
│  Validator   │                                 │  Spans       │
│              │                                 │              │
│  Output:     │                                 │  Output:     │
│  flags,      │                                 │  claim→snippet│
│  violations  │                                 │  provenance  │
└──────────────┘                                 └──────────────┘

KEY CONTRACTS:
───────────────

1. Planner → Everyone: ResearchPlan must be complete before retrieval starts.
   → No stage may receive partial plan data.
   → Dead fields must be removed or wired.

2. EvidenceFit → Synthesizer: Every paper given to synthesizer MUST have
   an EvidenceFit label. Synthesizer prompt MUST receive fit context.

3. Synthesizer → Grounding + Spans: synthesisText MUST be run through
   validation and span extraction. This applies to BOTH initial and follow-up
   synthesis. No exception path.

4. Judge → Repair: Repair MUST only trigger on concrete issues, not on
   borderline scores alone. Repair MUST produce comparable metrics for
   keep/reject decision.

5. State → Next Turn: Each turn MUST store what changed (papers added,
   focus shifted, confidence changed). Next turn's synthesis MUST receive
   delta context, not just raw accumulated state.
```

---

## PART 4 — MINIMUM HIGH-LEVERAGE IMPLEMENTATION PLAN

### Priority 0: Critical Bug — Follow-Ups Skip Grounding (Day 1 AM)

**What**: `validateGrounding` and `buildEvidenceSpans` are never called on follow-up synthesis.

**Files to change**: `routes/search.ts:215-281` (both `answer_current_results` and `refine_current_canvas` branches)

**Changes**:
```typescript
// After synthesiseFollowUpAnswer returns, in BOTH dispatch branches:
import { validateGrounding } from "../lib/search/groundingValidator";
import { buildEvidenceSpans, computeSpanDiagnostics } from "../lib/search/evidenceSpans";

// ... after synthesis object is received:
const grounding = validateGrounding(synthesis.synthesisText, papersForSynthesis, updatedSessionForSynthesis.evidenceSnapshot);
if (grounding.unsupportedNumericClaims > 0 || grounding.causalOverreach) {
  logger.warn({ grounding }, "Grounding issues in follow-up synthesis");
}
const evidenceSpans = buildEvidenceSpans(synthesis.synthesisText, papersForSynthesis, plan.entities);
```

**Complexity**: Low (~20 lines, copy existing pattern from `index.ts:617-641`)  
**UX impact**: High — prevents hallucinated numbers in follow-ups  
**Depends on**: Nothing

### Priority 1: Evidence-Fit Evaluation (Day 1 PM)

**What**: Add deterministic per-paper evaluation of how well each paper answers the user's actual question.

**File to create**: `artifacts/api-server/src/lib/search/evidenceFit.ts`

**Schema**:
```typescript
interface EvidenceFit {
  interventionMatch: "exact" | "close" | "broader_class" | "different";
  outcomeMatch: "exact" | "related" | "different";
  populationMatch: "exact" | "overlapping" | "different";
  findingDirection: "supports_claim" | "mixed" | "null" | "contradicts" | "unrelated";
  isHeadToHeadComparison: boolean;  // only meaningful when plan.isComparison
  overall: "strong" | "moderate" | "weak" | "irrelevant";
}
```

**Functions to implement**:
```typescript
evaluateEvidenceFit(paper: RankedPaper, plan: ResearchPlan): EvidenceFit

evaluateInterventionMatch(title: string, abstract: string, entities: string[]): EvidenceFit["interventionMatch"]
  // Reuse tokenize() from retrievalJudge.ts
  // exact: primary entity appears verbatim in title
  // close: primary entity appears in abstract, secondary entity in title
  // broader_class: entity words overlap with broader terms
  // different: no entity overlap

evaluateOutcomeMatch(abstract: string, hiddenGoals: string[], entities: string[]): EvidenceFit["outcomeMatch"]
  // Check if the paper measures what the user cares about vs tangential effects
  // Uses hiddenGoals (finally wired!) to check outcome alignment

evaluateFindingDirection(abstract: string, userQuestion: string): EvidenceFit["findingDirection"]
  // Reuse looksConflicting() from evidenceClassifier.ts
  // supports_claim: positive finding language + intervention match
  // null: null result language present
  // contradicts: null result + entity match
  // mixed: both positive and cautionary language
  // unrelated: no entity overlap at all
```

**Wire into ranking**: In `ranking.ts:rankPapers`, call `evaluateEvidenceFit` for each paper, use `overall` in the sort comparator:
```typescript
// New sort: fit-priority → bucket order → within-bucket score
ranked.sort((a, b) => {
  const fitOrder = { strong: 0, moderate: 1, weak: 2, irrelevant: 3 };
  const fitDiff = fitOrder[a.fit.overall] - fitOrder[b.fit.overall];
  if (fitDiff !== 0) return fitDiff;
  // ... existing bucket + score sort
});
```

**Wire into synthesis**: In `synthesizer.ts:formatPapersForSynthesis`, add fit label to paper formatting:
```
Evidence fit: strong | moderate | weak | irrelevant
```

**Wire into judge**: In `retrievalJudge.ts:computeRetrievalQualityScore`, add a `fitComponent` that counts papers with fit ≥ "moderate".

**Complexity**: Medium (~150 lines deterministic code, no LLM)  
**UX impact**: Very high — synthesis can distinguish "this paper is DIRECTLY about your question" vs "this paper is in the same ZIP code"  
**Depends on**: Nothing (reuses existing entity matching, null detection, disease bleed detection)

### Priority 2: Wire Dead Planner Fields (Day 2 AM)

**What**: Make `desiredEvidenceTypes`, `hiddenGoals`, and comparison intent actually consumed downstream.

**Changes**:

1. **`ranking.ts:computeEvidenceScore`** — add `plan.desiredEvidenceTypes` parameter and soft penalty:
```typescript
const designLabel = DESIGN_TO_LABEL[input.studyDesign];
if (plan.desiredEvidenceTypes?.length > 0) {
  const matchesDesired = plan.desiredEvidenceTypes.some(
    (type) => designLabel.toLowerCase().includes(type.toLowerCase()) ||
              input.studyDesign.toLowerCase().includes(type.toLowerCase())
  );
  if (!matchesDesired) score *= 0.85;
}
```

2. **`synthesizer.ts:userMessage`** — add comparison context (line 157-175):
```typescript
// After intent line:
plan.isComparison
  ? `⚠️ This is a COMPARISON question (${plan.userQuestion}). The user wants to know if [intervention A] is BETTER THAN or DIFFERENT FROM [intervention B]. Prioritize papers that compare them head-to-head. If no direct comparison papers exist, say so explicitly and explain what single-intervention evidence suggests about each.`
  : "",
```

3. **`synthesizer.ts:userMessage`** — add hidden goals as framing:
```typescript
// Existing line 164: `HIDDEN GOALS: ${plan.hiddenGoals.join(", ")}`
// Add after:
// "These are the angles the user is most interested in. When evidence supports these angles, frame your answer toward them."
```

4. **`researchPlanner.ts` schema** — add to zod schema:
```typescript
isComparison: z.boolean(),
comparisonTarget: z.string().nullable(),
```
And update the planner prompt to produce these fields.

5. **`topicalVeto.ts`** — `hiddenGoals` is already included at line 109. No change needed.

**Complexity**: Low (~30 lines across 4 files)  
**UX impact**: Medium-High — comparison questions get actually answered as comparisons, not as two separate single-intervention summaries  
**Depends on**: Priority 0 (for synthesizer changes to be safe)

### Priority 3: Follow-Up Deepening (Day 2 PM)

**What**: Follow-ups currently bypass the planner entirely. Add a re-planning step for `focused_retrieval_expansion`.

**Changes**:

1. **`routes/search.ts`** — in the `refine_current_canvas` / `focused_retrieval_expansion` branch, before `rerunSearchIntoExistingSession`:

```typescript
// After determining effectiveQuery:
// Re-plan for the follow-up context
const followUpPlan = await planResearch(effectiveQuery);
// Merge with original plan's entities and hiddenGoals for continuity
const enrichedQuery = followUpPlan.queryVariants.join(" OR ");
await rerunSearchIntoExistingSession(req.session.userId!, id, enrichedQuery);
```

Wait — `rerunSearchIntoExistingSession` already calls `runSearch()` internally, which calls `planResearch()` again. The real gap is that the follow-up synthesizer doesn't receive the follow-up's plan context.

2. **`synthesizer.ts:synthesiseFollowUpAnswer`** — pass the follow-up plan context:
```typescript
interface FollowUpSynthesisParams {
  // ... existing fields
  followUpPlan?: ResearchPlan;  // NEW: the plan generated for this follow-up
}
```
And in the user message, include the follow-up plan's entities, hidden goals, and comparison context.

3. **Make `whatChanged` required**: In `synthesizer.ts:followUpOutputSchema`:
```typescript
// Change:
whatChanged: z.string().optional(),
// To conditional requirement:
```
Better approach: add a runtime check after synthesis. If `hasNewPapers` is true and `whatChanged` is empty/undefined, regenerate with a stronger "YOU MUST FILL whatChanged" prompt constraint. Use a single retry (like the existing backup model pattern).

4. **Previous claim deduplication**: In `synthesizer.ts:userMessage` for follow-up:
```typescript
// Extract claims from previous synthesis (using evidenceSpans.extractClaims)
const previousClaims = extractClaims(previousSynthesis);
// Add to user message:
"DO NOT REPEAT these already-established findings:\n" +
previousClaims.map((c, i) => `  [${i + 1}] ${c}`).join("\n") +
"\n\nOnly surface what changed or what is new."
```

**Complexity**: Medium (~60 lines across 2 files)  
**UX impact**: High — follow-ups feel like investigation advancement, not re-summarization  
**Depends on**: Priority 0, Priority 2 (for comparison context propagation)

### Priority 4: Deduplicate Guideline Patterns (Day 3 AM — Quick Win)

**What**: Extract `GUIDELINE_TITLE_PATTERNS` to a shared constant.

**Changes**:
1. Move the array from `dedupe.ts:3-22` into `retrievalJudge.ts` (already exported as `isGuidelineTitle`).
2. Import `isGuidelineTitle` in `dedupe.ts` and replace the inline pattern array.
3. Delete the duplicated array from `dedupe.ts`.

**Complexity**: Trivial (~5 lines)  
**UX impact**: Low (correctness, no user-visible change)  
**Depends on**: Nothing

### Priority 5: Planner Can Reject Unanswerable Queries (Day 3 PM)

**What**: Vague queries like "what are the weirdest science findings lately?" should be caught at planning time, not after wasting retrieval calls.

**Changes**:

1. **`researchPlanner.ts` schema** — add:
```typescript
action: z.enum(["plan", "clarify"]),
clarificationQuestion: z.string().optional(),
```

2. **`researchPlanner.ts` prompt** — add rule:
```
If the user's question is too vague to produce useful retrieval queries
("what's the coolest science?", "weird findings", "anything interesting"),
set action to "clarify" and provide ONE narrowing question as clarificationQuestion.
Do this conservatively — only for genuinely unanswerable queries.
```

3. **`index.ts:runSearch`** — after `planResearch`, check `action`:
```typescript
if (plan.action === "clarify") {
  return {
    sessionId: 0,
    query,
    plan,
    synthesisText: plan.clarificationQuestion ?? "Could you be more specific about what you're looking for?",
    confidence: "preliminary",
    noEvidence: true,
    evidenceSnapshot: { ...empty },
    papers: [],
    followUpOptions: [],
    evidenceSpans: [],
    coverageNote: "abstracts_only",
  };
}
```

**Complexity**: Low (~30 lines)  
**UX impact**: Saves 10-30s of latency on unanswerable queries + avoids embarrassing "I found some papers but they're not really relevant" responses  
**Depends on**: Priority 0 (follows same early-return pattern)

### Implementation Sequencing

```
Day 1 AM:  Priority 0 (follow-up grounding)  ← Ship immediately
Day 1 PM:  Priority 1 (evidence-fit)         ← Core architectural add
Day 2 AM:  Priority 2 (dead fields)          ← Quick wiring
Day 2 PM:  Priority 3 (follow-up deepening)  ← Depends on P0+P2
Day 3 AM:  Priority 4 (dedupe cleanup)       ← Trivial, any time
Day 3 PM:  Priority 5 (planner rejection)    ← Depends on P0
Day 4-5:   Testing + tuning                  ← Use Part 5 test harness
```

### Complexity & Risk Summary

| Priority | New Code | New LLM Calls | Risk | Impact |
|----------|----------|---------------|------|--------|
| P0 | ~20 lines | 0 | Low (copy pattern) | High |
| P1 | ~150 lines | 0 (deterministic) | Medium (new sort logic) | Very High |
| P2 | ~30 lines | 0 | Low (add params) | Medium-High |
| P3 | ~60 lines | 0-1 (retry on missing whatChanged) | Medium (follow-up path change) | High |
| P4 | ~5 lines | 0 | None | Low |
| P5 | ~30 lines | 0 | Low (early return) | Medium |

**Total**: ~295 lines, 0-1 new LLM calls (only for whatChanged retry in P3), all existing models.

---

## PART 5 — TESTING PLAN

### 5.1 Eval Harness

The existing eval harness is at `artifacts/api-server/src/scripts/run-search-evals.ts`. Extend `artifacts/api-server/src/scripts/eval-queries.ts` with these test queries:

```typescript
// Core retrieval quality tests
export const EVAL_QUERIES = [
  // ── Health / intervention questions (Morgan's domain) ──
  {
    query: "is intermittent fasting better than calorie restriction for insulin sensitivity?",
    mode: "comparison",
    expects: {
      mustFind: "head-to-head comparison studies",
      mustNotFind: "single-intervention IF papers treated as comparison evidence",
      evidenceBar: "RCT or meta-analysis",
    },
  },
  {
    query: "does creatine help with mental clarity after bad sleep?",
    mode: "claim_check",
    expects: {
      mustSurface: "sleep deprivation context, not general cognition",
      mustNotDo: "generalize from athletic performance to mental clarity",
      population: "sleep-deprived adults, not athletes",
    },
  },
  {
    query: "what dose of magnesium glycinate helps with sleep quality?",
    mode: "dose_question",
    expects: {
      mustSurface: "specific mg doses from studies",
      mustNotFabricate: "no dose if not in abstract",
      caveat: "abstracts may not reveal exact dosing protocols",
    },
  },

  // ── Comparison questions ──
  {
    query: "is NMN better than NR for NAD+ levels?",
    mode: "comparison",
    expects: {
      mustDetect: "entity conflation risk (NMN vs NR)",
      mustFind: "papers specifically comparing NMN to NR",
      mustNotDo: "treat NR-only papers as NMN evidence",
    },
  },
  {
    query: "omega-6 vs omega-3 for inflammation",
    mode: "comparison",
    expects: {
      mustDetect: "entity conflation (conflation pairs in retrievalJudge)",
    },
  },

  // ── Hype / podcast questions (Ashley's domain) ──
  {
    query: "I heard on a podcast that taking 20 grams of creatine helps your brain recover from sleep deprivation. Is that true?",
    mode: "hype_check",
    expects: {
      mustSurface: "what the evidence actually says vs the 20g claim",
      mustCheck: "dose in studies vs claimed dose",
      mustNotDo: "just list creatine benefits without addressing the specific claim",
      tone: "curious, not dismissive; honest about overstatement",
    },
  },
  {
    query: "people say apple cider vinegar helps with bloating and digestion, is that real?",
    mode: "hype_check",
    expects: {
      mustSurface: "limited evidence / mechanistic only",
      mustNotDo: "present animal/in-vitro as human-confirmed",
    },
  },

  // ── Vague curiosity questions ──
  {
    query: "what are the weirdest science findings lately?",
    mode: "unanswerable",
    expects: {
      shouldReject: true,
      plannerAction: "clarify",
    },
  },
  {
    query: "tell me something interesting about the brain",
    mode: "too_broad",
    expects: {
      shouldReject: true,
      plannerAction: "clarify",
    },
  },

  // ── Under-studied topics ──
  {
    query: "does cold exposure actually help with depression or is that just wellness culture?",
    mode: "sparse_evidence",
    expects: {
      mayFind: "mechanistic or small studies only",
      mustSurface: "limited evidence",
      mustNotDo: "overstate mechanistic findings as clinical evidence",
    },
  },

  // ── Contradiction-heavy topics ──
  {
    query: "does vitamin D supplementation prevent respiratory infections?",
    mode: "contradiction_expected",
    expects: {
      mustSurface: "contradictory findings",
      mustNotSmooth: "don't say 'the evidence suggests' when it's split",
      mustUse: "meta-analyses when available",
    },
  },

  // ── Population-specific queries ──
  {
    query: "is intermittent fasting good for you, especially for men in their 30s and older?",
    mode: "population_specific",
    expects: {
      mustConstrain: "men, middle-aged",
      mustNotInclude: "papers about IF in PCOS, elderly, or children dominating results",
      mustSurface: "if evidence is mostly in other populations",
    },
  },

  // ── Follow-up simulation ──
  {
    query: "what's the evidence on meditation for anxiety?",
    mode: "initial_then_refine",
    followUps: [
      {
        question: "what about specifically for generalized anxiety disorder vs everyday stress?",
        expects: {
          shouldRetrieve: true,
          mustConstrain: "GAD, clinical anxiety, diagnosed",
          mustNotDo: "just re-read the same papers",
        },
      },
      {
        question: "how does it compare to CBT?",
        expects: {
          shouldRetrieve: true,
          mustFind: "head-to-head comparison trials",
          mustSay: "if no direct comparisons exist",
        },
      },
      {
        question: "what dose or protocol do the studies use?",
        expects: {
          shouldRetrieve: false, // answer from existing papers
          mustBeHonest: "if abstracts don't reveal protocol details",
        },
      },
    ],
  },
];
```

### 5.2 Expected Failure Modes (Checklist)

Run these manually after each priority ships:

| # | Failure Mode | Check | Priority |
|---|-------------|-------|----------|
| F1 | Follow-up answer contains "20g" not found in any paper | `validateGrounding` on follow-up | P0 |
| F2 | Comparison question answered with single-intervention summary | `isComparison` flag check in synthesis | P2 |
| F3 | "What changed" is missing when new papers were retrieved | `whatChanged` required check | P3 |
| F4 | Same claim repeated across 3 follow-up turns | Claim dedup check | P3 |
| F5 | High-fit irrelevant paper outranks moderate-fit high-evidence paper | Evidence-fit sort check | P1 |
| F6 | "I'm just tired all the time" treated as current-results question | Personal-context reframing in orchestrator | Existing |
| F7 | "Find all papers on meditation" presented as comprehensive | Exhaustive-intent detection | Existing |
| F8 | Vague query wastes 30s on retrieval | Planner rejection | P5 |
| F9 | Guideline document survives both dedup filter AND judge | Shared pattern check | P4 |
| F10 | Entity conflation (omega-3 in omega-6 query) survives ranking | Conflation detection in judge | Existing |

### 5.3 Orchestration Debugging Visibility

Already in `DebugMetadata` (`types.ts:228-248`). Ensure these fields are always populated:

- `latency` — per-stage timings (plan, retrieve, dedupe, rank, judge, repair, synthesis, total)
- `retrievalSourceCounts` — raw, deduplicated, final (per-source counts)
- `retrievalJudgment` — quality score components, issues, trigger reason
- `repairTriggered`, `repairStrategy`, `repairQueriesUsed` — repair decisions
- `grounding` — unsupported claims, causal overreach, model-prior leakage
- `groundingDiagnostics` — claims with support, avg confidence
- **NEW**: `evidenceFitSummary` — counts of strong/moderate/weak/irrelevant fit papers

### 5.4 Synthesis Quality Checks

For manual review after each test query:

1. **Verdict first**: Does the first sentence give a clear yes/no/mixed answer?
2. **No setup hedges**: Does it avoid "The literature suggests..." / "Research indicates..."?
3. **Specific numbers**: Are numbers from actual papers, not fabricated? (Check grounding validator output)
4. **Contradiction surfaced**: If evidence is mixed, is the contradiction explained directly?
5. **Population named**: Does it say "sleep-deprived adults" not "people" if that's who was studied?
6. **Abstract awareness**: Does it acknowledge abstraction limitations when relevant?
7. **No causal overreach**: For observational evidence, does it use "associated with" not "causes"?
8. **Follow-ups are specific**: Are follow-up questions genuinely useful next steps, not generic headers?

---

## PART 6 — WHAT SHOULD WAIT

### Tempting Overengineering (DO NOT BUILD YET)

1. **Full 7-lane retrieval taxonomy** with per-lane evaluation and lane-gating logic. The direct→context gate already handles 80% of this. Add lane categories only when evidence-fit evaluation proves we need finer-grained retrieval dispatch.

2. **Evidence ledger database table** (`session_evidence_ledger`). The current approach (paper diff in sidebar route + superseded paper tracking implicit in ranking) works for an alpha. Formalize when turn count per session routinely exceeds 10.

3. **LLM-based evidence-fit evaluation**. Deterministic fit (entity matching, null detection, population constraints) covers most cases without the latency and cost of another LLM call. Use LLM for fit only if deterministic fails to produce useful gradations in testing.

4. **Streaming follow-up answers**. Initial search SSE streaming works. Follow-ups are blocking HTTP — but the latency is ~10-20s (pipeline rerun or synthesis only), which is acceptable for an alpha. Streaming follow-ups adds frontend complexity with marginal UX gain at this scale.

5. **Embedding-based similarity for evidence spans**. The current bigram+entity+negation approach is fast, cheap, and deterministic. Adding embeddings would add latency and cost without clear quality improvement. Only consider if span confidence scores prove unreliable in testing.

6. **Auto-contradiction surfacing between papers** (structural, not just prompt-level). The "conflicting" bucket and prompt instruction to surface contradictions cover this for alpha. A pairwise contradiction detector would be a separate LLM call per paper pair — too expensive for the value at this stage.

7. **Planner confidence scores** ("I'm 70% sure this is a comparison intent"). Binary intent classification is sufficient. Confidence adds complexity without changing downstream behavior yet.

8. **Multi-turn conversation memory** beyond the current structured messages table. The sidebar orchestrator's action classification and focus state tracking are the right abstraction for a scientific investigation. Don't add raw chat memory — it would dilute the structured investigation model.

9. **Mobile-responsive search results layout**. Current `grid-cols-[1fr_400px]` works for desktop. Mobile can wait until after alpha validation.

10. **Full-text retrieval**. Abstract-only is the honest default. Full-text adds complexity (PDF fetching, parsing, vector storage) that isn't needed to prove the investigation model works.

### What the Alpha Does NOT Need

- User accounts beyond the demo session auth
- Multi-user collaboration
- Email/notification integration
- PDF upload for search (paste/abstract only)
- Citation export
- Saved/liked papers
- Paper recommendation beyond the current retrieval set
- A/B testing infrastructure

---

## PART 7 — END-OF-WEEK ALPHA GOAL

### What Must Be True

**For Morgan (MD, scientifically literate):**

1. She asks "is intermittent fasting better than calorie restriction for insulin sensitivity in men over 30?" and gets a response that:
   - Names the comparison explicitly ("IF vs CCR")
   - Distinguishes head-to-head trials from single-intervention studies
   - Says explicitly when no direct comparison evidence exists
   - Surfaces contradictions between papers
   - Labels evidence quality (meta-analysis, RCT, observational) clearly
   - Shows her the verbatim abstract passages behind each claim (click to inspect)
   - Gives her follow-up questions that advance the investigation, not re-hash

2. She asks a follow-up "what about specifically for HOMA-IR as the outcome?" and gets:
   - New papers if needed (focused retrieval)
   - Clear "what changed" delta from the previous synthesis
   - Not a re-summary of everything she already read

3. She looks at the evidence grounding and thinks: "I can verify every claim in this answer. I know which paper it came from. I can read the exact passage."

**For Ashley (non-technical, real-life concerns):**

1. She asks "I heard on a podcast that taking 20 grams of creatine helps your brain recover from sleep deprivation. Is that true?" and gets a response that:
   - Doesn't start with "according to the literature..." or "studies show..."
   - Says something like "Yes, but podcasts are cherry-picking one strong study while ignoring the mixed results"
   - Explains what the evidence actually found for the specific dose she asked about
   - Distinguishes mental from physical effects (the podcast may have conflated them)
   - Tells her honestly when the evidence is thin without making her feel stupid for asking
   - Uses plain language but doesn't dumb down the science
   - Makes her think "huh, I want to know more" not "okay, I have been informed"

2. She clicks a follow-up chip and the response feels like **the investigation is progressing**, not repeating.

3. She sees the evidence cards and thinks "oh, so this ISN'T just the AI making things up — I can actually see where it got this from" — even if she doesn't click into every snippet.

**What differentiates Clarity from Gemini/ChatGPT/Perplexity:**

| Dimension | Gemini/ChatGPT | Perplexity | Clarity |
|-----------|---------------|------------|---------|
| Grounding | Opaque — may fabricate | Shows sources but not passage-level | **Click any claim → see exact abstract sentence** |
| Trust model | "Trust me, I'm AI" | "Trust these links" | **"Here's why to trust it, and here's the catch"** |
| Evidence quality | Doesn't distinguish | Some source badges | **Structural: meta-analysis → RCT → observational hierarchy** |
| Uncertainty | Hedging boilerplate | None | **Specific: "abstracts don't reveal the dose protocol"** |
| Follow-ups | Generic chatbot continuation | New search | **Investigation advancement with delta tracking** |
| Comparison support | Summarize each, maybe compare | Lists both | **Explicit "head-to-head vs single-intervention" signal** |
| Voice | Assistant | Search engine | **Smart honest friend who understands science** |

### Brutal Honesty: What Won't Be Done by Friday

1. **Streaming follow-up answers** — they'll be blocking HTTP (10-20s wait). That's acceptable for alpha. Streaming can come in week 2.

2. **Evidence ledger with turn-level paper tracking** — the simple paper-diff in the sidebar route works for single follow-ups. Multi-turn investigations (5+ refinements) may accumulate stale papers. This is a week-2 hardening task.

3. **Planner rejection of bad queries** (P5) — nice to have but not critical for the first alpha test. Morgan and Ashley aren't going to ask "weirdest science findings" — they're asking real health questions.

4. **The full `queryLanes` array** — the current direct/context two-lane structure works. The 5-category expansion waits until evidence-fit proves we need finer-grained retrieval dispatch.

5. **Contradiction detection as a structural stage** — prompt-level contradiction surfacing is good enough for alpha. A dedicated contradiction detection stage is a week 3+ item.

### The Alpha Vibe Check

After shipping P0-P3, have Morgan and Ashley each run 3 queries of their own choosing and answer:

1. Did you understand the answer without re-reading it?
2. Did you trust the answer more than you would trust ChatGPT on the same question?
3. Did the follow-up feel like it advanced the investigation?
4. Did you click into any evidence snippets? If not, did you at least know they were there?
5. Would you come back to this tool next week?

If the answer to 4 of 5 is "yes" for both testers, the alpha is a success.
