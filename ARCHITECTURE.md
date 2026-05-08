# Clarity Paper Architecture

Clarity Paper is a trust-focused research analysis platform that transforms complex scientific papers into plain-English reviews.

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
    - **Left Panel**: The original paper text (monospaced for readability).
    - **Right Panel**: The AI-generated "Paper Insight" (narrative view) and "Research Q&A" (interactive chat).
- **State Management**: `TanStack Query` (React Query) manages API synchronization and polling.
- **Component Style**: Prioritizes high-legibility typography ("Parchment" canvas, "Inkwell" text) to reduce cognitive load.
