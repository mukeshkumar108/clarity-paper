# Changelog

All notable product and engineering changes should be tracked here.

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
