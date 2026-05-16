# Changelog

All notable product and engineering changes should be tracked here.

## 2026-05-16

### Search — Conversational Architecture: Investigation State + Phase 0 Fixes

**Root cause addressed:** Every turn was treated as a fresh answer-generation event. The session stored a frozen snapshot (`synthesisText` written at turn 0); follow-ups read from it as a static anchor no matter how many turns had passed. This caused recap loops, pathway amnesia, and context starvation on longer conversations — the system had no memory of what had been established vs. what remained open.

#### Phase 0 — Quick fixes

- **`conversationDepth` wired to synthesizer** — the planner classified `orient`/`answer`/`review` but the synthesizer never received it. Now `orient` gets "one finding + open threads"; `review` gets broader coverage.
- **Message history raised** — `.slice(-4)` → `.slice(-8)`, content truncation 400 → 1200 chars per message. Previously the model reasoned from a 600-char first-turn slice + 4 × truncated messages.
- **Claim dedup fixed on turns 2+** — was silently disabled when `recentMessages` existed (always after turn 1). Now extracts claims from the most recent assistant message and uses those for dedup.

#### Phase 1 — Investigation State

**New file: `investigationState.ts`** — two Gemini Flash Lite calls:
- `buildInitialInvestigationState`: runs after initial synthesis, extracts `establishedFindings`, `openThreads`, `exploredAngles`, `contradictions`, `currentFocus`
- `updateInvestigationState`: runs after every follow-up turn, incrementally updates the state

**`InvestigationState` interface** added to `types.ts` — the living spine of a multi-turn investigation.

**DB column** `search_sessions.investigation_state jsonb` — persisted per session. Old sessions fall back to previous behavior gracefully.

**`synthesiseFollowUpAnswer`** now accepts `investigationState` and uses it as the primary context anchor instead of the frozen `previousSynthesis.slice(0, 600)`. The model receives structured context: what's established, what's open, what's already been explored, active contradictions.

**State updated after every turn** — fire-and-forget on `answer_current_results`; awaited and co-persisted on canvas updates.

## 2026-05-13

### Search — Synthesis Prompt Overhaul: Interpretation Over Summarization

**Goal:** Replace the flat, consensus-smoothed, literature-summary synthesis voice with a thoughtful, interpretive, human scientific collaborator voice.

The old prompt accidentally incentivized: over-neutrality, flattening nuance, repetitive summarization, anti-interpretation behavior, excessive caution, "meta-analysis says roughly equal" collapse, and weak practical framing.

