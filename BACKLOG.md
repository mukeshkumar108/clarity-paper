# Clarity Backlog

## Search & Evidence Grounding

### Done
- [x] Multi-source retrieval: Semantic Scholar + OpenAlex + EuropePMC in parallel
- [x] Research planner: intent classification, entity extraction, query variant generation
- [x] Deduplication: DOI + fuzzy title, guideline filtering
- [x] Evidence bucket ranking: meta-analysis → RCT → observational → mechanistic → background
- [x] Retrieval judge: LLM quality scoring, off-topic/guideline detection
- [x] Repair loop: auto-retrigger retrieval with tightened queries when judge scores weak
- [x] EuropePMC client
- [x] Unpaywall enrichment (open-access PDF links, parallel with synthesis)
- [x] Evidence span engine: bigram scoring, entity weighting, negation detection, number matching
- [x] Support taxonomy: `strongly_supported / partially_supported / related_evidence`
- [x] Grounding safety invariant: all snippets are verbatim abstract substrings
- [x] Grounding validator: causal overreach, numeric claim, model-prior leakage detection
- [x] Synthesis constraints: causal language gating, generalization, abstraction, uncertainty
- [x] Coverage note: `abstracts_only` always returned and displayed in UI
- [x] Evidence-centric UX: EvidenceSnapshot → Synthesis → EvidencePanel → Papers
- [x] EvidencePanel: expandable claim rows with verbatim snippets + DOI links
- [x] EvidenceSnapshot: bucket counts, overall confidence
- [x] Q&A voice alignment: prompt re-aligned to "smart honest friend" editorial register; model upgraded to gemini-2.5-flash; context expanded to 20k

### Next
- [ ] Full-text retrieval: fetch open-access PDFs for top papers, index full text for snippet extraction
- [ ] Contradiction surfacing: explicit UI treatment for papers with conflicting findings (P6 — currently only in synthesis prompt, not structured)
- [ ] Eval harness extensions: grounding precision, unsupported claim rate, provenance coverage metrics (P9)
- [ ] Mobile layout for search results: responsive EvidencePanel
- [ ] Session persistence: allow returning to a prior search

## Document Analysis

### Done
- [x] Source-linked findings from analysis to paper text
- [x] Readable source rendering for markdown / PDF extraction / plaintext
- [x] Visible grounding cards and source anchoring in document view
- [x] Confidence-state framework: `clear from document` / `depends on missing details` / `cannot tell from this draft`
- [x] Delete individual documents from dashboard
- [x] Settings page: language, password, profile, account deletion

### Next
- [ ] Streaming output: stream the editorial pass token-by-token so users see content appearing rather than waiting 45s
- [ ] Mobile layout: collapse dual-pane to tab switcher (Source / Analysis / Questions) on screens <768px
- [ ] Benchmarking pass: verify extraction quality on clinical trials and meta-analyses
- [x] Chat Q&A voice alignment: done — Q&A prompt now matches the "smart honest friend" editorial voice
- [ ] Native PDF highlight sync: clicking a finding should anchor the actual PDF region, not just extracted text
- [ ] Q&A structured passage support: return supporting passages from the backend instead of relying on frontend heuristics
- [ ] Search papers in dashboard (API filter already exists, just needs UI)
- [ ] Export analysis as a "Clarity Brief" PDF
- [ ] Citation export (RIS/BibTeX)
- [ ] Error boundary around document-view to catch unexpected analysis shape

## Longer-Term

- [ ] Compare studies mode (side-by-side methodology check)
- [ ] Multi-document projects / folders for literature reviews
- [ ] Collaborative annotations for research teams
- [ ] Scanned PDF support: explicit detection + OCR fallback messaging
