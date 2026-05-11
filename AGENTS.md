# Clarity Paper — Agent Context

This file is the entry point for all coding agents and future 
maintainers. Read this first, then read the three source-of-truth 
files listed below before touching anything.

## Source of Truth Files

Read these in order before making any changes:

1. ARCHITECTURE.md — system structure, data flow, models, pipeline
2. PROMPTS.md — exact Pass 1 and Pass 2 prompts, editorial rules
3. DECISIONS.md — non-negotiable product and architectural decisions

All other docs in this repo (PRODUCT_RUBRIC.md, PROJECT_LOG.md, 
older AGENT_CONTEXT versions) are historical only and have been 
superseded. Do not use them for implementation guidance.

---

## What This Product Is

Clarity is a scientific literacy platform with two surfaces:

**Document Analysis** — upload a single paper, get a structured editorial review with trust calibration, plain-English findings, visible grounding cards, and Q&A.

**Search** — ask a research question, get multi-paper evidence synthesis with full claim provenance. Every synthesis claim can be traced to a verbatim abstract passage from a real paper.

Both surfaces share the same product promise: visible, inspectable evidence rather than floating AI explanation. It is not a summariser. It is not a medical advisor. It is a trust-focused reviewer with a human editorial voice.

**Search** — ask a research question, get multi-paper evidence synthesis with full claim provenance. Every synthesis claim can be traced to a verbatim abstract passage from a real paper.

The search surface is the newer, larger system. Read `ARCHITECTURE.md` for the full search pipeline before touching anything in `src/lib/search/`.

**Core principle: the papers are the authority, not the AI.** The AI orients the user. It does not deliver verdicts. Every claim in the synthesis has a source. Evidence leads the UI; synthesis follows.

---

## The Pipeline in One Paragraph

A user uploads a PDF or pastes text. The system sanitises the 
input (strips citations, cleans whitespace, removes references 
section). Pass 1 extracts structured scientific data as strict 
JSON — this output is internal only and never shown to the user. 
Pass 2 takes that JSON and transforms it into a human editorial 
explanation using a specific voice and structure. The frontend 
renders only Pass 2 output. Pass 1 data never reaches the user 
interface under any circumstances.

---

## The Single Most Important Rule

**Pass 1 structured data must never render to the user.**

No exceptions. No "technical details" section that shows raw 
schema fields. No fallback that exposes extraction labels. 
If Pass 2 fails or returns incomplete output, show an error 
state — do not fall back to Pass 1 content.

Everything the user sees must be Pass 2 prose, rewritten in 
human language at the appropriate depth for each section.

---

## Current Models

| Pass | Model | Purpose |
|------|-------|---------|
| Pass 1 | `OPENROUTER_STRUCTURED_MODEL` (default: `google/gemini-2.5-flash`) | Structured extraction, schema adherence |
| Pass 2 | `OPENROUTER_EDITORIAL_MODEL` (default: `google/gemini-2.5-flash`) | Editorial synthesis, human voice |

Do not swap these models without explicit instruction. Model 
selection was validated through testing multiple alternatives. 
Gemini Flash is the current production default because it avoids
the timeout issues that broke the Vercel → Railway proxy path
with slower models, while remaining acceptable for the editorial
voice.

Reliability note:
- Pass 2 retries once on the primary model
- If that still fails, it can fall back to `OPENROUTER_EDITORIAL_BACKUP_MODEL`
- If editorial still fails, the analysis should fail rather than rendering Pass 1-shaped fallback prose

---

## Output Structure

Pass 2 generates five sections. All five must be rewritten prose — 
no field labels, no schema syntax, no bullet points in the main 
narrative.

**Visible immediately (everyone):**
- Hook and one-line orientation
- What they found (3-5 narrative findings)
- How much should you trust this
- Questions worth asking

**Collapsible / on demand:**
- How the study was designed
- What this study can't tell us
- Where this fits in the bigger picture
- For the technically curious

The "For the technically curious" section is the only place where 
specific numbers, p-values, effect sizes, and methodological 
terminology are appropriate. Even there, write in clear prose — 
no bullet points, no schema labels.

---

## Editorial Voice

The persona is a smart, honest friend who understands science. 

