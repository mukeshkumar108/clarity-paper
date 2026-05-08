# Clarity Paper Project Log

## Current Product Direction

Clarity Paper is being shaped as a practical research-review product for researchers, students, and health optimizers, not a generic legal-summary wrapper.

Core users:
- Biohackers reviewing clinical trials for personal optimization
- Students breaking down complex academic papers for study
- Researchers performing quick first-pass evaluations of new literature
- General public wanting to understand the evidence behind headlines

## Strategic Principles

- **Clarity over completeness**: Leave out administrative fluff. Focus on the core finding and methodology reliability.
- **Evidence-first**: Every major finding must be source-linked to a direct quote from the paper.
- **Honest caveats**: Be explicit about small sample sizes, funding bias, and p-hacking signs.
- **Actionable takeaways**: Explain what the science actually means for a regular person.

## Completed Milestones

### 2026-05-05 (Pivot to Scientific Review)
- Renamed project and aligned all UI terminology to research focus.
- Synchronized API schemas and database to support scientific fields (methodology, limitations, conflicting interests, etc.).
- Implemented **Source-linked findings**: findings now include direct quotes from the source text.
- Implemented **Confidence-state framework**: analysis now categorizes study clarity (High/Medium/Low) based on available methodology details.
- Updated multi-pass AI pipeline to focus on scientific integrity and evidence extraction.

### Previous (Legal Focus)
- Added red flags, negotiation points, missing info, obligations, deadlines, and questions to ask.
- Implemented multi-pass review system to tighten summaries and remove lawyerly jargon.
- Added visible UI warning when critical agreement details appear missing.
- Extraction-first pipeline for key fields.
