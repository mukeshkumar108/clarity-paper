/**
 * Clarity Voice Scorer
 *
 * Reads an eval run's results.json and scores each synthesis on 5 dimensions
 * that map directly to the "academic slop" failure modes we're trying to fix.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server voice:score                   # scores latest run
 *   pnpm --filter @workspace/api-server voice:score [run-dir-name]    # scores specific run
 *
 * Compares against a previous run if --compare <run-dir> is passed.
 *
 * Scoring dimensions (each 1–5):
 *   1. VERDICT DIRECTNESS — does the first sentence answer the question?
 *   2. VOICE WARMTH       — does it sound like a person, not a document?
 *   3. ACADEMIC REGISTER  — does it sound like a review paper? (lower = better)
 *   4. PRACTICAL VALUE    — would this help someone decide or act?
 *   5. CURIOSITY/ENERGY   — does it have a point of view? Is anything interesting?
 *
 * Also detects:
 *   - Hedging phrases (opens with "however", "it should be noted", "while X, Y")
 *   - Template structure (Known/Contested/Missing sections visible in prose)
 *   - "More research needed" ending
 *   - First sentence text
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.resolve(__dirname, "../../evals/search/runs");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SCORER_MODEL = "google/gemini-2.5-flash-lite"; // cheap + fast for scoring

const voiceScoreSchema = z.object({
  verdictDirectness: z.number().min(1).max(5),
  voiceWarmth: z.number().min(1).max(5),
  academicRegister: z.number().min(1).max(5),
  practicalValue: z.number().min(1).max(5),
  curiosityEnergy: z.number().min(1).max(5),
  firstSentence: z.string(),
  opensWith: z.enum(["verdict", "hedge", "setup", "context", "question"]),
  hedgesDetected: z.array(z.string()),
  templateStructureVisible: z.boolean(),
  endsWithMoreResearch: z.boolean(),
  shortJudgment: z.string().max(200),
});

type VoiceScore = z.infer<typeof voiceScoreSchema>;

const SCORER_SYSTEM = `You score scientific synthesis text for voice quality. You are calibrating whether a synthesis sounds like a thoughtful scientific collaborator or a review paper / academic summary.

Score each dimension 1–5:

VERDICT DIRECTNESS (1=buried in setup, 5=first sentence is the answer):
1 = never gives a clear answer
2 = answer appears after 2+ paragraphs
3 = answer in paragraph 2 with setup before
4 = answer in first paragraph
5 = first sentence IS the answer

VOICE WARMTH (1=institutional/robotic, 5=sounds like a real person):
1 = could be from a government report
2 = sounds like an abstract
3 = clear but impersonal
4 = conversational, has voice
5 = genuinely feels like talking to someone who's thought about this

ACADEMIC REGISTER (1=plain conversational, 5=review paper prose):
1 = completely natural language
2 = mostly plain with occasional formal phrasing
3 = half formal, half plain
4 = mostly review-paper style
5 = could be the discussion section of a meta-analysis

PRACTICAL VALUE (1=useless for decisions, 5=directly helps someone act or think):
1 = describes the literature without landing anywhere
2 = has a vague takeaway
3 = gives a usable conclusion with caveats
4 = clear guidance with honest uncertainty
5 = exactly what a smart friend with expertise would tell you

CURIOSITY/ENERGY (1=flat/dead, 5=alive with perspective):
1 = no point of view, no interesting observations
2 = one interesting phrase among flat prose
3 = has some energy but loses it
4 = maintains genuine curiosity throughout
5 = the reader finishes wanting to know more

Also identify:
- firstSentence: the literal first sentence of the synthesis
- opensWith: "verdict" | "hedge" | "setup" | "context" | "question"
- hedgesDetected: list of hedging phrases found (e.g. "it should be noted", "however", "while X it should be", "further research", "more evidence is needed"). Empty if none.
- templateStructureVisible: true if the answer clearly follows a Known/Contested/Missing or 3-section template
- endsWithMoreResearch: true if the final takeaway is "more research is needed" or equivalent
- shortJudgment: one sentence describing the main voice failure (or "solid" if it's good)

Return strict JSON only.`;

async function scoreOneSynthesis(query: string, synthesis: string, queryId: string): Promise<VoiceScore | null> {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");

  const userMsg = `Query ID: ${queryId}
User question: "${query}"

Synthesis to score:
---
${synthesis.slice(0, 3000)}
---

Score this synthesis on the 5 dimensions. Return strict JSON.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SCORER_MODEL,
      messages: [
        { role: "system", content: SCORER_SYSTEM },
        { role: "user", content: userMsg },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    console.error(`  Scorer API error ${response.status}: ${await response.text()}`);
    return null;
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);

    // Normalize SCREAMING_SNAKE_CASE or SCREAMING SPACE CASE → camelCase.
    // Only converts uppercase-only keys (with underscores or spaces).
    // Leaves camelCase keys untouched.
    function normKeys(obj: Record<string, unknown>): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        // Normalize if key is all uppercase (with optional underscores/spaces/slashes)
        const isScreaming = /^[A-Z][A-Z0-9 _/]*$/.test(k);
        if (isScreaming) {
          const camel = k
            .toLowerCase()
            .replace(/[_ /]+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
          result[camel] = v;
        } else {
          result[k] = v;
        }
      }
      return result;
    }

    const candidates = [
      parsed,
      parsed.scores,
      parsed.evaluation,
      parsed.result,
      parsed.voiceScore,
      parsed.score,
      parsed.assessment,
      Object.values(parsed)[0],
    ]
      .filter(v => v && typeof v === "object" && !Array.isArray(v))
      .flatMap(v => [v, normKeys(v as Record<string, unknown>)]);

    for (const candidate of candidates) {
      try {
        return voiceScoreSchema.parse(candidate);
      } catch {
        // try next candidate
      }
    }
    console.error(`  Score parse error for ${queryId}: no schema match. Raw:`, content.slice(0, 300));
    return null;
  } catch (e) {
    console.error(`  Score parse error for ${queryId}:`, (e as Error).message.slice(0, 100));
    return null;
  }
}

function compositeScore(s: VoiceScore): number {
  // Academic register and template are negative signals — invert them
  const academicPenalty = 6 - s.academicRegister; // 5→1, 1→5
  return (s.verdictDirectness + s.voiceWarmth + academicPenalty + s.practicalValue + s.curiosityEnergy) / 5;
}

function bar(score: number, max = 5): string {
  const filled = Math.round(score);
  return "█".repeat(filled) + "░".repeat(max - filled) + ` ${score.toFixed(1)}`;
}

function renderReport(results: Array<{ queryId: string; query: string; score: VoiceScore; composite: number }>, runName: string): string {
  const lines: string[] = [];
  lines.push(`# Voice Quality Report — ${runName}`);
  lines.push(``);

  const avgComposite = results.reduce((s, r) => s + r.composite, 0) / results.length;
  const avgVerdict = results.reduce((s, r) => s + r.score.verdictDirectness, 0) / results.length;
  const avgWarmth = results.reduce((s, r) => s + r.score.voiceWarmth, 0) / results.length;
  const avgAcademic = results.reduce((s, r) => s + r.score.academicRegister, 0) / results.length;
  const avgPractical = results.reduce((s, r) => s + r.score.practicalValue, 0) / results.length;
  const avgCuriosity = results.reduce((s, r) => s + r.score.curiosityEnergy, 0) / results.length;

  lines.push(`## Summary (${results.length} queries)`);
  lines.push(``);
  lines.push(`| Dimension | Avg | Bar |`);
  lines.push(`|-----------|-----|-----|`);
  lines.push(`| Composite score | ${avgComposite.toFixed(2)}/5 | ${bar(avgComposite)} |`);
  lines.push(`| Verdict directness | ${avgVerdict.toFixed(2)}/5 | ${bar(avgVerdict)} |`);
  lines.push(`| Voice warmth | ${avgWarmth.toFixed(2)}/5 | ${bar(avgWarmth)} |`);
  lines.push(`| Academic register (lower=better) | ${avgAcademic.toFixed(2)}/5 | ${bar(avgAcademic)} |`);
  lines.push(`| Practical value | ${avgPractical.toFixed(2)}/5 | ${bar(avgPractical)} |`);
  lines.push(`| Curiosity/energy | ${avgCuriosity.toFixed(2)}/5 | ${bar(avgCuriosity)} |`);
  lines.push(``);

  const hedged = results.filter(r => r.score.opensWith === "hedge" || r.score.opensWith === "setup");
  const templated = results.filter(r => r.score.templateStructureVisible);
  const moreResearch = results.filter(r => r.score.endsWithMoreResearch);

  lines.push(`**Structural failures:**`);
  lines.push(`- Answers that open with hedge/setup (not verdict): ${hedged.length}/${results.length}`);
  lines.push(`- Template structure visible: ${templated.length}/${results.length}`);
  lines.push(`- "More research needed" ending: ${moreResearch.length}/${results.length}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  for (const r of results.sort((a, b) => a.composite - b.composite)) {
    lines.push(`## ${r.queryId}: composite ${r.composite.toFixed(2)}/5`);
    lines.push(``);
    lines.push(`**Query:** "${r.query}"`);
    lines.push(``);
    lines.push(`**First sentence:** *${r.score.firstSentence}*`);
    lines.push(`**Opens with:** \`${r.score.opensWith}\``);
    lines.push(``);
    lines.push(`| | Score |`);
    lines.push(`|--|-------|`);
    lines.push(`| Verdict directness | ${bar(r.score.verdictDirectness)} |`);
    lines.push(`| Voice warmth | ${bar(r.score.voiceWarmth)} |`);
    lines.push(`| Academic register (lower=better) | ${bar(r.score.academicRegister)} |`);
    lines.push(`| Practical value | ${bar(r.score.practicalValue)} |`);
    lines.push(`| Curiosity/energy | ${bar(r.score.curiosityEnergy)} |`);
    lines.push(``);

    if (r.score.hedgesDetected.length > 0) {
      lines.push(`**Hedges detected:** ${r.score.hedgesDetected.map(h => `\`${h}\``).join(", ")}`);
    }
    if (r.score.templateStructureVisible) {
      lines.push(`⚠️ **Template structure visible in response**`);
    }
    if (r.score.endsWithMoreResearch) {
      lines.push(`⚠️ **Ends with "more research needed"**`);
    }
    lines.push(``);
    lines.push(`**Judgment:** ${r.score.shortJudgment}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  return lines.join("\n");
}

async function runVoiceScore(runDirName?: string, compareDirName?: string) {
  if (!OPENROUTER_API_KEY) {
    console.error("❌  OPENROUTER_API_KEY is not set");
    process.exit(1);
  }

  // Find run directory
  const runDirs = fs.readdirSync(RUNS_DIR).sort();
  const targetDirName = runDirName ?? runDirs[runDirs.length - 1];
  const runDir = path.join(RUNS_DIR, targetDirName!);

  if (!fs.existsSync(runDir)) {
    console.error(`❌  Run directory not found: ${runDir}`);
    console.error(`Available runs: ${runDirs.join(", ")}`);
    process.exit(1);
  }

  const resultsPath = path.join(runDir, "results.json");
  if (!fs.existsSync(resultsPath)) {
    console.error(`❌  results.json not found in ${runDir}`);
    process.exit(1);
  }

  const rawResults = JSON.parse(fs.readFileSync(resultsPath, "utf-8")) as Array<{
    query: { id: string; query: string };
    success: boolean;
    synthesis?: { synthesisText: string };
  }>;

  const toScore = rawResults.filter(r => r.success && r.synthesis?.synthesisText);
  console.log(`\n🎤 Voice Scorer — ${targetDirName}`);
  console.log(`   Scoring ${toScore.length} syntheses with ${SCORER_MODEL}…`);
  console.log(``);

  const scored: Array<{ queryId: string; query: string; score: VoiceScore; composite: number }> = [];

  for (const result of toScore) {
    process.stdout.write(`  [${result.query.id}] ${result.query.query.slice(0, 50)}…`);
    const score = await scoreOneSynthesis(result.query.query, result.synthesis!.synthesisText, result.query.id);
    if (score) {
      const composite = compositeScore(score);
      scored.push({ queryId: result.query.id, query: result.query.query, score, composite });
      process.stdout.write(` composite=${composite.toFixed(2)} (v=${score.verdictDirectness} w=${score.voiceWarmth} a=${score.academicRegister} p=${score.practicalValue} e=${score.curiosityEnergy}) [${score.opensWith}]\n`);
    } else {
      process.stdout.write(` ✗ scoring failed\n`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Save JSON scores
  const scoresPath = path.join(runDir, "voice-scores.json");
  fs.writeFileSync(scoresPath, JSON.stringify(scored, null, 2));

  // Save markdown report
  const report = renderReport(scored, targetDirName!);
  const reportPath = path.join(runDir, "voice-report.md");
  fs.writeFileSync(reportPath, report);

  const avgComposite = scored.reduce((s, r) => s + r.composite, 0) / scored.length;
  console.log(``);
  console.log(`📊 Results:`);
  console.log(`   Composite avg: ${avgComposite.toFixed(2)}/5`);
  console.log(`   Worst queries: ${scored.sort((a, b) => a.composite - b.composite).slice(0, 3).map(r => `${r.queryId}(${r.composite.toFixed(2)})`).join(", ")}`);
  console.log(`   Scores: ${scoresPath}`);
  console.log(`   Report: ${reportPath}`);

  // Compare with previous run if requested
  if (compareDirName) {
    const compareDir = path.join(RUNS_DIR, compareDirName);
    const compareScoresPath = path.join(compareDir, "voice-scores.json");
    if (fs.existsSync(compareScoresPath)) {
      const compareScored = JSON.parse(fs.readFileSync(compareScoresPath, "utf-8")) as typeof scored;
      console.log(``);
      console.log(`📈 Comparison vs ${compareDirName}:`);
      const compareAvg = compareScored.reduce((s, r) => s + r.composite, 0) / compareScored.length;
      const delta = avgComposite - compareAvg;
      console.log(`   Before: ${compareAvg.toFixed(2)}/5  →  After: ${avgComposite.toFixed(2)}/5  (${delta >= 0 ? "+" : ""}${delta.toFixed(2)})`);

      for (const r of scored) {
        const prev = compareScored.find(c => c.queryId === r.queryId);
        if (prev) {
          const d = r.composite - prev.composite;
          const sign = d >= 0 ? "+" : "";
          console.log(`   ${r.queryId}: ${prev.composite.toFixed(2)} → ${r.composite.toFixed(2)} (${sign}${d.toFixed(2)})`);
        }
      }
    } else {
      console.warn(`   ⚠ No voice-scores.json found in comparison run`);
    }
  }
}

const args = process.argv.slice(2);
const compareIdx = args.indexOf("--compare");
const compareDirName = compareIdx !== -1 ? args[compareIdx + 1] : undefined;
const runDirArg = args.find(a => !a.startsWith("--") && a !== compareDirName);

runVoiceScore(runDirArg, compareDirName)
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
  });
