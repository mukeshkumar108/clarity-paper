import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inArray } from "drizzle-orm";
import {
  buildSearchResultFromPapers,
  getSearchSession,
  overwriteSearchSession,
  rerunSearchIntoExistingSession,
  runSearch,
} from "../lib/search/index";
import { orchestrateSidebarInput } from "../lib/search/sidebarOrchestrator";
import { planResearch } from "../lib/search/researchPlanner";
import { logger } from "../lib/logger";
import { db, searchSessionMessagesTable, searchSessionsTable } from "@workspace/db";
import type {
  RankedPaper,
  SearchSessionDetail,
  SearchSessionMessage,
} from "../lib/search/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.resolve(__dirname, "../../evals/sidebar-phase2/runs");
const USER_ID = 1;

type ScenarioId = `${number}`;

interface Scenario {
  id: ScenarioId;
  audience: "consumer" | "professional" | "retrieval";
  initialQuery: string;
  sidebarInput: string;
}

interface ValidationResult {
  id: ScenarioId;
  audience: Scenario["audience"];
  initialQuery: string;
  sidebarInput: string;
  sessionId: number;
  classification: string;
  retrievalTriggered: boolean;
  canvasMutated: boolean;
  usedCurrentPapers: boolean;
  focusSummaryBefore: string;
  focusSummaryAfter: string;
  assistantReply: string;
  papersBefore: number;
  papersAfter: number;
  followUpsAfter: string[];
  warnings: string[];
  errors: string[];
}

const SCENARIOS: Scenario[] = [
  { id: "1", audience: "consumer", initialQuery: "is magnesium good for sleep?", sidebarInput: "what does this actually mean?" },
  { id: "2", audience: "consumer", initialQuery: "brain fog supplements", sidebarInput: "i'm just tired all the time" },
  { id: "3", audience: "consumer", initialQuery: "does creatine help the brain?", sidebarInput: "is this relevant if i sleep badly?" },
  { id: "4", audience: "professional", initialQuery: "ketamine treatment for PTSD", sidebarInput: "only human RCTs" },
  { id: "5", audience: "professional", initialQuery: "depression interventions", sidebarInput: "non-pharmaceutical only" },
  { id: "6", audience: "professional", initialQuery: "CBT vs mindfulness depression", sidebarInput: "are these mostly short-term outcomes?" },
  { id: "7", audience: "retrieval", initialQuery: "depression interventions", sidebarInput: "what about sleep?" },
  { id: "8", audience: "retrieval", initialQuery: "creatine cognition", sidebarInput: "show me papers specifically on sleep deprivation" },
  { id: "9", audience: "retrieval", initialQuery: "magnesium glycinate sleep", sidebarInput: "did you find anything specifically on glycinate?" },
  { id: "10", audience: "retrieval", initialQuery: "fasting cognition", sidebarInput: "find all papers" },
];

function textForPaper(paper: RankedPaper): string {
  return `${paper.title} ${paper.abstract}`.toLowerCase();
}

function applyPaperFilters(
  session: SearchSessionDetail,
  filters: {
    population: "human" | "animal" | "in_vitro" | null;
    studyDesign:
      | "meta_analysis"
      | "systematic_review"
      | "rct"
      | "cohort"
      | "cross_sectional"
      | null;
    evidenceBuckets: Array<
      "strongest" | "human_observational" | "mechanistic" | "background" | "conflicting"
    >;
    keywordFocus: string[];
  },
): RankedPaper[] {
  return session.papers.filter((paper) => {
    if (filters.population && paper.populationType !== filters.population) return false;
    if (filters.studyDesign && paper.studyDesign !== filters.studyDesign) return false;
    if (filters.evidenceBuckets.length > 0 && !filters.evidenceBuckets.includes(paper.evidenceBucket)) {
      return false;
    }
    if (filters.keywordFocus.length > 0) {
      const haystack = textForPaper(paper);
      const hasKeyword = filters.keywordFocus.some((keyword) =>
        haystack.includes(keyword.toLowerCase()),
      );
      if (!hasKeyword) return false;
    }
    return true;
  });
}

