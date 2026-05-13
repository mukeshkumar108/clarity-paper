# Clarity Paper Architecture

Clarity Paper is a trust-focused scientific exploration platform. It has two distinct product surfaces:

1. **Document Analysis** — upload a single paper, get a structured editorial review with trust calibration, visible grounding, and Q&A
2. **Search** — ask a research question, get multi-paper evidence synthesis with full claim provenance

---

## Search Pipeline

The search pipeline is the primary evidence surface. Every step prioritises grounding: **the papers are the authority, not the AI.**

### Pipeline Stages

```
User query
  → ResearchPlanner        (LLM: intent, entities, language normalization, direct/context query lanes — Gemini Flash Lite)
  → retrievePlannedPapers  (direct evidence queries first; broader context only if direct lane is sparse)
  → deduplicatePapers      (DOI + title fuzzy dedup, guideline filtering)
  → rerankByRelevance      (Cohere Rerank 4 Fast: semantic relevance score per paper, soft off-topic filter)
  → applyTopicalVeto       (LLM: cheap conservative veto for obviously irrelevant intervention/condition mismatches)
  → rankPapers             (evidence scoring → evidenceBucket; relevance used as within-bucket tie-breaker)
  → evaluateEvidenceFit    (CPU: deterministic per-paper question-answer fit — direct/adjacent/weak/mismatch;
                            feeds fit-priority sort, synthesis labels, and judge quality component)
  → judgeRetrievalQuality  (LLM: topical relevance, off-topic detection; includes evidence-fit bonus)
  → [repairRetrieval]      (optional: re-retrieve with tightened queries — Gemini Flash Lite)
  → synthesisePapers       (LLM: evidence-constrained synthesis text — Gemini Flash Lite)
  → buildEvidenceSpans     (CPU: claim → snippet matching, no LLM)
  → validateGrounding      (causal overreach, numeric claim, model-prior checks)
  → SearchResult
```

### Model Assignments

| Role | Default model | Env var override | Rationale |
|------|--------------|-----------------|-----------|
| Research planner | `google/gemini-2.5-flash-lite` | `OPENROUTER_PLANNER_MODEL` | Pure JSON output; speed matters, prose quality doesn't |
| Query repair | `google/gemini-2.5-flash-lite` | `OPENROUTER_REPAIR_MODEL` | Same — generates revised query strings |
| Synthesis | `google/gemini-2.5-flash-lite` | `OPENROUTER_SEARCH_MODEL` | 3-4 sentences + JSON; Flash Lite sufficient |
| Reranker | `cohere/rerank-4-fast` | `OPENROUTER_RERANK_MODEL` | Semantic relevance scoring; set to `"disabled"` to skip |
| Doc analysis Pass 1 | `google/gemini-2.5-flash` | `OPENROUTER_STRUCTURED_MODEL` | Complex JSON extraction from full papers; needs full Flash |
| Doc analysis Pass 2 | `google/gemini-2.5-flash` | `OPENROUTER_EDITORIAL_MODEL` | User-facing prose; plain english summary |
| Doc analysis fast structured | `google/gemini-2.5-flash` | `OPENROUTER_FAST_STRUCTURED_MODEL` | Fast structured extraction for short search-result analyses |
| Doc analysis fast editorial | `anthropic/claude-3.5-haiku` | `OPENROUTER_FAST_EDITORIAL_MODEL` | Fast editorial prose for short search-result analyses |
| Doc analysis editorial backup | `anthropic/claude-3.5-haiku` | `OPENROUTER_EDITORIAL_BACKUP_MODEL` | Backup Pass 2 model when the primary editorial path times out or fails |
| Search synthesis backup | `anthropic/claude-3.5-haiku` | `OPENROUTER_SEARCH_BACKUP_MODEL` | Backup synthesis model when the primary search editorial path fails |

### Retrieval Sources

| Source | Client | Notes |
|--------|--------|-------|
| Semantic Scholar | `semanticScholarClient.ts` | Citation counts, study type; optional API key, circuit-breaks on repeated 429s |
| OpenAlex | `openAlexClient.ts` | Retraction status, citation percentile |
| EuropePMC | `europePMCClient.ts` | Biomedical depth, especially older literature |
| CORE | `coreClient.ts` | Open-access paper coverage, download URLs, useful fallback when Semantic Scholar is unavailable |

