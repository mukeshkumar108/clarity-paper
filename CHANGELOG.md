# Changelog

All notable product and engineering changes should be tracked here.

## 2026-05-12

### Search — UX Restructure: Conversational Research Flow

**Goal:** Move from "evidence canvas + persistent sidebar" toward "conversational research flow grounded in structured evidence artifacts."

This is not a generic chat thread. This is a trust-first exploration surface where evidence is the anchor, not a footnote.

#### New Component Hierarchy

**New page structure (top to bottom):**
1. Query/session heading
2. Compact current focus strip
3. First Read / current understanding
4. **Evidence behind this read** (NEW — trust anchor)
5. Follow-up question chips
6. Main ask/refine input (NEW — in-flow, not sidebar)
7. Recommended papers / paper pathways (2-3 initially, progressively disclosed)
8. Show more papers control
9. Exploration trail / history (NEW)

#### New Components Created

- **`EvidenceBehindRead.tsx`** — Groups `EvidenceSnapshot` and `EvidencePanel` into a cohesive trust section. Shows paper counts, evidence shape (meta-analyses, RCTs, etc.), curated-set transparency, and expandable claim-level provenance.
- **`MainRefineInput.tsx`** — Primary refinement input positioned in the main flow, after follow-up chips. Submits to existing sidebar orchestration endpoint.
- **`ResearchTrail.tsx`** — Collapsed timeline showing exploration history: started with query, refined to X, asked Y, focused retrieval, etc. Display-only (no branching/restore).

#### Modified Components

- **`SearchResults.tsx`** — Complete restructure. New order: Synthesis → EvidenceBehindRead → FollowUpOptions → MainRefineInput → Paper pathways (2-3 initially) → ResearchTrail. Papers progressively disclosed with "Show more" control.
- **`ExplorationSidebar.tsx`** — Converted to **drawer pattern**. Now accepts `isOpen`/`onClose` props. Renders as overlay drawer when toggled, not persistent rail. Backdrop click closes. Toggle button appears in header when messages exist.
- **`search-session.tsx`** — Layout changed from grid (canvas + sidebar) to single-column centered flow (max-w-3xl). Header includes drawer toggle button. Main content area contains all components in conversational order.

#### Key UX Changes

**Evidence positioning:**
- Evidence section now appears **immediately after First Read**, not at the bottom
- Evidence is the trust anchor, not a footnote
- Softer copy: "We checked this first read against X papers. This is a curated starting set, not a full literature sweep."
- Claim-level provenance collapsed by default under "Inspect the claims" toggle

**Paper display:**
- Only **2-3 papers shown initially** (from "Where I'd start" group)
- "Show more papers" button reveals remaining papers + all groups
- Paper cards remain first-class objects (not citations)
- Progressive disclosure respects cognitive load

**Refinement input:**
- Moved from persistent sidebar to **main flow**
- Positioned after follow-up chips, before papers
- Uses same backend endpoint (`/api/search/sessions/:id/messages`)
- Same action model: `answer_current_results`, `refine_current_canvas`, `focused_retrieval_expansion`, `clarification_prompt`, `exhaustive_intent_transparency`

**Sidebar/drawer:**
- No longer dominates layout as persistent rail
- Accessible via "History" toggle button in header
- Shows full message history and refinement input
- Maintains all existing functionality

**Research trail:**
- Collapsed timeline of exploration steps
- Shows: started with query, refined to X, asked Y, etc.
- Display-only (no click-to-restore in this phase)

#### What Didn't Change

- **Zero backend changes** — same retrieval, ranking, synthesis, orchestration
- **No prompt changes** — editorial voice unchanged
- **No API contract changes** — same endpoints, same payloads
- **Evidence span engine unchanged** — same grounding safety
- **Paper card design unchanged** — same functionality
- **Sidebar orchestration logic unchanged** — same action types and guardrails

#### Files Changed

**New files:**
- `artifacts/clarity/src/components/search/EvidenceBehindRead.tsx`
- `artifacts/clarity/src/components/search/MainRefineInput.tsx`
- `artifacts/clarity/src/components/search/ResearchTrail.tsx`

**Modified files:**
- `artifacts/clarity/src/components/search/SearchResults.tsx`
- `artifacts/clarity/src/components/search/ExplorationSidebar.tsx`
- `artifacts/clarity/src/pages/search-session.tsx`

**Documentation updated:**
- `AGENTS.md` — updated Current State section
- `ARCHITECTURE.md` — updated Frontend Components and Search Session Workspace sections

## 2026-05-11

