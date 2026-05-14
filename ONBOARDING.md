# Clarity — Onboarding for Debugging

Read this in order. It takes 5 minutes.

---

## What Clarity Is

A scientific investigation collaborator. Not a chatbot. Not a paper database. Not a claim verifier.

Two surfaces:
- **Document Analysis** — upload a paper, get editorial review with trust calibration (not relevant right now)
- **Search** — ask a messy human question, get evidence-grounded synthesis with verifiable provenance (this is what's broken)

Core principle: **papers are the authority, not the AI.** Every claim in the synthesis must be traceable to a verbatim abstract passage.

Voice: smart honest friend who understands science. Warm, direct, curious. Makes judgment calls. Never academic sludge.

---

## Files to Read (in order)

1. `AGENTS.md` — project identity, what we build for, voice rules, things never to change
2. `ARCHITECTURE.md` — pipeline stages, data flow, models, deployment
3. `PROMPTS.md` — synthesis prompt, editorial voice, constraints
4. `artifacts/api-server/src/lib/search/synthesizer.ts` — **the most important file** — all synthesis prompts live here
5. `artifacts/api-server/src/lib/search/index.ts` — pipeline orchestrator (`runSearch`), session persistence, message handling
6. `artifacts/api-server/src/routes/search.ts` — HTTP layer, follow-up dispatch, session overwrite, evidence merging
7. `artifacts/api-server/src/lib/search/types.ts` — all TypeScript types
8. `artifacts/clarity/src/components/search/ChatCanvas.tsx` — frontend chat rendering, sidebar, filters
9. `artifacts/clarity/src/lib/search-types.ts` — frontend type mirror
10. `CHANGELOG.md` — every change in last 3 days, with rationale

**The rest of the IMPLEMENTATION_PLAN.md is historical — skip it for debugging.**

---

## How the Search Pipeline Works

```
User types "is intermittent fasting better than calorie restriction?"
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 1. researchPlanner.ts — Gemini Flash Lite     │
│    Produces: ResearchPlan                      │
│    - intentType: claim_check / comparison / etc│
│    - entities: ["intermittent fasting", ...]   │
│    - isComparison: true, comparisonTarget: ... │
│    - directQueryVariants + contextQueryVariants│
│    - hiddenGoals, desiredEvidenceTypes         │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 2. retrieval.ts — 4 sources in parallel       │
│    Semantic Scholar + OpenAlex + EuropePMC +   │
│    CORE. Direct lane first, context only if   │
│    direct < 12 papers.                        │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 3-5. dedupe.ts → reranker.ts → topicalVeto.ts │
│    DOI+title dedup, Cohere relevance filter,   │
│    LLM-based irrelevance removal               │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 6. ranking.ts + evidenceFit.ts                │
│    - Classify study design (regex: meta → RCT  │
│    → cohort → editorial)                       │
│    - Compute evidence score (35% design + 20%  │
│    recency + 10% citation + 20% population +   │
│    15% outcome fit)                            │
│    - Evidence-fit label per paper:             │
│      direct / adjacent / weak / mismatch       │
│    - Sort: fit → bucket → score. Top 10.       │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 7. retrievalJudge.ts → queryRepair.ts         │
│    Quality score (includes evidenceFitBonus).  │
│    Triggers repair if quality < 0.28 or        │
│    entity conflation detected.                 │
│    Max 1 repair iteration.                     │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 8. synthesizer.ts — THREE parallel LLM calls   │
│                                                │
│    A. Editorial (Gemini 2.5 Flash, ~20s):      │
│       synthesisText — the answer prose          │
│                                                │
│    B. Mechanical (Flash Lite, ~5s):            │
│       paperSummaries + confidence + noEvidence  │
│                                                │
│    C. Follow-ups (Flash Lite, ~5s):            │
│       followUpOptions — next questions          │
│                                                │
│    Total latency: max(A, B, C) ≈ 20s           │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 9. groundingValidator.ts + evidenceSpans.ts   │
│    - Check: no fabricated numbers, no causal    │
│    overreach, no model-prior leakage           │
│    - Build: claim→snippet matching (deterministic│
│    bigram + entity weighting, no LLM)          │
│    - Safety: only verbatim abstract substrings  │
└──────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 10. Persist session + insert synthesis message │
│     search_sessions: query, plan, papers,       │
│       synthesisText (original first read),      │
│       evidenceSnapshot                          │
│     search_session_messages: kind="synthesis",   │
│       content=synthesisText, metadata           │
└──────────────────────────────────────────────┘
```

**Model assignments:**

| Role | Default model | Override env var |
|------|--------------|-----------------|
| Planner | Gemini 2.5 Flash Lite | `OPENROUTER_PLANNER_MODEL` |
| Editorial synthesis | Gemini 2.5 Flash | `OPENROUTER_SEARCH_MODEL` |
| Mechanical extraction | Gemini 2.5 Flash Lite | `OPENROUTER_SEARCH_LITE_MODEL` |
| Follow-up generation | Gemini 2.5 Flash Lite | `OPENROUTER_SEARCH_FOLLOWUP_MODEL` |
| Editorial backup | Claude 3.5 Haiku | `OPENROUTER_SEARCH_BACKUP_MODEL` |
| Reranker | Cohere Rerank 4 Fast | `OPENROUTER_RERANK_MODEL` |
| Topical veto | Llama 3.1 8B | `OPENROUTER_TOPIC_FILTER_MODEL` |
| Query repair | Gemini 2.5 Flash Lite | `OPENROUTER_REPAIR_MODEL` |

---

## How the Chat Interface Works

**Page:** `/search/:sessionId`

**Layout:** Two columns on md+ screens (768px+):
- Left: chat messages (scrollable)
- Right: persistent paper sidebar (sticky, turn-grouped)

**Data flow:**

1. Page loads → `GET /search/sessions/:id` → returns `SearchSessionDetail`
   ```
   {
     sessionId, query, plan, papers, synthesisText, confidence,
     evidenceSnapshot, followUpOptions, evidenceSpans, coverageNote,
     messages: [{ kind: "synthesis", content: "...", metadata: {...} },
                { kind: "refinement", content: "user question" },
                { kind: "canvas_update", content: "assistant answer" }],
     focusState: { summary, badges, lastActionLabel }
   }
   ```

2. `ChatCanvas` builds a unified message list:
   - Message[0] = initial synthesis (from `messages.find(kind === "synthesis")` or `result.synthesisText`)
   - Message[1+] = subsequent turns (user messages + assistant answers)
   - All rendered in a single loop as `AssistantMessage` components

3. Each `AssistantMessage` renders:
   - `SynthesisAnswer` — the prose text with confidence badge
   - `CompactEvidence` — collapsible paper counts + claim snippets
   - `FollowUpOptions` — clickable question chips (on every turn, not just first)
   - Recommended paper (1-2 direct-fit papers, first turn only)

4. `PapersSidebar` (right column) renders:
   - "Claims & evidence" — collapsible `EvidencePanel` (claim rows + verbatim snippets)
   - "Start here" — 2 recommended papers (direct fit + meta/RCT)
   - Turn groups — "Original evidence" / "Added: 'asked about X'" / etc.
   - NEW badge on most recent turn's papers
   - Click paper → expands to full detail view (abstract, badges, deep read)

5. `FilterChips` — "All evidence" / "RCTs & meta-analyses" / "Human only" pills above input
   - Client-side only, filters `result.papers` in memory

**Follow-up flow:**

```
User clicks follow-up chip or types question
  → POST /search/sessions/:id/messages { content }
  → sidebarOrchestrator.ts classifies action:
      - answer_current_results → synthesiseFollowUpAnswer (existing papers)
      - refine_current_canvas → filter + synthesiseFollowUpAnswer
      - focused_retrieval_expansion → rerunSearchIntoExistingSession
          → MERGE new papers into session (dedup by externalId)
          → synthesiseFollowUpAnswer (existing + new papers)
      - clarification_prompt → direct reply
  → Saves assistant message with metadata:
      - retrievalDelta: { newPaperIds, newPaperTitles, papersBefore/After }
      - evidenceSpans: follow-up claim→snippet provenance
      - followUpOptions: next-step chips
  → Frontend reloads session → new message renders inline
```

---

## Database Schema

```
search_sessions:
  id, user_id, query, planner_output (jsonb),
  papers (jsonb), synthesis_text, confidence,
  evidence_snapshot (jsonb), follow_up_options (jsonb),
  created_at

search_session_messages:
  id, session_id, role ("user"|"assistant"),
  kind ("synthesis"|"refinement"|"answer"|"clarification"|"canvas_update"),
  content, metadata (jsonb — canvasChanged, actionType, retrievalDelta,
    evidenceSpans, spanDiagnostics, followUpOptions),
  created_at

paper_cache:
  cache_key (pk), doi, external_id, source, title, abstract,
  authors, year, study_type, is_retracted, citation_count,
  citation_normalized_percentile, open_access_pdf_url, cached_at
```

---

## Current Issues to Investigate

1. **Synthesis voice still hedgy/flat** despite 3 prompt rewrites and model swap to Flash full. The model might still be producing safe consensus-language. Check: is the deployed model actually Flash full? Is the env var set correctly on Railway?

2. **Follow-up answers sometimes replace the page** — the session's `synthesisText` is preserved (not overwritten) but `result.synthesisText` might still be stale in the frontend. Check: does `ChatCanvas` correctly read from `messages[0].content` for the initial synthesis and `message.content` for follow-ups?

3. **"Based on abstracts" disclosure** — softened to `"Abstracts only · full texts not reviewed"` in 50% opacity. Check: is the UI showing the old or new version?

4. **Evidence not remaining grounded across turns** — follow-up evidence spans are computed (in `routes/search.ts`) and stored in message metadata, but the frontend sidebar only shows initial synthesis evidence spans. Check: does `EvidencePanel` in the sidebar accept per-message evidence spans?

5. **Follow-up questions duplicate** — `deduplicateFollowUpOptions()` normalizes case/whitespace. Check: does the LLM produce near-duplicates with different wording that passes the dedup?

6. **The "thin evidence" claim when 5 meta-analyses exist** — the prompt has: "If 3+ meta-analyses, do NOT call the evidence thin." Check: is this instruction being followed?

7. **Gemini's review said the answer hedges too much** — "comparable results" false equivalence, "surprisingly thin" when evidence is strong, "abstracts only" as cop-out. Each of these has a prompt fix already deployed. Check: is the deployed prompt the latest version?

---

## How to Deploy

Railway auto-deploys on push to `main`. Vercel auto-deploys frontend.

To verify what's deployed: check the Railway logs for the latest commit hash. The most recent commit is `655cc41` (follow-up generation split).

To test locally: the API server needs `OPENROUTER_API_KEY` set. Run `pnpm install && pnpm build && pnpm start` from `artifacts/api-server`.

---

## What's Changed in the Last 48 Hours

See `CHANGELOG.md` for full details. Quick summary:

- Evidence-fit scoring (direct/adjacent/weak/mismatch per paper)
- Comparison awareness (planner detects comparisons, synthesis handles them)
- Synthesis voice overhaul (3 iterations — interpretation over summarization)
- Follow-up deepening (claim dedup, whatChanged enforcement, paper merging)
- Canvas→Chat architecture (session no longer owns synthesis; messages do)
- Paper sidebar: persistent, turn-grouped, NEW badges, recommended papers
- Evidence claims moved to sidebar
- Filter chips (All/RCTs+Meta/Human only)
- Paper expansion (click → full detail in sidebar)
- Contradiction detection (deterministic pairwise between top-fit papers)
- Deep read (click → Pass 1+Pass 2 inline on paper abstract)
- Model split: editorial (Flash full) + mechanical (Flash Lite) + follow-ups (Flash Lite)