All four run in parallel. Results are deduped by DOI then title fuzzy match. If Semantic Scholar is rate-limited or unavailable, the pipeline degrades to OpenAlex + EuropePMC + CORE rather than failing the search.

### Language Handling

The planner now explicitly detects the user's language and produces:
- the original `userQuestion`
- a `normalizedEnglishQuestion` for literature retrieval
- `directQueryVariants` in English for high-precision evidence search
- `contextQueryVariants` in English for broader mechanism/background search

User-facing search synthesis and follow-up questions are written in the detected response language, while retrieval stays English-first to match the indexed literature.

### Direct vs Context Retrieval

Search no longer treats every planner query equally. It now uses a staged retrieval pattern:

1. Run the direct evidence lane first (`directQueryVariants`)
2. Deduplicate and count the direct candidates
3. Only expand into broader mechanism/background queries (`contextQueryVariants`) if the direct lane is sparse

This keeps intervention-condition searches tighter by default while still allowing the system to widen the net when direct evidence is genuinely thin.

### Evidence Bucket Ranking

Papers are scored and placed into one of five buckets (displayed in this order):

| Bucket | Criteria |
|--------|----------|
| `strongest` | Meta-analyses and systematic reviews |
| `human_observational` | Human RCTs, cohort, cross-sectional |
| `conflicting` | Papers with findings that contradict the synthesis direction |
| `mechanistic` | Animal studies, in vitro |
| `background` | Editorials, reviews without primary data |

### Evidence-Fit Evaluation (`evidenceFit.ts`)

New deterministic stage (no LLM) that evaluates how well each retrieved paper actually answers the user's question — distinct from paper quality or topical relevance.

