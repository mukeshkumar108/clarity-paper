# Clarity Paper Architecture

Clarity Paper is a trust-focused research analysis platform that transforms complex scientific papers into plain-English reviews.

## Product Surfaces

Clarity now has two top-level surfaces:

1. **Search-first exploration** for query-led evidence discovery
2. **Document-first review** for uploaded or pasted papers

This document focuses on the shared architectural principles plus the shipped document-analysis workspace.

## Analysis Pipeline (The Two-Pass System)

The core logic resides in a multi-stage LLM pipeline designed to separate factual extraction from narrative synthesis.

1.  **Ingestion & Extraction**: Uploaded PDFs or pasted text are processed. PDFs are converted to markdown with `pymupdf4llm`, then sanitised so citations, references, figure captions, and whitespace noise are removed before analysis.
2.  **Pass 1: Structured Extraction (Internal)**:
    - **Goal**: Extract raw scientific data (methodology, findings, caveats, evidence signals).
    - **Model**: `OPENROUTER_STRUCTURED_MODEL` env var, defaulting to `google/gemini-2.5-flash`.
    - **Output**: Strict JSON matching the `structuredAnalysisSchema`.
    - **Execution**: The full sanitised document is sent in a single Pass 1 request. There is no chunk merge step in the current pipeline.
3.  **Pass 2: Editorial Synthesis (User-Facing)**:
    - **Goal**: Transform the structured JSON into a compelling, human-readable narrative.
    - **Model**: `deepseek/deepseek-v4-pro` (optimized for voice and nuance).
    - **Output**: Narrative JSON containing hooks, findings, and trust-calibration sections.
4.  **Pass 3: Editorial Review (Optional)**:
    - **Goal**: Refine prose, ensure coherence, and remove "LLM-isms" or schema leakage.
    - **Model**: `deepseek/deepseek-v4-pro`.

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