Warm but never dumbed down. Curious but never breathless. 
Direct but never cold.

The reader should finish an explanation thinking 
"huh, I want to know more about this" — not 
"okay, I have been informed."

See PROMPTS.md for the full voice specification and the 
golden example output that defines the target quality bar.

---

## What Never Appears in User-Facing Output

- Schema field labels: "observed direction", "strengthOfSupport", 
  "claimType", "study_type", "population", "intervention"
- Inline notation: "n=19", "p<0.05" outside the technically 
  curious section
- Confidence labels as badges: "Moderate", "Strong", "Weak" 
  inline with findings
- Bullet points in the main findings section
- Boilerplate caveats: "look for larger studies", "consult a 
  professional", "this is not medical advice" as standalone lines
- Repeated limitations — each caveat appears once only
- Raw quotes from the paper surfaced as standalone items
- "Further reading" as generic placeholder text

---

## Users We Design For

**The curious layperson** — saw a health claim on social media, 
wants to know if the paper behind it actually says what they 
were told. Does not have scientific training. Needs epistemic 
confidence, not just comprehension.

**The self-optimizer** — biohacker, health-conscious person who 
found a paper themselves. Motivated and curious. Wants to know 
if the finding applies to them and what the dose/protocol 
actually was.

**The overwhelmed student or professional** — med student, 
researcher, journalist. Needs to move through papers fast. 
Wants signal extraction and trust calibration without reading 
the full methods section.

**The skeptic** — wants to evaluate a claim they've seen 
amplified online. Specifically wants to know: is this one 
outlier study or consistent with the field? Who funded it? 
How many people were tested?

---

## What Good Output Looks Like

The creatine and sleep deprivation paper is the golden example. 
If you are generating or evaluating output, compare it against 
the voice and structure of that example in PROMPTS.md.

Specific things that signal good output:
- The hook opens mid-thought, like a conversation starting
- At least one finding surprises the reader
- The null result is included and made interesting
- The trust section leads with the strongest reason to take 
  it seriously before the caveats
- The questions feel like the reader's own curiosity
- No sentence sounds like it was written by a machine

Specific things that signal bad output:
- Any finding that starts with a number or statistic
- The word "notably", "importantly", "furthermore"
- Trust framing that reads like a legal disclaimer
- Questions that are generic rather than specific to this paper
- Any schema label visible in prose

---

## Current State (as of 2026-05-11)

**Document Analysis — Working:**
- Two-pass pipeline end to end
- Gemini Flash Pass 2 producing human editorial voice
- Progressive disclosure layout in frontend
- Schema leakage eliminated from rendered output
- All five prose sections generating correctly
- PDF sanitisation before Pass 1
- Single-pass full-document structured extraction
- Deployed production stack on Vercel + Railway + Railway Postgres
- Demo papers seeded into production
- Session auth working through Vercel `/api` proxy to Railway backend
- Readable source rendering for markdown, PDF-extracted text, and plaintext (`ReadableDocumentView`)
- Deterministic text cleanup before rendering (`normalizeReadableText`)
- Visible grounding UI: evidence cards, support labels, source anchoring
- Click-claim-to-source highlighting in the document workspace
- Document Q&A: upgraded model (gemini-2.5-flash), larger context (20k), voice-aligned prompt (flowing prose, "smart honest friend" register), no `[doc]` / `[general]` labels
- Per-pass timing instrumentation on document analysis pipeline (Pass 1 LLM + parse, Pass 2 context build + attempts + parse, assembly, optional review pass, route-level DB reads/writes, total background duration)