function formatLogEntry(
  level: "warn" | "error",
  args: unknown[],
): string {
  const [first, second] = args;
  const detail =
    typeof first === "string"
      ? first
      : first && typeof first === "object"
        ? JSON.stringify(
            Object.fromEntries(
              Object.entries(first as Record<string, unknown>).filter(([key]) =>
                ["status", "query", "triggerReason", "err", "sessionId"].includes(key),
              ),
            ),
          )
        : "";
  const message = typeof second === "string" ? second : "";
  return `[${level}] ${message}${detail ? ` ${detail}` : ""}`.trim();
}

function captureLogs() {
  const warnings: string[] = [];
  const errors: string[] = [];
  const originalWarn = logger.warn.bind(logger);
  const originalError = logger.error.bind(logger);

  (logger as any).warn = (...args: unknown[]) => {
    warnings.push(formatLogEntry("warn", args));
    return originalWarn(...(args as Parameters<typeof originalWarn>));
  };

  (logger as any).error = (...args: unknown[]) => {
    errors.push(formatLogEntry("error", args));
    return originalError(...(args as Parameters<typeof originalError>));
  };

  return {
    warnings,
    errors,
    restore() {
      (logger as any).warn = originalWarn;
      (logger as any).error = originalError;
    },
  };
}

async function persistMessage(
  sessionId: number,
  role: "user" | "assistant",
  kind: SearchSessionMessage["kind"],
  content: string,
  metadata: SearchSessionMessage["metadata"],
): Promise<void> {
  await db.insert(searchSessionMessagesTable).values({
    sessionId,
    role,
    kind,
    content,
    metadata: metadata ?? {},
  });
}

async function runScenario(scenario: Scenario): Promise<ValidationResult> {
  process.stdout.write(`  [${scenario.id}] ${scenario.initialQuery} → ${scenario.sidebarInput}\n`);
  const captured = captureLogs();

  try {
    const initial = await runSearch(USER_ID, scenario.initialQuery);
    const session = await getSearchSession(initial.sessionId, USER_ID);
    if (!session) {
      throw new Error(`Session ${initial.sessionId} not found after initial search`);
    }

    const action = await orchestrateSidebarInput(session, scenario.sidebarInput);
    const focusSummaryBefore = session.focusState.summary;
    const papersBefore = session.papers.length;

    await persistMessage(initial.sessionId, "user", "refinement", scenario.sidebarInput, {
      canvasChanged: false,
    });

    let assistantKind: SearchSessionMessage["kind"] = "system";
    let retrievalTriggered = false;
    let canvasMutated = false;
    let usedCurrentPapers = false;

    if (
      action.actionType === "answer_current_results" ||
      action.actionType === "exhaustive_intent_transparency"
    ) {
      assistantKind = "answer";
    } else if (action.actionType === "clarification_prompt") {
      assistantKind = "clarification";
    } else {
      assistantKind = "canvas_update";
      canvasMutated = true;
      const effectiveQuery = action.refinedQuery?.trim() || `${session.query} ${scenario.sidebarInput}`;

      if (action.actionType === "refine_current_canvas" && action.reuseCurrentPapers) {
        const filteredPapers = applyPaperFilters(session, action.filters);
        if (filteredPapers.length > 0) {
          const refinedPlan = await planResearch(effectiveQuery);
          const rebuilt = await buildSearchResultFromPapers(
            effectiveQuery,
            refinedPlan,
            filteredPapers,
          );
          await overwriteSearchSession(initial.sessionId, rebuilt);
          usedCurrentPapers = true;
        } else {
          await rerunSearchIntoExistingSession(USER_ID, initial.sessionId, effectiveQuery);
          retrievalTriggered = true;
        }
      } else {
        await rerunSearchIntoExistingSession(USER_ID, initial.sessionId, effectiveQuery);
        retrievalTriggered = true;
      }
    }

    await persistMessage(initial.sessionId, "assistant", assistantKind, action.assistantReply, {
      canvasChanged: canvasMutated,
      actionType: action.actionType,
      focusBadges: action.focusBadges,
      focusSummary: action.focusSummary,
      retrievalMode: action.retrievalMode ?? undefined,
    });

    const updated = await getSearchSession(initial.sessionId, USER_ID);
    if (!updated) {
      throw new Error(`Session ${initial.sessionId} missing after sidebar action`);
    }

    return {
      id: scenario.id,
      audience: scenario.audience,
      initialQuery: scenario.initialQuery,
      sidebarInput: scenario.sidebarInput,
      sessionId: initial.sessionId,
      classification: action.actionType,
      retrievalTriggered,
      canvasMutated,
      usedCurrentPapers,
      focusSummaryBefore,
      focusSummaryAfter: updated.focusState.summary,
      assistantReply: action.assistantReply,
      papersBefore,
      papersAfter: updated.papers.length,
      followUpsAfter: updated.followUpOptions.slice(0, 3),
      warnings: captured.warnings,
      errors: captured.errors,
    };
  } finally {
    captured.restore();
  }
}

