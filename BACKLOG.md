# Clarity Backlog

## Highest Priority

- [x] Source-linked findings from analysis to paper text
- [x] Confidence-state framework: `clear from document` / `depends on missing details` / `cannot tell from this draft`
- [x] Delete individual documents from dashboard
- [x] Settings page: language, password, profile, account deletion
- [ ] Streaming output: stream the editorial pass token-by-token so users see content appearing rather than waiting 45s for the full result
- [ ] Mobile layout: collapse dual-pane to tab switcher (Source / Analysis / Questions) on screens <768px
- [ ] Benchmarking pass: verify extraction quality on clinical trials and meta-analyses

## Refinement

- [ ] Chat Q&A voice alignment: ensure Q&A system prompt mirrors the "smart honest friend" editorial voice from Pass 2
- [ ] PDF highlight sync: clicking a finding scrolls the source PDF to the relevant section
- [ ] Search papers in dashboard (API filter already exists, just needs UI)
- [ ] Export analysis as a "Clarity Brief" PDF
- [ ] Citation export (RIS/BibTeX)
- [ ] Highlight specific "red flag" phrases in the source text
- [ ] Multi-pass synthesis for extremely long papers (50+ pages)
- [ ] Error boundary around document-view to catch unexpected analysis shape

## Longer-Term

- [ ] Compare studies mode (side-by-side methodology check)
- [ ] Multi-document projects / folders for literature reviews
- [ ] Collaborative annotations for research teams
- [ ] Confidence-calibrated multi-model escalation path
- [ ] Scanned PDF support: explicit detection + OCR fallback messaging