**Per-paper dimensions:**
- **Intervention match** (exact / close / broader_class / different): Does the paper study the exact intervention the user asked about?
- **Outcome match** (exact / related / different): Does the paper measure the specific outcome the user cares about? (Uses planner's `hiddenGoals`)
- **Population match** (exact / overlapping / different): Is the population the user asked about? (Uses planner's `inclusionCriteria` + disease bleed detection)
- **Finding direction** (supports_claim / mixed / null / contradicts / unrelated): Do the paper's findings support or contradict the expected direction?
- **Head-to-head detection**: For comparison queries, checks if the paper actually compares interventions head-to-head

**Overall fit labels:** `direct` → `adjacent` → `weak` → `mismatch`

**Downstream effects:**
- `rankPapers` sorts fit-first (direct before adjacent before weak before mismatch)
- `synthesizer` receives fit labels per paper: "DIRECTLY on the question" vs "ADJACENT — related but not a direct answer"
- `retrievalJudge` quality score includes an `evidenceFitBonus` component (10% weight)

### Comparison Awareness (Planner P2)

The planner now detects comparison intent (`isComparison: boolean`, `comparisonTarget: string`) from queries like "is X better than Y?" or "X vs Y". The synthesis prompt receives explicit instructions to:
1. Distinguish head-to-head evidence from single-intervention studies
2. Flag when no direct comparison evidence exists
3. Separate indirect evidence from mechanism/inference
4. Explicitly name missing evidence for the comparison

### Follow-Up Grounding (P0)

Follow-up answers (`answer_current_results`, `refine_current_canvas`, `focused_retrieval_expansion`) now run through the same grounding validation (`validateGrounding`) and evidence span extraction (`buildEvidenceSpans`) as initial search. Previously, follow-up synthesis bypassed these quality gates entirely.

Follow-up synthesis also includes:
- **Claim deduplication**: Previous synthesis claims are extracted and passed as "DO NOT REPEAT" constraints
- **`whatChanged` enforcement**: When new papers are retrieved, the `whatChanged` field is required; a retry is triggered if missing or inadequate
- **Desired evidence types**: `plan.desiredEvidenceTypes` applies a soft penalty (0.85×) to papers not matching the user's preferred evidence levels

### Evidence Span Engine (`evidenceSpans.ts`)

Matches synthesis claims to verbatim abstract sentences — no LLM, no embeddings.

**Scoring factors:**
- Unigram overlap with entity weighting (plan entities get 2.0× weight)
- Bigram matching (1.5× weight per bigram)
- Negation detection: scan 60 chars before matched keyword; if negation word found, multiply score by 0.5
- Number proximity bonus: 0.05 per shared number token, max 0.15

**Support taxonomy (`SupportType`):**
- `strongly_supported` — score ≥ 0.42
- `partially_supported` — score ≥ 0.22
- `related_evidence` — score < 0.22

**Grounding safety invariant:** every snippet returned is a verbatim substring of its source abstract. No LLM can fabricate a snippet — the text is extracted directly from the retrieved paper.

### Coverage Note

`SearchResult.coverageNote` is always `"abstracts_only"` until full-text retrieval is implemented. Shown in the UI as "Based on paper abstracts · full texts not reviewed."

### Synthesis Constraints

The synthesis prompt has four hard rules (see `PROMPTS.md`):
- **Causal language** only permitted for RCT/meta-analysis evidence
- **No generalisation** beyond the population studied
- **Abstraction awareness** — must acknowledge working from abstracts
- **Uncertainty** — must surface contradictions between papers

**Comparison constraints (added P2):**
- For comparison queries, must distinguish head-to-head evidence from indirect evidence
- Must explicitly say when no direct comparison evidence exists
- Must not present single-intervention evidence as if it answers a comparison question

**Follow-up synthesis constraints (added P3):**
- Must not repeat claims from previous synthesis (deduplication enforced)
- Must fill `whatChanged` when new papers are retrieved (retry enforced)
- Must use fit labels to prioritize claims from directly-relevant papers

### Retrieval Judge & Repair Loop

After initial retrieval, `retrievalJudge.ts` scores quality on 5 dimensions (topical alignment, intervention match, population match, evidence type, off-topic/guideline penalty). If score is weak, `queryRepair.ts` re-retrieves with tightened queries and keeps whichever result set scores higher.

### Retrieval Observability

`DebugMetadata.retrievalSourceCounts` stores source counts at three stages:
- raw
- deduplicated
- final

This makes it possible to see when a search silently degraded to fewer upstream sources or when one source is polluting the candidate pool.

### Unpaywall Enrichment

`unpaywallClient.ts` resolves open-access PDF links by DOI. Runs in parallel with the synthesis LLM call — net latency cost is approximately zero.

### Frontend Components (Search)

| Component | Role |
|-----------|------|
| `SynthesisAnswer` | "First read" — synthesis text, confidence badge, coverage note |
| `EvidenceBehindRead` | Trust anchor section grouping evidence shape (counts) and claim-level provenance |
| `EvidenceSnapshot` | Evidence-shape summary: meta-analyses, RCTs, observational, mechanistic, conflicting counts |
| `EvidencePanel` | Claim-level provenance — expandable rows with verbatim abstract snippets and support labels |
| `FollowUpOptions` | Suggested conversational next-step queries shown directly under the evidence section |
| `MainRefineInput` | Primary refinement input in main flow, not sidebar — for asking follow-ups or narrowing scope |
| `PaperPathways` | **Right sidebar** — papers grouped by usefulness with progressive disclosure (2-3 initially) |
| `PaperCard` | Individual paper introduced as a pathway into understanding and into the explainer flow |
| `ResearchTrail` | Collapsed timeline showing exploration history and prior refinements |
| `CurrentFocusStrip` | Compact summary of what the current canvas is optimized for and what changed most recently |
| `ExplorationSidebar` | **Drawer pattern** — conversational refinement history accessible via toggle, not persistent rail |

**Layout:** Two-column grid (`grid-cols-[1fr_400px]` on xl screens). Left column: SearchResults (SynthesisAnswer → EvidenceBehindRead → FollowUpOptions → MainRefineInput → ResearchTrail). Right column: PaperPathways sidebar with sticky positioning. The search surface now opens with orientation and evidence grounding alongside paper pathways, followed by natural conversational refinement.

### Search Session Workspace

Search is no longer only a one-shot result page. The product now has two search routes:

- `/search` — entry page for a new exploration
- `/search/:sessionId` — persistent exploration workspace

The session workspace uses a **two-column conversational research flow**:

**Left column (conversational flow, ~60%):**
1. first read / current understanding
2. **evidence behind this read** (trust anchor — evidence counts + inspectable claims)
3. follow-up question chips
4. main ask/refine input (in-flow, not sidebar)
5. exploration trail / history (collapsed timeline)

**Right column (papers sidebar, ~40%):**
- recommended papers / paper pathways (2-3 initially, progressively disclosed)
- sticky positioning keeps papers visible while scrolling
- "Show more" control reveals all paper groups

The exploration sidebar has been converted to a **drawer pattern** — accessible via toggle in the header, not a persistent visual rail. It is not a generic chat surface. Its job is to help the user:

- ask about the current evidence without mutating the canvas
- narrow the current paper set when lightweight filtering is enough
- trigger focused retrieval when a new intervention, comparison, or subtopic is introduced
- ask one useful narrowing question when the user's direction is too broad

### Search Session Persistence

The underlying search session row still stores the current active search canvas:

- `query`
- `plannerOutput`
- `papers`
- `synthesisText`
- `confidence`
- `evidenceSnapshot`
- `followUpOptions`

Structured sidebar exchanges are stored separately in `search_session_messages` with:

- `role`
- `kind`
- `content`
- `metadata`

`metadata` is used to reconstruct the current focus state and the last visible refinement action without carrying a raw generic chat transcript back through the system.

### Sidebar Orchestration

The sidebar uses a lightweight orchestration step before touching the canvas. The orchestrator receives structured state:

- current query
- current focus summary and badges
- current synthesis
- current evidence snapshot
- top current papers
- planner entities and intent

It returns one of four operational action types:

- `answer_current_results`
- `refine_current_canvas`
- `focused_retrieval_expansion`
- `clarification_prompt`
- `exhaustive_intent_transparency`

The fifth path is intentionally non-mutating: when the user asks for exhaustive or bibliographic coverage (`find all papers`, `show all studies`, `literature review`, `comprehensive search`), the system explicitly says the current canvas is a curated starting set and does not pretend that the current papers are exhaustive.

Canvas mutation is intentionally lightweight in this phase:

- reuse and filter current papers when possible
- rebuild the stored synthesis/evidence over that narrowed set when reuse is enough
- rerun the existing search pipeline into the same session when focused retrieval is needed

This keeps the product paper-first while giving the session a real sense of continuity.

### Sidebar Guardrails

The orchestration layer now has a few explicit behavioral guardrails on top of the model output:

- personal-context refinements like `I'm just tired all the time` are treated as a change in exploration angle, not as a generic current-results question
- clarification replies must actually clarify; they must not claim that the canvas was already filtered or updated
- current-results answers are conservative when the abstract set does not support a strong read on duration, protocol, dosage, subgroup effects, or harms
- explicit exhaustive-intent phrases are intercepted and answered with transparency instead of fake breadth

### Paper Cache Deduplication

The `paper_cache` layer now deduplicates upsert rows by `cacheKey` before issuing a bulk `INSERT ... ON CONFLICT DO UPDATE`.

This prevents the prior Postgres `ERROR 21000` warning caused by duplicate constrained values inside a single upsert batch. The fix is operational only; it does not change retrieval or ranking behavior.

---

## Document Analysis Pipeline (The Two-Pass System)

The core logic resides in a multi-stage LLM pipeline designed to separate factual extraction from narrative synthesis.

1.  **Ingestion & Extraction**: Uploaded PDFs or pasted text are processed. PDFs are converted to markdown with `pymupdf4llm`, then sanitised so citations, references, figure captions, and whitespace noise are removed before analysis.
2.  **Pass 1: Structured Extraction (Internal)**:
    - **Goal**: Extract raw scientific data (methodology, findings, caveats, evidence signals).
    - **Model**: `google/gemini-2.5-flash` (override: `OPENROUTER_STRUCTURED_MODEL`).
    - **Output**: Strict JSON matching the `structuredAnalysisSchema`.
    - **Execution**: The full sanitised document is sent in a single Pass 1 request. There is no chunk merge step in the current pipeline.
3.  **Pass 2: Editorial Synthesis (User-Facing)**:
    - **Goal**: Transform the structured JSON into a compelling, human-readable narrative.
    - **Model**: `google/gemini-2.5-flash` (override: `OPENROUTER_EDITORIAL_MODEL`) with retry + backup failover to `OPENROUTER_EDITORIAL_BACKUP_MODEL` (default `anthropic/claude-3.5-haiku`).
    - **Output**: Narrative JSON containing hooks, findings, and trust-calibration sections.
    - **Failure policy**: if the editorial pass still fails after retry and backup, the analysis fails. Pass 1 extraction is never shown as a user-facing fallback.
4.  **Pass 3: Editorial Review (Optional)**:
    - **Goal**: Refine prose, ensure coherence, and remove "LLM-isms" or schema leakage.
    - **Model**: inherits `OPENROUTER_REVIEW_MODEL` (defaults to editorial model). Disabled by default; enable via `CLARITY_ENABLE_REVIEW_PASS=true`.

## Data Flow

1.  **Client**: User uploads a PDF via the `document-new` page.
2.  **API**: `POST /documents/upload` extracts text and stores the document in PostgreSQL (`documentsTable`) with status `uploaded`.
3.  **API**: `POST /documents/:id/analyse` triggers the `analyseDocument` service.
4.  **Service**: Executes the Two-Pass pipeline, storing the result in `documentAnalysisTable` and updating document status to `completed`.
5.  **Client**: `DocumentView` polls for completion, then fetches the analysis via `GET /documents/:id/analysis`.

## Frontend Structure

The frontend is a React SPA built with Vite, Tailwind CSS, and Shadcn UI.

- **Routing**: Handled by `wouter`.
- **Layouts**: `DashboardLayout` provides a consistent navigation shell.
- **Key Page: DocumentView**: Uses a `ResizablePanelGroup` (via `react-resizable-panels`) to display:
    - **Left Panel**: `ReadableDocumentView`, which renders the uploaded source with high-legibility typography.
    - **Right Panel**: The AI-generated narrative analysis, visible grounding/evidence cards, and "Research Q&A".
- **State Management**: `TanStack Query` (React Query) manages API synchronization and polling.
- **Component Style**: Prioritizes high-legibility typography ("Parchment" canvas, "Inkwell" text) to reduce cognitive load.

## Reader & Rendering Layer

Uploaded source text is rendered through a dedicated reader path:

- `normalizeReadableText(raw)` performs deterministic cleanup only:
  - removes orphaned page-number lines
  - repairs obvious PDF hard-wrap joins
  - repairs simple hyphenated line breaks
  - collapses excess blank lines
  - preserves headings, lists, tables, and fenced code
- `ReadableDocumentView` renders the cleaned source with:
  - `react-markdown`
  - `remark-gfm`
  - `rehype-sanitize`
  - a restrained prose shell tuned for long-form reading

The source renderer is format-tolerant rather than format-specific:

- markdown uploads render as markdown
- PDF extraction output from `pymupdf4llm` is treated as markdown-like text
- plain text is cleaned and rendered into the same reading shell

## Grounding UX Flow

The visible trust layer lives in `DocumentView` and is intentionally UI-only. It does not change retrieval or ranking logic.

1. Pass 1 / normalized analysis returns `keyFindings[]` including `sourceText`, `sourceInPaper`, and support strength.
2. The analysis pane maps each editorial finding to the best available supporting evidence.
3. Clicking a finding or evidence card sets the active evidence item.
4. The source pane highlights the matching snippet in the rendered document and scrolls it into view.

Shipped trust-layer UI primitives:

- **Evidence cards** with:
  - source snippet
  - source label / paragraph context
  - support type (`direct`, `indirect`, `contextual`, `general`)
  - confidence summary
  - evidence type (RCT, meta-analysis, observational, mechanistic, guideline, review, etc.)
- **Visible grounding banner** at the top of the analysis pane
- **Evidence spotlight** banner in the source pane when a snippet is active
- **Q&A tone over provenance tags**: document Q&A stays conversational and unlabeled; trust comes from honest uncertainty plus optional supporting evidence cards

The current Q&A grounding UI is designed to accept richer backend provenance later. Where structured provenance is not yet returned, the frontend falls back to the best available `keyFindings`-based evidence match.

## Deployment Topology

Production is split across:

- **Vercel** for the frontend SPA
- **Railway** for the Express API
- **Railway Postgres** for persistence and session storage

Vercel proxies `/api/*` to Railway so browser auth/session behavior remains same-origin in production. This is a product-level architectural requirement, not just a deployment convenience, because cross-origin session handling degraded the trust-critical reading flow.