function toBool(value: boolean): string {
  return value ? "yes" : "no";
}

function escMd(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function generateMarkdown(results: ValidationResult[], runTimestamp: string): string {
  const lines: string[] = [];
  lines.push("# Sidebar Phase 2 Validation");
  lines.push("");
  lines.push(`Run: ${runTimestamp}`);
  lines.push("");
  lines.push("| # | Audience | Initial query | Sidebar input | Classification | Retrieval | Canvas mutated | Reused papers | Papers before→after |");
  lines.push("|---|---|---|---|---|---|---|---|---|");

  for (const result of results) {
    lines.push(
      `| ${result.id} | ${result.audience} | ${escMd(result.initialQuery)} | ${escMd(result.sidebarInput)} | ${result.classification} | ${toBool(result.retrievalTriggered)} | ${toBool(result.canvasMutated)} | ${toBool(result.usedCurrentPapers)} | ${result.papersBefore}→${result.papersAfter} |`,
    );
  }

  lines.push("");
  lines.push("## Detailed Results");
  lines.push("");

  for (const result of results) {
    lines.push(`### Scenario ${result.id}`);
    lines.push(`- Initial query: ${result.initialQuery}`);
    lines.push(`- Sidebar input: ${result.sidebarInput}`);
    lines.push(`- Classification: ${result.classification}`);
    lines.push(`- Retrieval triggered: ${toBool(result.retrievalTriggered)}`);
    lines.push(`- Canvas mutated: ${toBool(result.canvasMutated)}`);
    lines.push(`- Reused current papers: ${toBool(result.usedCurrentPapers)}`);
    lines.push(`- Focus before: ${result.focusSummaryBefore}`);
    lines.push(`- Focus after: ${result.focusSummaryAfter}`);
    lines.push(`- Assistant reply: ${result.assistantReply}`);
    lines.push(`- Top follow-ups after: ${result.followUpsAfter.join(" | ") || "—"}`);
    if (result.warnings.length > 0) {
      lines.push(`- Warnings:`);
      for (const warning of result.warnings) lines.push(`  - ${warning}`);
    }
    if (result.errors.length > 0) {
      lines.push(`- Errors:`);
      for (const error of result.errors) lines.push(`  - ${error}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(RUNS_DIR, timestamp);
  fs.mkdirSync(runDir, { recursive: true });

  const sessionIds: number[] = [];
  const results: ValidationResult[] = [];

  try {
    for (const scenario of SCENARIOS) {
      const result = await runScenario(scenario);
      sessionIds.push(result.sessionId);
      results.push(result);
    }
  } finally {
    if (sessionIds.length > 0) {
      await db
        .delete(searchSessionsTable)
        .where(inArray(searchSessionsTable.id, sessionIds));
    }
  }

  const jsonPath = path.join(runDir, "results.json");
  const mdPath = path.join(runDir, "report.md");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(mdPath, generateMarkdown(results, timestamp));

  process.stdout.write(`\nSaved results to ${jsonPath}\n`);
  process.stdout.write(`Saved report to ${mdPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