**Search — Working:**
- Multi-source retrieval: Semantic Scholar + OpenAlex + EuropePMC + CORE in parallel
- Research planner: intent classification, entity extraction, language detection, English retrieval normalization, direct/context query lanes
- Evidence bucket ranking (meta-analysis → RCT → observational → mechanistic → background)
- Retrieval judge + repair loop (auto-retrigger when quality is weak)
- Staged retrieval: direct evidence lane first, broader context only when direct evidence is sparse
- Evidence span engine: bigrams, entity weighting, negation detection, number matching
- Support taxonomy: `strongly_supported / partially_supported / related_evidence`
- Grounding safety: all snippets are verbatim abstract substrings (no LLM fabrication possible)
- Grounding validator: causal overreach, numeric claim, model-prior leakage detection
- Synthesis constraints: causal language gating, generalization, abstraction, uncertainty
- Coverage note: `abstracts_only` always returned and shown in UI
- Unpaywall enrichment (open-access PDF links, parallel with synthesis)
- EvidencePanel UI: expandable claim rows with verbatim snippets + DOI links
- SearchResults reshaped around first read → paper pathways → follow-up questions → subordinate evidence/provenance
- Curated-transparency copy in SearchResults: positioned as a useful starting set, not an exhaustive literature review
- Paper pathways grouping in SearchResults using existing metadata only:
  `Where I'd start / Useful background / Early or adjacent / Where the story gets messy`
- Paper cards reframed as invitations into the explainer flow rather than database rows
- `/search` now acts as the entry surface for new explorations, while `/search/:sessionId` is a persistent exploration workspace
- Search sessions now persist structured sidebar messages in `search_session_messages`
- A current-focus strip summarizes the active refinement state of the canvas
- A constrained conversational refinement sidebar can now:
  - answer about the current evidence without mutating the canvas
  - narrow the current canvas by reusing existing papers when possible
  - trigger focused retrieval when a new subtopic or intervention is introduced
  - ask a useful narrowing question when the direction is too broad
  - detect exhaustive-intent requests like "find all papers" and respond with curated-scope transparency instead of pretending the current set is comprehensive
- Phase 2 validation harness covers 10 representative sidebar scenarios and currently passes the three previously failing cases:
  - personal-context refinement no longer falls through to a generic current-results answer
  - explicit narrowing requests no longer claim a canvas update unless mutation actually happens
  - exhaustive-intent requests no longer masquerade as exhaustive retrieval
- Current-results sidebar answers are now more restrained around abstract-only ambiguity such as duration, dosage, exact protocol, subgroup effects, and adverse effects

**Not yet implemented:**
- Full-text retrieval (always `abstracts_only` for now)
- Explicit contradiction surfacing in UI (P6 — handled in synthesis prompt only)
- Eval harness grounding metrics (P9)
- Streaming output for document analysis
- Mobile-responsive search results layout
- Checkpoints / branchable exploration history
- Deep-read escalation from sidebar into richer paper analysis
- More semantic, planner-aware paper regrouping beyond the current presentation-layer remap

---

## Things Agents Must Not Change Without Explicit Instruction

**Document Analysis:**
- The two-pass architecture separation
- The current Pass 2 model choice without explicit instruction
- The five-section output structure
- The rule that Pass 1 never renders to the user
- The PDF sanitisation step order (must happen before Pass 1)
- Progressive disclosure layout in the frontend
- The editorial voice specification in PROMPTS.md
- The visible-grounding principle: if we have supporting source text,
  the UI should expose a path back to it
- Deterministic source rendering: document cleanup/rendering must not
  use an LLM to rewrite uploaded text before display

**Search / Evidence:**
- The grounding safety invariant: snippets must be verbatim substrings of their source abstract
- The support taxonomy thresholds (0.42 / 0.22) — do not adjust without re-running evals
- The synthesis causal language constraints in the synthesizer prompt
- The search UX should preserve the current comprehension-first ordering:
  `First read → paper pathways → follow-up refinement → subordinate provenance`
- The sidebar must remain a refinement/orchestration layer attached to the scientific canvas — not a generic chatbot surface
- Search session context should remain structured and search-grounded. Do not refactor it into arbitrary message-history chat memory.
- The `coverageNote` field on `SearchResult` — always set it; never omit or hardcode as covered
- The retrieval judge + repair loop — do not remove even if it adds latency; quality is the tradeoff

If you are asked to make a change that conflicts with any of 
the above, flag it explicitly before proceeding. Do not 
silently refactor around these constraints.

---

## How to Make Changes Safely

1. Read ARCHITECTURE.md, PROMPTS.md, DECISIONS.md first
2. Make one change at a time
3. Do not restructure the pipeline while changing prompts
4. Do not change models while changing frontend rendering
5. Test on the creatine abstract before declaring anything done
6. If output quality degrades, check Pass 1 JSON first — 
   most prose problems trace back to extraction quality