### Document Analysis — Upload/Analyse Reliability
- fixed duplicate upload submissions: `document-new.tsx` now tracks `uploading` state and disables the submit button during file upload + analysis trigger
- fixed duplicate analyse submissions: backend `/documents/:id/analyse` now returns early with `{ alreadyRunning: true }` if the document status is already `analysing`
- fixed unguarded "Start analysis" button in `document-view.tsx` — now properly disabled during mutation
- replaced misleading "Almost ready..." progress stage with honest "Writing the trust section..."
- updated progress copy from "~45 seconds" to "30–90 seconds"
- added stage-aware button text: "Uploading file…" / "Starting analysis…" during pending state
- clear error toast on upload failure with `setUploading(false)` to unlock the form

### Document Analysis — Latency Fixes
- tightened Pass 2 editorial attempt timeouts from 180s/90s to 60s per attempt, 75s for backup
- this prevents a single hung primary attempt from blocking for ~180s before retry
- worst case total for all 3 attempts drops from ~570s to ~195s
- fixed `.env.example` editorial model from `deepseek/deepseek-v4-pro` to `google/gemini-2.5-flash` (matching production docs)
- fixed `.env.example` `CLARITY_ENABLE_REVIEW_PASS` from `true` to `false` (review pass adds ~45s and is not intended for production)
- fixed README production env vars to match documented editorial model and disabled review pass
- added `reviewPassEnabled` and `editorialModel` to timing log output for quick production diagnosis

### Document Analysis — Observability
- added per-pass timing instrumentation to the document analysis pipeline
- exported `DocumentAnalysisTimings` interface from `documentAnalysisService.ts`
- measures: `pass1LlmMs`, `pass1ParseMs`, `editorialContextBuildMs`, `pass2AttemptsMs[]`, `pass2ParseMs`, `assemblyMs`, `reviewPassLlmMs`, `reviewPassParseMs`
- route-level timing in `documents.ts`: `dbFetchUserMs`, `dbFetchDocumentMs`, `dbCheckExistingMs`, `dbUpdateAnalysingMs`, `dbUpsertAnalysisMs`, `dbUpdateCompletedMs`, `dbUsageEventMs`, `totalBackgroundMs`, `totalRouteMs`
- structured JSON log on success (`"Document analysis timing"`) with documentId, userId, and full timings breakdown
- structured JSON log on failure (`"Background analysis failed"`) with timings up to the failure point and a `failedAtStage` heuristic
- no product behavior changes; no schema changes; no prompt or model changes
- timing is threaded through an optional `timings` accumulator — the search route's `"Analyse this paper"` fast-mode path is unaffected

## 2026-05-12

### Document Analysis — Upload Speed
- removed pre-upload PDF title extraction (`/api/documents/extract-title` no longer called on file select)
- file select now sets title to filename instantly instead of running full PDF→markdown conversion (~18s saved)
- route left in place but marked deprecated in case other flows depend on it
- upload route logs filename, fileSizeKb, conversionMs, extractTotalMs, context for production monitoring

### Document Analysis — PDF Conversion Speed
- optimized `pdf_to_markdown.py` pymupdf4llm options: `ignore_images=True`, `ignore_graphics=True`, `detect_bg_color=False`, `force_text=True`
- these skip image bounding box collection, vector graphics path processing, and per-page pixmap rendering for background color detection
- keeps pymupdf4llm's full layout engine (handles variable column layouts, spanning tables, mixed single/double-column pages correctly)
- benchmarked at 2.5x faster with 100% word retention on synthetic PDFs; real papers with figures will see more
- Python subprocess spawn still adds ~3-5s per conversion — persistent worker is a documented future optimization when traffic justifies it

### Frontend UX
- removed `titleLoading` state and extract-title spinner from upload form
- title field populated with filename (no extension) on file select — instant, no network call
- submit button copy: "Uploading & extracting text…" instead of "Uploading file…"

## 2026-05-12

### Document Analysis — Editorial Model Swap
- Pass 2 editorial primary model changed from `google/gemini-2.5-flash` to `anthropic/claude-3.5-haiku`
- Pass 2 editorial backup model changed from `anthropic/claude-3.5-haiku` to `google/gemini-2.5-flash`
- Gemini was timing out on editorial synthesis; Haiku succeeds faster and more reliably
- env overrides still work: `OPENROUTER_EDITORIAL_MODEL`, `OPENROUTER_EDITORIAL_BACKUP_MODEL`

