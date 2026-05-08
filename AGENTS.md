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

Clarity Paper is a scientific literacy tool. It helps people 
understand and evaluate research papers — not just what a study 
says, but whether they should trust it and why.

It is not a summariser. It is not a medical advisor. It is a 
trust-focused reviewer with a human editorial voice.

The difference matters. A summariser tells you what a paper says. 
Clarity tells you what the evidence means, how strong it is, and 
what questions it leaves unanswered.

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
| Pass 2 | deepseek/deepseek-v4-pro | Editorial synthesis, human voice |

Do not swap these models without explicit instruction. Model 
selection was validated through testing multiple alternatives. 
DeepSeek for Pass 2 was specifically chosen because it produces 
warm, curious, editorially coherent prose rather than structured 
analysis language.

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

## Current State (as of 2026-05-07)

**Working:**
- Two-pass pipeline end to end
- DeepSeek Pass 2 producing human editorial voice
- Progressive disclosure layout in frontend
- Schema leakage eliminated from rendered output
- All five prose sections generating correctly
- PDF sanitisation before Pass 1
- Single-pass full-document structured extraction

**Next priorities:**
- Usage limits removed for v1 testing
- Semantic Scholar integration for related papers
- Search entry point (query first, no paper required)

**Not started yet:**
- Claim verification across multiple papers
- Confidence landscape across the literature
- User accounts and saved papers
- Social sharing

---

## Things Agents Must Not Change Without Explicit Instruction

- The two-pass architecture separation
- DeepSeek as the Pass 2 model
- The five-section output structure
- The rule that Pass 1 never renders to the user
- The PDF sanitisation step order (must happen before Pass 1)
- Progressive disclosure layout in the frontend
- The editorial voice specification in PROMPTS.md

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
