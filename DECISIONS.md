# Clarity Paper Architectural & Product Decisions

This document tracks fundamental decisions that define the product's identity and technical foundation. Future agents should not change these without explicit instruction.

## Product Decisions

1.  **Trust Over Summary**: Clarity is a *reviewer*, not a *summarizer*. The primary goal is to help users decide whether to trust a study's findings, not just tell them what the study says.
2.  **Editorial Voice**: The "smart, honest friend" persona is non-negotiable. The product must avoid sounding like an AI, a report, or a press release.
3.  **Plain Language Priority**: Academic jargon must be translated into plain English in all primary UI surfaces. High-fidelity extraction is for accuracy, but the user interface is for clarity.
4.  **No Fabrication**: The product must never invent findings. If a paper is vague or missing data, the analysis must state that clearly as a limitation.
5.  **Not a Medical Advisor**: The product provides research explanation and analysis, never medical advice.

## Architectural Decisions

1.  **Two-Pass Analysis Pipeline**: Factual extraction (Pass 1) and narrative synthesis (Pass 2) must remain decoupled. This ensures that the narrative is grounded in extracted facts rather than hallucinations.
2.  **Structured Model Choice**: Pass 1 must use a model optimized for high-fidelity extraction and schema adherence. It is configurable via `OPENROUTER_STRUCTURED_MODEL` and currently defaults to `google/gemini-2.5-flash`.
3.  **Editorial Model Choice**: Pass 2 must use a model optimized for creative, human-like narrative and reasoning (currently `deepseek/deepseek-v4-pro`). Overridable via `OPENROUTER_EDITORIAL_MODEL` env var.
4a. **PDF Routing**: PDFs are converted to markdown at upload time using `pymupdf4llm` (Python subprocess, venv at `artifacts/api-server/python-env/`). The markdown output goes through `sanitiseText()` and into Pass 1 as plain text. PDFs and pasted text follow the same downstream analysis path.
4.  **Single-Pass Structured Extraction**: The full sanitised document is sent to Pass 1 in one request. There is no chunking or chunk-merge stage in the current implementation, so model choice must account for large-context documents.
5.  **Relational Persistence**: All extraction data and narrative outputs are stored in a relational database (PostgreSQL via Drizzle) to allow for historical analysis and UI regeneration.
6.  **Dual-Pane UI**: The primary workspace must always show the original source text alongside the AI insights to maintain transparency and allow for user verification.
7.  **No Tailwind in Design Philosophy**: While Tailwind is used for implementation, the design must prioritize "Vanilla CSS" flexibility and a calm, focused aesthetic (Parchment/Inkwell theme).
8.  **Language Preference**: `preferredLanguage` is stored per-user (default: "English"). It is injected at the top of the Pass 2 system prompt only — Pass 1 always runs in English for extraction consistency. Users can change it in Settings without affecting previously analysed papers.
9.  **Font Stack**: Inter (Google Fonts) for sans-serif UI text; Lora for serif/editorial contexts (trust narrative, pull quotes). Both loaded via Google Fonts preconnect in `index.html`. CSS variables `--font-cursorgothic` and `--font-eb-garamond` are mapped to these.