**Root causes identified in audit:**
- `REQUIRED STRUCTURE - FOLLOW EXACTLY` was a straitjacket — three-part template forced every answer into the same shape
- The "perfect output" example became a surface template the LLM mimicked without doing the interpretive work
- 11 negative constraints (NEVER/DON'T) outweighed positive permissions — model learned compliance over thinking
- "Based on available abstracts" became a universal tic appended to every sentence
- Safety boundary read as legal disclaimer, not honest editorial framing
- No explicit permission to interpret, connect findings, or use world knowledge for framing

**Changes:**
- Replaced rigid template with principles: name the question type, tell the story, interpret the meaning, give a takeaway
- Added explicit interpretation permissions: distinguish direct evidence / strong implication / mere suggestion / wishful thinking
- Added world-knowledge framing: use biological/design knowledge to explain WHY a result matters
- Balanced constraints: "what you ARE allowed" section added before "NEVER" section
- Reframed abstraction constraint: situational ("the abstract doesn't reveal the dose") not universal
- Replaced liability safety language with evidence-education framing
- Removed perfect/bad output examples (became templates)
- Paper formatting: switched from database-dump labels to narrative-friendly descriptions
- User message: added `INTERPRETATION INSTRUCTIONS` section telling model WHEN to take positions vs be cautious
- Follow-up prompt: rewritten for deepening over restating

**Follow-up dedup bugfix:**
- Added `deduplicateFollowUpOptions()` — normalizes and removes near-duplicate follow-up questions that the LLM sometimes produces

**Sidebar orchestrator prompt:** Rewrote for intelligence; removed redundant examples that became decision templates.

### Search — Pipeline Hardening: Evidence-Fit, Comparison Awareness, Follow-Up Grounding (P0–P3)

**Goal:** Close the quality gap between initial search and follow-up answers, make the pipeline aware of whether papers actually answer the question, and wire up planner intelligence that was previously produced but never consumed.

This is an orchestration-only change. No new LLM calls. No UI changes. All changes are in the backend pipeline and synthesis contracts.

#### P0 — Follow-Up Grounding (Critical Bug Fix)

Follow-up answers previously bypassed all quality gates. Now:
- `validateGrounding` runs on EVERY follow-up synthesis (both `answer_current_results` and `canvas_update` branches)
- `buildEvidenceSpans` extracts claim-to-snippet provenance for EVERY follow-up
- Violations (unsupported numeric claims, causal overreach, model-prior leakage) are logged with warnings

**Files:** `routes/search.ts:233-240` (answer branch), `routes/search.ts:293-300` (canvas_update branch)

#### P1 — Evidence-Fit Evaluation (New Core Stage)

New deterministic module `evidenceFit.ts` evaluates whether each retrieved paper actually answers the user's question — separate from paper quality or topical relevance.

**Per-paper dimensions:**
- Intervention match (exact / close / broader_class / different)
- Outcome match (exact / related / different) — uses planner's `hiddenGoals`
- Population match (exact / overlapping / different) — uses planner's `inclusionCriteria` + disease bleed
- Finding direction (supports_claim / mixed / null / contradicts / unrelated)
- Head-to-head detection for comparison queries

**Labels:** `direct` | `adjacent` | `weak` | `mismatch`

**Downstream effects:**
- `rankPapers` sorts fit-first (direct before adjacent before weak before mismatch), then bucket, then score
- Synthesizer receives fit labels per paper in paper formatting: "DIRECTLY on the question" vs "ADJACENT — related but not a direct answer"
- Retrieval judge quality score includes `evidenceFitBonus` component (10% weight)

**Files:** `evidenceFit.ts` (new), `ranking.ts:159-216`, `synthesizer.ts:108-132`, `retrievalJudge.ts:237-270`

#### P2 — Wire Dead Planner Fields

Three planner fields that were produced by the LLM but never consumed are now wired:

- **`isComparison` / `comparisonTarget`**: Planner detects comparison intent ("is X better than Y?"). Synthesis prompt receives explicit comparison instructions: distinguish head-to-head evidence from indirect, flag missing comparison evidence, separate mechanism from direct evidence.
- **`desiredEvidenceTypes`**: Applies 0.85× penalty to evidence score for papers not matching the user's preferred evidence levels (e.g. user wants RCTs but gets cohort studies).
- **`hiddenGoals`**: Rephrased in synthesis prompt as "the angles the user most cares about — frame the answer toward these when evidence supports it."

**Files:** `researchPlanner.ts:37-58` (schema + prompt), `synthesizer.ts:163-175` (user message), `ranking.ts:51-95` (penalty)

#### P3 — Follow-Up Deepening

- **Claim deduplication**: Extracts claims from previous synthesis via `evidenceSpans.extractClaims`, passes them as "DO NOT REPEAT" constraints to follow-up synthesis
- **`whatChanged` enforcement**: When new papers are retrieved, `whatChanged` field is required. If missing, weak (<40 chars), or contains evasion language ("no new", "same as", "unchanged"), a retry is triggered with a stronger prompt
- **Fit labels in follow-up formatting**: Both existing and new paper blocks include fit labels, enabling the LLM to prioritize direct-fit papers

**Files:** `synthesizer.ts:339-410`

#### Type Changes

- `ResearchPlan` now includes `isComparison`, `comparisonTarget`
- `RankedPaper` now includes `evidenceFit?: EvidenceFit`
- `RetrievalQualityScoreComponents` now includes `evidenceFitBonus`
- Frontend types mirrored (`search-types.ts`)

#### Caller Updates

All callers of `rankPapers` updated from `rankPapers(papers, plan.entities)` to `rankPapers(papers, plan)`:
- `index.ts:495`
- `queryRepair.ts:169`
- `verify-user-journeys.ts:69`
- `run-search-evals.ts:82`

#### Docs Updated

- `ARCHITECTURE.md`: Pipeline diagram updated, evidence-fit section added, comparison awareness and follow-up grounding documented
- `AGENTS.md`: Current State updated with P0-P3 entries, invariants section notes evidence-fit and follow-up grounding as non-negotiable
- `IMPLEMENTATION_PLAN.md`: Full architecture package created (Parts 1-7)

## 2026-05-12

### Search — UX Restructure: Conversational Research Flow

**Goal:** Move from "evidence canvas + persistent sidebar" toward "conversational research flow grounded in structured evidence artifacts."

This is not a generic chat thread. This is a trust-first exploration surface where evidence is the anchor, not a footnote.

#### New Component Hierarchy

**Two-column layout:**
- **Left column (~60%)**: Conversational flow
  1. First Read / current understanding
  2. **Evidence behind this read** (NEW — trust anchor)
  3. Follow-up question chips
  4. Main ask/refine input (NEW — in-flow, not sidebar)
  5. Exploration trail / history (NEW)
- **Right column (~40%)**: Paper pathways sidebar (2-3 initially, progressively disclosed)

**Page structure:**
1. Query/session heading (full width)
2. Compact current focus strip (full width)
3. Two-column grid: conversational flow | papers sidebar
4. Exploration sidebar as drawer (toggle from header)

#### New Components Created

- **`EvidenceBehindRead.tsx`** — Groups `EvidenceSnapshot` and `EvidencePanel` into a cohesive trust section. Shows paper counts, evidence shape (meta-analyses, RCTs, etc.), curated-set transparency, and expandable claim-level provenance.
- **`MainRefineInput.tsx`** — Primary refinement input positioned in the main flow, after follow-up chips. Submits to existing sidebar orchestration endpoint.
- **`ResearchTrail.tsx`** — Collapsed timeline showing exploration history: started with query, refined to X, asked Y, focused retrieval, etc. Display-only (no branching/restore).
- **`PaperPathways.tsx`** — Sidebar component displaying papers grouped by usefulness (Where I'd start, Useful background, etc.). Shows 2-3 papers initially with "Show more" control. Extracted from `SearchResults` for two-column layout.

#### Modified Components

- **`SearchResults.tsx`** — Complete restructure. Now contains only conversational flow: Synthesis → EvidenceBehindRead → FollowUpOptions → MainRefineInput → ResearchTrail. Papers moved to separate `PaperPathways` component for sidebar layout.
- **`ExplorationSidebar.tsx`** — Converted to **drawer pattern**. Now accepts `isOpen`/`onClose` props. Renders as overlay drawer when toggled, not persistent rail. Backdrop click closes. Toggle button appears in header when messages exist.
- **`search-session.tsx`** — Layout changed to **two-column grid**: Left column (conversational flow) + Right column (papers sidebar). Uses `grid-cols-[1fr_400px]` on xl screens, stacks vertically on smaller screens. Papers sidebar uses sticky positioning to stay visible while scrolling.

#### Key UX Changes

**Evidence positioning:**
- Evidence section now appears **immediately after First Read**, not at the bottom
- Evidence is the trust anchor, not a footnote
- Softer copy: "We checked this first read against X papers. This is a curated starting set, not a full literature sweep."
- Claim-level provenance collapsed by default under "Inspect the claims" toggle

**Paper display:**
- Papers moved to **right sidebar column** (not at bottom of flow)
- Only **2-3 papers shown initially** (from "Where I'd start" group)
- "Show more papers" button reveals remaining papers + all groups
- Paper cards remain first-class objects (not citations)
- Sidebar uses **sticky positioning** — stays visible while scrolling through conversation
- Two-column layout: conversational flow (left) | papers (right)

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
- `artifacts/clarity/src/components/search/PaperPathways.tsx`

**Modified files:**
- `artifacts/clarity/src/components/search/SearchResults.tsx`
- `artifacts/clarity/src/components/search/ExplorationSidebar.tsx`
- `artifacts/clarity/src/pages/search-session.tsx`

**Documentation updated:**
- `AGENTS.md` — updated Current State section
- `ARCHITECTURE.md` — updated Frontend Components and Search Session Workspace sections
- `CHANGELOG.md` — this entry

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