### Document Analysis — Pass 1 Schema Diet
- removed 22 fields from Pass 1 structured extraction schema that were never surfaced to the user or editorial handoff
- findings: removed `sourceContext`, `effectDirection` (kept `sourceText`, `finding`, `plainMeaning`, `populationOrSample`, `supportLevel`)
- limitations: removed `severity`, `practicalConsequence`, `whatWouldStrengthenIt` (kept `limitation`, `whyItMatters`)
- removed entire `methodologicalConcerns` array
- misreadings: removed `whyTheDistinctionMatters` (kept `misleadingClaim`, `whatThePaperSupports`)
- relevance: removed `actionability`, `actionabilityReasoning`, `caution` (kept `whyItMatters`, `practicalMeaning`)
- evidenceSignals: collapsed from 9 fields to 3 (`studyType`, `sampleSize`, `controls`)
- methodologySnapshot: collapsed from 6 fields to 3 (`design`, `numberOfStudiesOrParticipants`, `analysisMethod`)
- keyTerms: removed `simpleEnglish` (kept `term`)
- missingInfo: removed `whyItMatters` (kept `item`)
- all downstream normalizers updated to provide stable defaults for the `NormalizedAnalysis` internal type
- frontend rendering unchanged — removed fields were never shown to users
- expected Pass 1 output token reduction: ~30-35%

### Document Analysis — Editorial Retry Fix
- removed same-model retry: editorial now tries primary → backup (was primary → retry → backup)
- saves ~60s when primary model fails (no point retrying the same model)
- same fix applied to search synthesis
- added structured logs: `Editorial attempt start/failed/succeeded` with model, timeoutMs, attemptMs, errorName

### Document Analysis — PDF Conversion
- removed pre-upload PDF title extraction (`/extract-title` no longer called on file select)
- file select now sets title to filename instantly instead of running full PDF→markdown conversion (~18s saved)
- added external PDF-to-Markdown microservice support behind `USE_EXTERNAL_PDF_MD_SERVICE=true`
- external service reduces conversion from ~105s to ~14s on production
- pymupdf4llm optimized: `ignore_images=True`, `ignore_graphics=True`, `detect_bg_color=False`
- upload route logs filename, fileSizeKb, conversionMs, extractTotalMs, converter (external/local)

## 2026-05-10

### Reader UX
- replaced raw plaintext source rendering with `ReadableDocumentView`
- added markdown rendering with `react-markdown` + `remark-gfm` + `rehype-sanitize`
- added deterministic source cleanup via `normalizeReadableText(raw)`
- improved long-form typography, measure, line-height, table/code/blockquote styling, and reading rhythm
- unified markdown, PDF-extracted text, and plaintext into one calmer document-reading shell

### Document Trust Layer / Grounding
- added visible grounding banner to the analysis workspace
- added evidence cards for findings with source snippet, support type, confidence summary, and evidence type
- clicking a finding or evidence card now anchors the supporting passage in the source pane
- source pane now highlights the active supporting snippet and scrolls it into view
- introduced restrained trust language for `direct`, `indirect`, `contextual`, and `general` support

### Document Q&A
- model upgraded from `gemini-2.5-flash-lite` → `gemini-2.5-flash` for better comprehension
- context window expanded from 16k → 20k chars
- prompt re-aligned to "smart honest friend" editorial voice — flowing prose, 3-5 sentences, honest about uncertainty
- sentence-level `[doc]`/`[general]` labels were tried and reverted: they felt clinical and academic for a curiosity-driven Q&A surface; the editorial voice itself is the trust mechanism here, not annotation

### Search Pipeline (new)
- multi-source retrieval: Semantic Scholar + OpenAlex + EuropePMC in parallel
- research planner: intent classification, entity extraction, query variants
- evidence bucket ranking: meta-analysis → RCT → observational → mechanistic → background
- retrieval judge + repair loop: auto-retrigger with tightened queries when quality is weak
- synthesis with hard constraints: causal language gated on evidence type, no overgeneralization, abstract-only framing, contradiction surfacing
- evidence span engine: bigram scoring, entity weighting (2×), negation detection, number matching
- support taxonomy: `strongly_supported / partially_supported / related_evidence`
- grounding safety: all snippets verbatim from source abstracts — fabrication impossible by construction
- grounding validator: causal overreach, unsupported numeric claims, model-prior leakage detection
- Unpaywall enrichment: open-access PDF links, parallel with synthesis
- coverage note: always `abstracts_only` until full-text retrieval implemented
- search sessions + paper cache DB tables (requires `npm run push` in `lib/db` before first deploy)
- eval harness with two baseline runs saved

