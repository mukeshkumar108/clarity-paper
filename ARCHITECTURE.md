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
  → ResearchPlanner        (LLM: intent, entities, query variants — Gemini Flash Lite)
  → retrievePapers         (Semantic Scholar + OpenAlex + EuropePMC — all variants in parallel)
  → deduplicatePapers      (DOI + title fuzzy dedup, guideline filtering)
  → rerankByRelevance      (Cohere Rerank 4 Fast: semantic relevance score per paper, soft off-topic filter)
  → enrichWithUnpaywall    (open-access PDF links, runs in parallel with synthesis)
  → rankPapers             (evidence scoring → evidenceBucket; relevance used as within-bucket tie-breaker)
  → judgeRetrievalQuality  (LLM: topical relevance, off-topic detection)
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
| Doc analysis fast mode | `google/gemini-2.5-flash` | `OPENROUTER_FAST_MODEL` | Short abstracts from search results; Flash is fine |

### Retrieval Sources

| Source | Client | Notes |
|--------|--------|-------|
| Semantic Scholar | `semanticScholarClient.ts` | Primary; citation counts, study type |
| OpenAlex | `openAlexClient.ts` | Retraction status, citation percentile |
| EuropePMC | `europePMCClient.ts` | Biomedical depth, especially older literature |

All three run in parallel. Results are deduped by DOI then title fuzzy match.

### Evidence Bucket Ranking

Papers are scored and placed into one of five buckets (displayed in this order):

| Bucket | Criteria |
|--------|----------|
| `strongest` | Meta-analyses and systematic reviews |
| `human_observational` | Human RCTs, cohort, cross-sectional |
| `conflicting` | Papers with findings that contradict the synthesis direction |
| `mechanistic` | Animal studies, in vitro |
| `background` | Editorials, reviews without primary data |

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

### Retrieval Judge & Repair Loop

After initial retrieval, `retrievalJudge.ts` scores quality on 5 dimensions (topical alignment, intervention match, population match, evidence type, off-topic/guideline penalty). If score is weak, `queryRepair.ts` re-retrieves with tightened queries and keeps whichever result set scores higher.

### Unpaywall Enrichment

`unpaywallClient.ts` resolves open-access PDF links by DOI. Runs in parallel with the synthesis LLM call — net latency cost is approximately zero.

### Frontend Components (Search)

| Component | Role |
|-----------|------|
| `EvidenceSnapshot` | Leads the results page — counts by bucket, overall confidence |
| `SynthesisAnswer` | "What the evidence suggests" — synthesis text, confidence badge, coverage note |
| `EvidencePanel` | Claim-level provenance — expandable rows with verbatim abstract snippets |
| `PaperCard` | Individual paper with evidence bucket, study design, plain summary |
| `FollowUpOptions` | Suggested follow-up queries from the research plan |

**Order in `SearchResults.tsx`:** EvidenceSnapshot → SynthesisAnswer → EvidencePanel → Paper cards → FollowUpOptions. Evidence leads; AI synthesis follows.

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
    - **Model**: `google/gemini-2.5-flash` (override: `OPENROUTER_EDITORIAL_MODEL`). Previously DeepSeek v4 Pro; switched to Flash after timeout issues.
    - **Output**: Narrative JSON containing hooks, findings, and trust-calibration sections.
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
- **Q&A grounding labels**: `[doc]` vs `[general]`

The current Q&A grounding UI is designed to accept richer backend provenance later. Where structured provenance is not yet returned, the frontend falls back to the best available `keyFindings`-based evidence match.

## Deployment Topology

Production is split across:

- **Vercel** for the frontend SPA
- **Railway** for the Express API
- **Railway Postgres** for persistence and session storage

Vercel proxies `/api/*` to Railway so browser auth/session behavior remains same-origin in production. This is a product-level architectural requirement, not just a deployment convenience, because cross-origin session handling degraded the trust-critical reading flow.
