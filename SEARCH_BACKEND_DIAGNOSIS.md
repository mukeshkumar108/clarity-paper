# Diagnosis: Follow-Up Answer Engine Failure

## The Core Problem

The follow-up flow is **not synthesizing evidence**. It generates a reply from the orchestrator BEFORE any retrieval happens, then uses that pre-generated reply even after new retrieval completes.

## Root Cause Analysis

### 1. Two Divergent Code Paths

**Initial Search Flow (CORRECT):**
```
runSearch() 
  → retrieve papers from Semantic Scholar/OpenAlex
  → synthesisePapers(plan, papers, snapshot)
  → returns evidence-grounded synthesis
```

**Follow-Up Flow (BROKEN):**
```
orchestrateSidebarInput(session, userInput)
  → LLM decides action + generates assistantReply (NO EVIDENCE SYNTHESIS)
  → IF retrieval needed: rerunSearchIntoExistingSession() 
     → BUT assistantReply is ALREADY GENERATED
  → saves pre-generated reply (ignores new evidence)
```

### 2. The Critical Bug

In `search.ts` lines 178-267:

```typescript
// 1. Orchestrator generates reply from CURRENT state only
const action = await orchestrateSidebarInput(session, trimmed);

// 2. MAYBE run retrieval AFTER
if (action.actionType === "refine_current_canvas") {
  if (action.reuseCurrentPapers) {
    // filter existing papers
  } else {
    await rerunSearchIntoExistingSession(userId, id, effectiveQuery);
    // ↑ NEW PAPERS RETRIEVED HERE
  }
}

// 3. Saves the PRE-GENERATED reply (line 226-241)
const [assistantMessage] = await db.insert(searchSessionMessagesTable)
  .values({
    content: action.assistantReply,  // ← FROM BEFORE RETRIEVAL!
    // ...
  });
```

**The assistant reply is generated at line 178 BEFORE retrieval happens at lines 206-222.**

### 3. Why the Intermittent Fasting Follow-Up Failed

**User's real question:**
"Is IF uniquely better than normal calorie restriction for insulin/metabolic health, or is the podcast claim overhyped?"

**What happened:**
1. First search retrieved general IF papers
2. Synthesis was acceptable but shallow (didn't deeply compare IF vs CCR)
3. Follow-up asked for specific comparison
4. Orchestrator decided "refine_current_canvas" 
5. Generated generic reply: "I narrowed the canvas..."
6. MAYBE ran new retrieval for "intermittent fasting vs calorie restriction insulin"
7. Saved the generic reply anyway
8. **Never synthesized the new evidence to answer the comparison question**

### 4. Missing Capabilities

The current system cannot:
- Synthesize AFTER new retrieval in follow-ups
- Explain what changed between turns (delta)
- Answer user's actual question with evidence
- Distinguish "answer from current" vs "retrieve then answer"

## Evidence from Code

**sidebarOrchestrator.ts lines 381-408:**
```typescript
export async function orchestrateSidebarInput(
  session: SearchSessionDetail,  // ← ONLY current state
  userInput: string,
): Promise<SidebarAction> {
  const userMessage = [
    `SIDEBAR INPUT: ${userInput}`,
    `CURRENT QUERY: ${session.query}`,
    `CURRENT FIRST READ: ${session.synthesisText}`,
    `CURRENT PAPERS:`,
    summarizePapers(session.papers),  // ← ONLY existing papers
  ].join("\n\n");

  const raw = await callLLM(
    SIDEBAR_SYSTEM_PROMPT,
    userMessage,
    sidebarActionSchema,  // ← Generates assistantReply here
    // ...
  );
}
```

The orchestrator ONLY sees `session.papers` (existing evidence). It never sees new evidence because retrieval happens AFTER this function returns.

## Files Responsible

1. **`artifacts/api-server/src/routes/search.ts`**
   - Lines 178-267: Wrong order (orchestrate → retrieve → save old reply)
   
2. **`artifacts/api-server/src/lib/search/sidebarOrchestrator.ts`**
   - Lines 381-408: Generates reply without seeing new evidence
   - Prompt doesn't instruct model to wait for synthesis
   
3. **`artifacts/api-server/src/lib/search/synthesizer.ts`**
   - Not called at all during follow-ups!
   - Only used for initial search, not follow-up answers

## What Needs to Change

### Option A: Minimal Fix (Recommended)

Change the flow in `search.ts`:

```typescript
// CURRENT (BROKEN):
const action = await orchestrateSidebarInput(session, userInput);
// ... retrieval happens ...
save(action.assistantReply);  // ← old reply

// FIXED:
const action = await orchestrateSidebarInput(session, userInput);

if (action.needsNewRetrieval) {
  // 1. Run retrieval FIRST
  const newSession = await rerunSearchIntoExistingSession(userId, id, query);
  
  // 2. THEN synthesize with delta context
  const synthesis = await synthesiseFollowUpAnswer({
    originalQuery: session.query,
    originalPapers: session.papers,
    followUpQuestion: userInput,
    newPapers: newSession.papers,
    previousSynthesis: session.synthesisText,
  });
  
  // 3. Save the NEW synthesis
  save(synthesis.synthesisText);
} else {
  // Answer from current evidence
  const synthesis = await synthesiseFromCurrentEvidence(session, userInput);
  save(synthesis.synthesisText);
}
```

### Option B: New Follow-Up Synthesizer

Create `synthesiseFollowUpAnswer()` that receives:
- Previous query + synthesis
- Follow-up question  
- Existing papers
- New papers (if retrieved)
- User intent classification

And outputs:
- Direct answer to follow-up question
- What changed from previous synthesis
- Grounding in (existing + new) evidence
- Better follow-up paths

## Schema Changes Needed

Add to `SearchSessionMessage` metadata:
```typescript
metadata: {
  // ... existing ...
  retrievalDelta?: {
    papersBefore: number;
    papersAfter: number;
    newPaperIds: string[];
  };
  answerVerdict?: {
    directAnswer: string;  // The "short answer"
    confidence: string;
    keyEvidence: string[];
  };
}
```

## Test Case: Intermittent Fasting

**Current broken output:**
"I narrowed this to focus on insulin sensitivity and refreshed the canvas accordingly."

**Required good output:**
"Short answer: The evidence is genuinely mixed on whether intermittent fasting is better than continuous calorie restriction for insulin sensitivity.

What we found: I retrieved 3 new studies specifically comparing IF vs CCR head-to-head. Two RCTs found no significant difference in fasting insulin or HOMA-IR between the two approaches. One smaller study favored IF, but had only 28 participants.

What changed: The initial synthesis suggested IF "may improve insulin sensitivity" based on studies without comparison groups. These new comparison studies suggest the benefit comes from weight loss itself, not the fasting timing.

So practically: For insulin health, IF works—but mainly because it helps you eat less. The "metabolic magic" podcast claims are overhyped based on current evidence.

Want me to dig into the weight-loss-adherence comparison, or look at whether timing of the eating window matters?"

## Summary

The system is a **paper-summary bot** because:
1. Follow-ups generate replies BEFORE seeing evidence
2. New retrieval happens but is never synthesized
3. No delta explanation between turns
4. No direct verdict on user's actual question

Fix: Reorder the flow so synthesis happens AFTER retrieval, with explicit delta context.
