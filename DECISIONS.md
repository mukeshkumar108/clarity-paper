# Clarity Paper Architectural & Product Decisions

This document tracks fundamental decisions that define the product's identity and technical foundation. Future agents should not change these without explicit instruction.

## Product Decisions

1.  **Trust Over Summary**: Clarity is a *reviewer*, not a *summarizer*. The primary goal is to help users decide whether to trust a study's findings, not just tell them what the study says.
2.  **Editorial Voice**: The "smart, honest friend" persona is non-negotiable. The product must avoid sounding like an AI, a report, or a press release.
3.  **Plain Language Priority**: Academic jargon must be translated into plain English in all primary UI surfaces. High-fidelity extraction is for accuracy, but the user interface is for clarity.
4.  **No Fabrication**: The product must never invent findings. If a paper is vague or missing data, the analysis must state that clearly as a limitation.
5.  **Not a Medical Advisor**: The product provides research explanation and analysis, never medical advice.

## Search & Evidence Decisions

10. **Papers are the authority, not the AI.** Synthesis text is a navigation aid — it helps users orient themselves in the evidence. It is not a verdict. Evidence panel (claims + snippets) leads the UI; synthesis follows. The UX model is Wikipedia-style provenance, not ChatGPT-style answer.

11. **Evidence span grounding by construction, not by LLM.** Every snippet shown in the EvidencePanel is a verbatim substring of its source abstract. The matching is CPU-only (bigram + entity weighting + negation detection). No LLM is asked to validate whether a snippet supports a claim — this eliminates one class of hallucination entirely.

12. **Support taxonomy: strongly_supported / partially_supported / related_evidence.** Thresholds are 0.42 / 0.22 / below. These replaced the prior `direct / indirect / contextual` labels, which implied precision the scoring function didn't have.

13. **Causal language is gated on evidence type.** The synthesis prompt enforces this as a hard rule: "causes", "leads to", "produces", "proves" are only permitted when the evidence includes RCTs or meta-analyses. Observational-only evidence must use "associated with", "suggests", "may", "appears to". This prevents the AI from overstating mechanistic claims.

14. **Abstract-only coverage is always disclosed.** `coverageNote: "abstracts_only"` is always returned until full-text retrieval is implemented. The UI shows this explicitly. This is a honesty constraint — users must know we haven't read the full papers.

15. **Four retrieval sources in parallel.** Semantic Scholar, OpenAlex, EuropePMC, and CORE are queried for every search. Dedup by DOI, then fuzzy title match. No single source is trusted exclusively — each has different coverage strengths, and the system should degrade gracefully when one source is unavailable or rate-limited.
16. **Direct evidence lane before context lane.** For search questions that mix an intervention/exposure with a condition or outcome, the planner should produce a high-precision direct lane and a broader context lane. Retrieval must try the direct lane first and only expand into the broader lane when direct evidence is sparse. This prevents mechanism/background queries from dominating the first-pass results.
17. **English-first retrieval, user-language output.** Literature retrieval queries should be normalized into English even when the user asks in another language, because upstream academic indexes are primarily English-oriented. The user-facing synthesis and follow-up questions should still come back in the user's language.

16. **Retrieval judge before synthesis.** An LLM judges retrieval quality after every search and triggers a repair loop if the score is weak. This prevents low-quality retrievals from polluting the synthesis. The repair loop re-retrieves with tightened queries; the better result set wins.

18. **No embedding-based similarity on the hot path.** Embedding APIs add latency and cost. The evidence span engine achieves useful precision through bigrams + entity weighting + negation detection. Embeddings are not blocked for future use but must not be added to the synchronous search path without explicit latency budget approval.

19. **Cohere Rerank 4 Fast as a relevance filter, not a ranking override.** After deduplication, papers are passed through Cohere Rerank to add a semantic relevance score (0–1) per paper. This score is used as a within-bucket tie-breaker in `rankPapers` (70% evidence score, 30% relevance), and papers below a low relevance threshold (0.08) are discarded as off-topic. Papers in the low-confidence band just above that threshold also face a simple lexical overlap guard so obviously unrelated high-design papers do not survive on semantic score alone. Evidence bucket hierarchy is never overridden by relevance — a highly relevant observational paper cannot outrank a less-relevant meta-analysis. The reranker is fault-tolerant: if it fails, papers get a neutral 0.5 score and ranking proceeds unchanged. Cost: ~$0.002/search. Set `OPENROUTER_RERANK_MODEL=disabled` to bypass.

