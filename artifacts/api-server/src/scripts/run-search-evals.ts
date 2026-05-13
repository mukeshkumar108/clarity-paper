/**
 * Clarity Search — Eval Harness
 *
 * Runs a fixed set of seed queries through the real search pipeline,
 * saves raw outputs as timestamped JSON, and generates a human-reviewable
 * markdown report.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server eval:search
 *
 * Output: artifacts/api-server/evals/search/runs/<timestamp>/
 *   ├── results.json   (full raw output for every query)
 *   └── report.md      (human-reviewable with manual scoring template)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planResearch } from "../lib/search/researchPlanner";
import { retrievePlannedPapers } from "../lib/search/retrieval";
import { deduplicatePapers, filterGuidelineDocuments } from "../lib/search/dedupe";
import { rankPapers, buildEvidenceSnapshot } from "../lib/search/ranking";
import { synthesisePapers } from "../lib/search/synthesizer";
import { judgeRetrievalQuality } from "../lib/search/retrievalJudge";
import { repairRetrieval } from "../lib/search/queryRepair";
import { validateGrounding } from "../lib/search/groundingValidator";
import { rerankByRelevance } from "../lib/search/reranker";
import { applyTopicalVeto } from "../lib/search/topicalVeto";
import { pool } from "@workspace/db";
import { EVAL_QUERIES, type EvalQuery } from "./eval-queries";
import type { ResearchPlan, RankedPaper, EvidenceSnapshot, RetrievalJudgment, GroundingResult } from "../lib/search/types";
import type { SynthesisOutput } from "../lib/search/synthesizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.resolve(__dirname, "../../evals/search/runs");

interface EvalResult {
  query: EvalQuery;
  success: boolean;
  error?: string;
  latencyMs: number;
  plan?: ResearchPlan;
  rawRetrievedCount?: number;
  deduplicatedCount?: number;
  afterGuidelineFilterCount?: number;
  rankedCount?: number;
  initialJudgment?: RetrievalJudgment;
  finalJudgment?: RetrievalJudgment;
  repairTriggered?: boolean;
  repairStrategy?: string | null;
  repairQueriesUsed?: string[];
  originalQualityScore?: number | null;
  repairedQualityScore?: number | null;
  keepRepairedReason?: string | null;
  paperCountBeforeRepair?: number | null;
  paperCountAfterRepair?: number | null;
  snapshot?: EvidenceSnapshot;
  synthesis?: SynthesisOutput;
  grounding?: GroundingResult;
  topPapers?: RankedPaper[];
  sourceBreakdown?: Record<string, number>;
  bucketBreakdown?: Record<string, number>;
}

async function runSingleEval(query: EvalQuery): Promise<EvalResult> {
  const start = Date.now();
  process.stdout.write(`  [${query.id}] ${query.query.slice(0, 60)}…`);

  try {
    // 1. Plan
    const plan = await planResearch(query.query);

    // 2. Retrieve
    const rawPapers = await retrievePlannedPapers(plan);

    // 3. Deduplicate + guideline filter
    const deduplicatedRaw = deduplicatePapers(rawPapers);
    const deduplicated = filterGuidelineDocuments(deduplicatedRaw);

    // 4. Rerank + topical veto + rank
    const reranked = await rerankByRelevance(plan.normalizedEnglishQuestion, deduplicated);
    const vetoed = await applyTopicalVeto(plan, rankPapers(reranked, plan));
    const ranked = vetoed;

    // 5. Initial quality judgment
    const initialJudgment = judgeRetrievalQuality(ranked, plan);

    // 6. Conditional repair (max 1 iteration)
    let finalPapers = ranked;
    let repairTriggered = false;
    let repairStrategy: string | null = null;
    let repairQueriesUsed: string[] = [];
    let originalQualityScore: number | null = null;
    let repairedQualityScore: number | null = null;
    let keepRepairedReason: string | null = null;
    let paperCountBeforeRepair: number | null = null;
    let paperCountAfterRepair: number | null = null;

    if (initialJudgment.shouldTriggerRepair) {
      paperCountBeforeRepair = ranked.length;
      const repairResult = await repairRetrieval(ranked, plan, initialJudgment);
      finalPapers = repairResult.papers;
      repairQueriesUsed = repairResult.queriesUsed;
      repairTriggered = true;
      repairStrategy = repairResult.strategy;
      originalQualityScore = repairResult.originalScore;
      repairedQualityScore = repairResult.repairedScore;
      keepRepairedReason = repairResult.keepRepairedReason;
      paperCountAfterRepair = finalPapers.length;
    }

    // 7. Final judgment (re-judge after repair for comparison)
    const finalJudgment = repairTriggered
      ? judgeRetrievalQuality(finalPapers, plan)
      : initialJudgment;

    // 8. Snapshot + synthesis
    const snapshot = buildEvidenceSnapshot(finalPapers);
    const synthesis = await synthesisePapers(plan, finalPapers, snapshot);

    // 9. Grounding validation
    const grounding = validateGrounding(synthesis.synthesisText, finalPapers, snapshot);

    const latencyMs = Date.now() - start;

    const sourceBreakdown: Record<string, number> = {};
    for (const p of rawPapers) {
      sourceBreakdown[p.source] = (sourceBreakdown[p.source] ?? 0) + 1;
    }

    const bucketBreakdown: Record<string, number> = {};
    for (const p of finalPapers) {
      bucketBreakdown[p.evidenceBucket] = (bucketBreakdown[p.evidenceBucket] ?? 0) + 1;
    }

    const scoreStr = initialJudgment.qualityScore.total.toFixed(3);
    const repairNote = repairTriggered
      ? ` [REPAIR:${repairStrategy} orig=${originalQualityScore?.toFixed(3)} new=${repairedQualityScore?.toFixed(3)}]`
      : "";
    process.stdout.write(` ✓ ${(latencyMs / 1000).toFixed(1)}s, ${finalPapers.length} papers, ${synthesis.confidence}, score=${scoreStr}${repairNote}\n`);

    return {
      query,
      success: true,
      latencyMs,
      plan,
      rawRetrievedCount: rawPapers.length,
      deduplicatedCount: deduplicatedRaw.length,
      afterGuidelineFilterCount: deduplicated.length,
      rankedCount: finalPapers.length,
      initialJudgment,
      finalJudgment,
      repairTriggered,
      repairStrategy,
      repairQueriesUsed,
      originalQualityScore,
      repairedQualityScore,
      keepRepairedReason,
      paperCountBeforeRepair,
      paperCountAfterRepair,
      snapshot,
      synthesis,
      grounding,
      topPapers: finalPapers.slice(0, 5),
      sourceBreakdown,
      bucketBreakdown,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    process.stdout.write(` ✗ ${error.slice(0, 60)}\n`);
    return { query, success: false, error, latencyMs };
  }
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function escMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function qualityEmoji(q: string): string {
  if (q === "strong") return "✅ strong";
  if (q === "acceptable") return "⚠️ acceptable";
  if (q === "weak") return "🔴 weak";
  return "❌ failed";
}

function groundingSummary(g: GroundingResult | undefined): string {
  if (!g) return "—";
  const parts: string[] = [];
  if (g.unsupportedNumericClaims > 0) parts.push(`${g.unsupportedNumericClaims} unsupported numeric`);
  if (g.causalOverreach) parts.push("causal overreach");
  if (g.studiesShowViolations > 0) parts.push(`${g.studiesShowViolations} ungrounded "studies show"`);
  if (g.modelPriorLeakage > 0) parts.push(`${g.modelPriorLeakage} model-prior phrase(s)`);
  if (parts.length === 0) return "✅ clean";
  return `⚠️ ${parts.join(", ")}`;
}

function generateMarkdownReport(results: EvalResult[], runTimestamp: string): string {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0);
  const avgLatencyMs = results.length > 0 ? totalLatencyMs / results.length : 0;
  const sortedLatencies = [...results].map((r) => r.latencyMs).sort((a, b) => a - b);
  const medianLatencyMs = sortedLatencies[Math.floor(sortedLatencies.length / 2)] ?? 0;
  const totalPapers = successful.reduce((s, r) => s + (r.rankedCount ?? 0), 0);
  const avgPapers = successful.length > 0 ? totalPapers / successful.length : 0;
  const repairCount = results.filter((r) => r.repairTriggered).length;
  const groundingIssues = results.filter(
    (r) => r.grounding && (r.grounding.unsupportedNumericClaims > 0 || r.grounding.causalOverreach),
  ).length;

  const confidenceDist: Record<string, number> = {};
  for (const r of successful) {
    const c = r.synthesis?.confidence ?? "unknown";
    confidenceDist[c] = (confidenceDist[c] ?? 0) + 1;
  }

  const qualityDist: Record<string, number> = {};
  for (const r of successful) {
    const q = r.initialJudgment?.quality ?? "unknown";
    qualityDist[q] = (qualityDist[q] ?? 0) + 1;
  }

  const lines: string[] = [];

  // Header
  lines.push(`# Clarity Search — Eval Report`);
  lines.push(``);
  lines.push(`**Run:** ${runTimestamp}`);
  lines.push(`**Queries evaluated:** ${results.length} (${successful.length} succeeded, ${failed.length} failed)`);
  lines.push(`**Total latency:** ${fmtMs(totalLatencyMs)}`);
  lines.push(`**Average latency per query:** ${fmtMs(Math.round(avgLatencyMs))}`);
  lines.push(`**Median latency per query:** ${fmtMs(medianLatencyMs)}`);
  lines.push(`**Average papers per result:** ${avgPapers.toFixed(1)}`);
  lines.push(`**Repair loop triggered:** ${repairCount}/${results.length} queries`);
  lines.push(`**Grounding issues detected:** ${groundingIssues}/${results.length} queries`);
  lines.push(``);
  lines.push(`**Confidence distribution:**`);
  for (const [c, n] of Object.entries(confidenceDist)) {
    lines.push(`- ${c}: ${n}`);
  }
  lines.push(``);
  lines.push(`**Initial retrieval quality distribution:**`);
  for (const [q, n] of Object.entries(qualityDist)) {
    lines.push(`- ${q}: ${n}`);
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  if (failed.length > 0) {
    lines.push(`## Failed Queries`);
    lines.push(``);
    for (const r of failed) {
      lines.push(`- **${r.query.id}** \`${r.query.query}\` — ${r.error}`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // Per-query sections
  for (const result of results) {
    const q = result.query;
    lines.push(`## ${q.id}: ${q.category}`);
    lines.push(``);
    lines.push(`**Query:** ${q.query}`);
    if (q.notes) lines.push(`**Context:** ${q.notes}`);
    lines.push(``);

    if (!result.success) {
      lines.push(`> ⚠️ **Failed:** ${result.error}`);
      lines.push(`> Latency: ${fmtMs(result.latencyMs)}`);
      lines.push(``);
      lines.push(scoringTemplate());
      lines.push(`---`);
      lines.push(``);
      continue;
    }

    const { plan, snapshot, synthesis, topPapers, sourceBreakdown, initialJudgment, finalJudgment, grounding } = result;

    // Plan summary
    if (plan) {
      lines.push(`### Planner output`);
      lines.push(``);
      lines.push(`**Intent:** \`${plan.intentType}\``);
      lines.push(`**Entities:** ${plan.entities.join(", ") || "—"}`);
      lines.push(`**Hidden goals:** ${plan.hiddenGoals.join(", ") || "—"}`);
      lines.push(``);
      lines.push(`**Query variants (${plan.queryVariants.length}):**`);
      for (const v of plan.queryVariants) {
        lines.push(`- ${v}`);
      }
      lines.push(``);
    }

    // Retrieval stats
    lines.push(`### Retrieval`);
    lines.push(``);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Raw retrieved | ${result.rawRetrievedCount ?? 0} |`);
    lines.push(`| After dedup | ${result.deduplicatedCount ?? 0} |`);
    lines.push(`| After guideline filter | ${result.afterGuidelineFilterCount ?? 0} |`);
    lines.push(`| Ranked (top 10) | ${result.rankedCount ?? 0} |`);
    if (sourceBreakdown) {
      for (const [src, n] of Object.entries(sourceBreakdown)) {
        lines.push(`| Source: ${src} | ${n} |`);
      }
    }
    lines.push(``);

    // Quality judgment
    lines.push(`### Retrieval quality`);
    lines.push(``);
    if (initialJudgment) {
      const qs = initialJudgment.qualityScore;
      lines.push(`**Initial quality:** ${qualityEmoji(initialJudgment.quality)} — score: **${qs.total.toFixed(3)}**`);
      lines.push(`- top5Align=${qs.top5TopicalAlignment.toFixed(3)} interventionMatch=${qs.interventionMatch.toFixed(3)} popMatch=${qs.populationMatch.toFixed(3)} evidenceBonus=${qs.evidenceTypeBonus.toFixed(3)}`);
      lines.push(`- penalties: offTopic=${qs.offTopicPenalty.toFixed(3)} guideline=${qs.guidelinePollutionPenalty.toFixed(3)} conflation=${qs.entityConflationPenalty.toFixed(3)} diseaseBleed=${qs.diseaseBleedPenalty.toFixed(3)}`);
      lines.push(`**Trigger repair:** ${initialJudgment.shouldTriggerRepair ? `yes — ${initialJudgment.triggerReason}` : "no"}`);
      if (initialJudgment.issues.length > 0) {
        lines.push(`**Issues detected:**`);
        for (const issue of initialJudgment.issues) {
          lines.push(`- \`[${issue.severity}] ${issue.kind}\`: ${issue.description}`);
        }
      }
    }
    if (result.repairTriggered) {
      lines.push(``);
      lines.push(`**⟳ Repair loop triggered** — strategy: \`${result.repairStrategy}\``);
      lines.push(`- Original score: ${result.originalQualityScore?.toFixed(3) ?? "—"} → Repaired score: ${result.repairedQualityScore?.toFixed(3) ?? "—"}`);
      lines.push(`- Decision: ${result.keepRepairedReason ?? "—"}`);
      lines.push(`**Repair queries used:**`);
      for (const rq of result.repairQueriesUsed ?? []) {
        lines.push(`- ${rq}`);
      }
      lines.push(`**Papers before repair:** ${result.paperCountBeforeRepair} → **after:** ${result.paperCountAfterRepair}`);
      if (finalJudgment && finalJudgment !== initialJudgment) {
        lines.push(`**Final quality:** ${qualityEmoji(finalJudgment.quality)} — score: ${finalJudgment.qualityScore.total.toFixed(3)}`);
      }
    }
    lines.push(``);

    // Grounding
    lines.push(`**Grounding validation:** ${groundingSummary(grounding)}`);
    if (grounding && grounding.flags.length > 0) {
      const unsupported = grounding.flags.filter((f) => !f.supported);
      if (unsupported.length > 0) {
        lines.push(`**Unsupported numeric claims:**`);
        for (const f of unsupported) {
          lines.push(`- \`${f.claim.slice(0, 120)}\``);
        }
      }
    }
    lines.push(``);

    // Evidence snapshot
    if (snapshot) {
      lines.push(`### Evidence snapshot`);
      lines.push(``);
      lines.push(`| Bucket | Count |`);
      lines.push(`|--------|-------|`);
      if (snapshot.metaAnalyses > 0) lines.push(`| Meta-analyses / systematic reviews | ${snapshot.metaAnalyses} |`);
      if (snapshot.rcts > 0) lines.push(`| Human RCTs | ${snapshot.rcts} |`);
      if (snapshot.humanObservational > 0) lines.push(`| Human observational | ${snapshot.humanObservational} |`);
      if (snapshot.mechanistic > 0) lines.push(`| Mechanistic / animal | ${snapshot.mechanistic} |`);
      if (snapshot.conflicting > 0) lines.push(`| Conflicting findings | ${snapshot.conflicting} |`);
      lines.push(`| **Total** | **${snapshot.totalPapers}** |`);
      lines.push(``);
      lines.push(`**Overall confidence:** \`${snapshot.overallConfidence}\``);
      lines.push(`**Synthesis confidence:** \`${synthesis?.confidence ?? "—"}\``);
      lines.push(`**No evidence:** ${synthesis?.noEvidence ? "Yes ⚠️" : "No"}`);
      lines.push(`**Latency:** ${fmtMs(result.latencyMs)}`);
      lines.push(``);
    }

    // Synthesis
    if (synthesis?.synthesisText) {
      lines.push(`### Synthesis`);
      lines.push(``);
      lines.push(`> ${synthesis.synthesisText.replace(/\n/g, "\n> ")}`);
      lines.push(``);
      if (synthesis.followUpOptions?.length > 0) {
        lines.push(`**Follow-up options generated:**`);
        for (const opt of synthesis.followUpOptions) {
          lines.push(`- ${opt}`);
        }
        lines.push(``);
      }
    }

    // Top papers table
    if (topPapers && topPapers.length > 0) {
      lines.push(`### Top ${topPapers.length} papers`);
      lines.push(``);
      lines.push(`| # | Title | Year | Design | Bucket | Score |`);
      lines.push(`|---|-------|------|--------|--------|-------|`);
      for (let i = 0; i < topPapers.length; i++) {
        const p = topPapers[i];
        const title = escMd(p.title.slice(0, 70)) + (p.title.length > 70 ? "…" : "");
        lines.push(
          `| ${i + 1} | ${title} | ${p.year ?? "—"} | ${p.studyDesign} | ${p.evidenceBucket} | ${p.evidenceScore.toFixed(2)} |`,
        );
      }
      lines.push(``);
    }

    // Warnings
    const warnings: string[] = [];
    if (result.afterGuidelineFilterCount === 0) warnings.push("Zero papers after guideline filter");
    if (result.deduplicatedCount === 0) warnings.push("Zero papers after dedup — no evidence returned");
    if (synthesis?.noEvidence) warnings.push("Synthesizer flagged no good evidence");
    if ((result.rankedCount ?? 0) < 3) warnings.push("Fewer than 3 papers ranked — thin evidence base");
    if (snapshot && snapshot.mechanistic === snapshot.totalPapers && snapshot.totalPapers > 0) {
      warnings.push("All papers are mechanistic/animal — no human evidence found");
    }

    if (warnings.length > 0) {
      lines.push(`> ⚠️ **Warnings:** ${warnings.join(" | ")}`);
      lines.push(``);
    }

    // Manual scoring template
    lines.push(scoringTemplate());
    lines.push(`---`);
    lines.push(``);
  }

  // Comparison hint
  lines.push(`## How to compare runs`);
  lines.push(``);
  lines.push(`Each run is saved to \`evals/search/runs/<timestamp>/\`.`);
  lines.push(`To compare two runs, diff the \`results.json\` files:`);
  lines.push(``);
  lines.push(`\`\`\`bash`);
  lines.push(`diff <run-a>/results.json <run-b>/results.json`);
  lines.push(`# or use jq to extract specific fields for comparison`);
  lines.push(`jq '[.[] | {id: .query.id, confidence: .synthesis.confidence, rankedCount}]' <run>/results.json`);
  lines.push(`\`\`\``);

  return lines.join("\n");
}

function scoringTemplate(): string {
  return [
    `### Manual scoring`,
    ``,
    `| Metric | Score (1–5) | Notes |`,
    `|--------|-------------|-------|`,
    `| Retrieval relevance | ___ | Are the papers actually about the topic? |`,
    `| Ranking quality | ___ | Are the best papers at the top? |`,
    `| Synthesis usefulness | ___ | Does the synthesis help a normal person understand? |`,
    `| Uncertainty / safety | ___ | Does it avoid overclaiming? Are caveats honest? |`,
    `| Overall | ___ | Would you show this to a real user? |`,
    ``,
    `**Reviewer notes:**`,
    ``,
    ``,
  ].join("\n");
}

async function runEvals(queryIds?: string[]) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runDir = path.join(RUNS_DIR, timestamp);
  fs.mkdirSync(runDir, { recursive: true });

  const queriesToRun = queryIds
    ? EVAL_QUERIES.filter((q) => queryIds.includes(q.id))
    : EVAL_QUERIES;

  console.log(`\n🔬 Clarity Search Eval`);
  console.log(`   Run: ${timestamp}`);
  console.log(`   Queries: ${queriesToRun.length}`);
  console.log(`   Output: ${runDir}`);
  console.log(``);

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("❌  OPENROUTER_API_KEY is not set — evals require a real API key");
    process.exit(1);
  }

  const results: EvalResult[] = [];

  // Run queries sequentially to avoid rate-limiting
  for (const query of queriesToRun) {
    const result = await runSingleEval(query);
    results.push(result);
    // Brief pause between queries to be polite to APIs
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Save raw JSON
  const jsonPath = path.join(runDir, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\n✓  Raw results: ${jsonPath}`);

  // Generate markdown report
  const report = generateMarkdownReport(results, timestamp);
  const reportPath = path.join(runDir, "report.md");
  fs.writeFileSync(reportPath, report);
  console.log(`✓  Report:       ${reportPath}`);

  // Summary
  const succeeded = results.filter((r) => r.success).length;
  const totalLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0);
  const noEvidenceCases = results.filter((r) => r.synthesis?.noEvidence).length;
  const repairCount = results.filter((r) => r.repairTriggered).length;
  const groundingIssues = results.filter(
    (r) => r.grounding && (r.grounding.unsupportedNumericClaims > 0 || r.grounding.causalOverreach),
  ).length;
  const sortedLatencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const medianLatencyMs = sortedLatencies[Math.floor(sortedLatencies.length / 2)] ?? 0;

  console.log(``);
  console.log(`📊 Summary:`);
  console.log(`   Succeeded: ${succeeded}/${results.length}`);
  console.log(`   Total time: ${fmtMs(totalLatencyMs)}`);
  console.log(`   Avg latency: ${fmtMs(Math.round(totalLatencyMs / results.length))}`);
  console.log(`   Median latency: ${fmtMs(medianLatencyMs)}`);
  console.log(`   No-evidence cases: ${noEvidenceCases}`);
  console.log(`   Repair triggered: ${repairCount}/${results.length}`);
  console.log(`   Grounding issues: ${groundingIssues}/${results.length}`);

  return runDir;
}

// Parse optional query ID filter from argv: --queries supp-01,supp-02
const args = process.argv.slice(2);
const queryFlagIdx = args.indexOf("--queries");
const queryFilter =
  queryFlagIdx !== -1 && args[queryFlagIdx + 1]
    ? args[queryFlagIdx + 1].split(",").map((s) => s.trim())
    : undefined;

runEvals(queryFilter)
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal:", err);
    pool.end();
    process.exit(1);
  });