### Search UI (new)
- evidence-first ordering: EvidenceSnapshot → Synthesis → EvidencePanel → Paper cards
- EvidencePanel: expandable claim rows with verbatim snippets and DOI links
- SynthesisAnswer: "What the evidence suggests" framing, abstract-only notice
- PaperCard, SearchInput, SearchLoadingState, FollowUpOptions, RecentSearches components

### Production / Platform
- documented live split deployment: Vercel frontend, Railway API, Railway Postgres
- documented same-origin `/api` proxy requirement for stable auth/session

## 2026-05-08

### Product
- Full landing page copy rewrite: new headline, hero body, feature cards, who-it's-for audience cards, collapsible FAQ section (5 Q&As), bottom CTA; testimonials replaced with single trust line
- Settings page: editable display name, language preference dropdown, change password form, two-step account deletion
- 404 page rewritten with on-brand copy ("This page doesn't exist. But the research does.")
- Dashboard empty state humanised: warmer headline + body + CTA
- Document-view: PDF left pane (blob URL from base64 sentinel), animated progress dots + stage steps, staggered findings reveal, trust pill with color states, question button asked-state indicator, deeperDive accordion sections

### UX Fixes
- Delete individual documents from dashboard (hover-to-reveal trash icon, confirm-before-delete)
- Chat panel close button changed from ChevronRight → X icon
- Chat auto-scrolls to newest message when questions arrive or pending indicator appears
- Panel split size persisted to localStorage (survives refresh)
- "Cancel and go back" link on analysing screen
- Progress stage resets to 0 when re-analysis is triggered
- Analysis polling capped at 60 attempts (~3 minutes) to prevent infinite polls
- Escalating error copy after two consecutive analysis failures

### Bug Fixes
- Trust pill now guards undefined confidenceLevel (no more "undefined Confidence")
- Settings language dropdown now syncs via useEffect when user data loads asynchronously
- Typewriter title fill: in-flight interval cancelled immediately when target changes; no longer overwrites manual user input
- Title field shows loading spinner while extract-title API call is in flight
- File removal clears titleLoading state
- Password minimum length aligned to 8 across register form, settings, and server-side RegisterBody schema
- `atob()` blob construction deferred to setTimeout(0) to avoid blocking the render thread
- deeperDive sections only rendered when both title and body are substantive (>8/30 chars)
- "Verified Analysis" label replaced with "Clarity Analysis" — was misleading
- Research Profile section uses BookOpen icon instead of Settings gear
- Trust narrative no longer wrapped in quotation marks (was implying false citation)
- `askedQuestions` state now derived from API questions list — survives remount

### Analysis Quality
- Pass 1 model upgraded: `google/gemma-4-26b-a4b-it` → `google/gemini-2.0-flash-001` for text documents
- Pass 1 for PDF inputs: `google/gemini-2.5-flash` (unchanged, routing via native multimodal)
- `hasMeaningfulText` sentinel check strengthened: now also rejects strings under 20 chars
- Claim type shown with plain-English explanation (e.g. "Correlational — not causation")

### Fonts
- Inter + Lora loaded via Google Fonts; CSS variables `--font-cursorgothic` / `--font-eb-garamond` now resolve correctly (previously undefined, falling back to system fonts)

## 2026-05-05

### Product

- rewrote major parts of the UI to restore premium spacing, hierarchy, and control sizing
- tightened landing-page typography and overall rhythm
- made document analysis workspace immersive and full-screen
- changed Q&A from an overlay to a persistent side pane
- improved upload UX with more human-readable context fields
- replaced confusing "jurisdiction" framing in the UI with "Where does this apply?"
- added optional review-goal selection in the upload flow

### Auth / Routing

- redirected logged-in users away from public auth routes to dashboard
- redirected logged-out users away from protected routes to login

### Analysis Quality

- strengthened prompts for plain-English, non-lawyer-first output
- added action-oriented "What To Do Next" section in the analysis UI
- added explicit incomplete-template warning behavior
- introduced reviewer / critic pass after the main analysis pass
- added heuristic detection for critical blank / template-style agreement details
- changed document Q&A to use extracted contract text plus structured analysis context instead of freeform chat-only prompting
- replaced brittle Q&A post-processing with constrained structured answers rendered into shorter, more human responses

### Documentation

- added `PRODUCT_EVAL_RUBRIC.md`
- refreshed `README.md`
- refreshed `PROJECT_LOG.md`
- added `AGENTS.md`
- refreshed `BACKLOG.md`
- added `CHANGELOG.md`