20. **Gemini Flash Lite for pure-JSON search tasks.** The research planner, query repair, and synthesis steps all output structured JSON — they don't write prose. Flash Lite (`google/gemini-2.5-flash-lite`) is fast and accurate for these tasks. Flash (`google/gemini-2.5-flash`) is reserved for Pass 1 document analysis (complex full-paper extraction) and Pass 2 editorial (user-facing prose quality). Each role has its own env var override for independent tuning.

21. **Unpaywall runs in parallel, not sequentially.** Open-access PDF enrichment has near-zero latency cost because it runs concurrently with the synthesis LLM call (which is always slower).

## Architectural Decisions

1.  **Two-Pass Analysis Pipeline**: Factual extraction (Pass 1) and narrative synthesis (Pass 2) must remain decoupled. This ensures that the narrative is grounded in extracted facts rather than hallucinations.
2.  **Structured Model Choice**: Pass 1 must use a model optimized for high-fidelity extraction and schema adherence. It is configurable via `OPENROUTER_STRUCTURED_MODEL` and currently defaults to `google/gemini-2.5-flash`. The full Flash model (not Lite) is used here because full-paper structured extraction is the most demanding JSON task in the system.
3.  **Editorial Model Choice**: Pass 2 uses `google/gemini-2.5-flash` (overridable via `OPENROUTER_EDITORIAL_MODEL`). Previously `deepseek/deepseek-v4-pro` — switched after DeepSeek's slow streaming caused systematic timeouts on the Vercel→Railway proxy path (Vercel proxy timeout ~30s; DeepSeek body streaming takes 3-5 min). Flash is the primary production default, but editorial reliability matters more than single-model purity: the pass now retries once and can fail over to `OPENROUTER_EDITORIAL_BACKUP_MODEL` (default `anthropic/claude-3.5-haiku`). If editorial still fails, the document analysis should fail rather than degrading to Pass 1-shaped prose.
4a. **PDF Routing**: PDFs are converted to markdown at upload time using `pymupdf4llm` (Python subprocess, venv at `artifacts/api-server/python-env/`). The markdown output goes through `sanitiseText()` and into Pass 1 as plain text. PDFs and pasted text follow the same downstream analysis path.
4.  **Single-Pass Structured Extraction**: The full sanitised document is sent to Pass 1 in one request. There is no chunking or chunk-merge stage in the current implementation, so model choice must account for large-context documents.
5.  **Relational Persistence**: All extraction data and narrative outputs are stored in a relational database (PostgreSQL via Drizzle) to allow for historical analysis and UI regeneration.
6.  **Dual-Pane UI**: The primary workspace must always show the original source text alongside the AI insights to maintain transparency and allow for user verification.
7.  **No Tailwind in Design Philosophy**: While Tailwind is used for implementation, the design must prioritize "Vanilla CSS" flexibility and a calm, focused aesthetic (Parchment/Inkwell theme).
8.  **Language Preference**: `preferredLanguage` is stored per-user (default: "English"). It is injected at the top of the Pass 2 system prompt only — Pass 1 always runs in English for extraction consistency. Users can change it in Settings without affecting previously analysed papers.
9.  **Font Stack**: Inter (Google Fonts) for sans-serif UI text; Lora for serif/editorial contexts (trust narrative, pull quotes). Both loaded via Google Fonts preconnect in `index.html`. CSS variables `--font-cursorgothic` and `--font-eb-garamond` are mapped to these.
10. **Visible Grounding Over Hidden Confidence**: When we have supporting source text, the UI should expose it. Trust should be inspectable via evidence cards, source anchoring, and support labels rather than hidden behind generic confidence badges alone.
11. **Deterministic Reader Cleanup**: Uploaded document text may be cleaned for readability, but only with deterministic rules (`normalizeReadableText`) — never by an LLM rewriting the source before display.
12. **Support Taxonomy in the UI**: User-facing grounding states use a restrained four-part taxonomy: `direct`, `indirect`, `contextual`, and `general`. This is a visual trust language, not a ranking system.
13. **Source-First Workspace**: The document workspace must keep the source visible beside the analysis. Grounding interactions should move the user back into the underlying text, not deeper into an abstract AI-only panel.
14. **Same-Origin Production API**: Vercel must proxy `/api/*` to Railway in production. Same-origin session behavior is required for stable auth and therefore for a credible research-reading workflow.
15. **Single-document Q&A should not use provenance tags in prose.** Users already know they are asking about one paper. Trust on this surface comes from clear voice, honest uncertainty, and optional supporting evidence cards — not `[doc]` / `[general]` sentence labels.
