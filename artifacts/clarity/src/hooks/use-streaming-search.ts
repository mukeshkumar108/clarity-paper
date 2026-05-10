import { useState, useCallback, useRef } from "react";
import type {
  RankedPaper,
  EvidenceSnapshot,
  EvidenceSpan,
  SearchResult,
  SearchStreamEvent,
} from "@/lib/search-types";

export type SearchState =
  | { kind: "idle" }
  | { kind: "searching"; query: string }
  | {
      kind: "papers_ready";
      query: string;
      papers: RankedPaper[];
      evidenceSnapshot: EvidenceSnapshot;
      noEvidence: boolean;
    }
  | { kind: "result"; result: SearchResult }
  | { kind: "error"; message: string };

const STUB_PLAN: SearchResult["plan"] = {
  intentType: "topic_exploration",
  userQuestion: "",
  entities: [],
  hiddenGoals: [],
  queryVariants: [],
  followUpQuestions: [],
};

const EMPTY_SNAPSHOT: EvidenceSnapshot = {
  metaAnalyses: 0,
  rcts: 0,
  humanObservational: 0,
  mechanistic: 0,
  conflicting: 0,
  totalPapers: 0,
  overallConfidence: "preliminary",
};

async function readSSEStream(
  query: string,
  onEvent: (event: SearchStreamEvent) => void,
): Promise<void> {
  const response = await fetch("/api/search/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Search failed");
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          onEvent(JSON.parse(raw) as SearchStreamEvent);
        } catch {
          // malformed SSE line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function useStreamingSearch() {
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const papersRef = useRef<{
    papers: RankedPaper[];
    evidenceSnapshot: EvidenceSnapshot;
    noEvidence: boolean;
  } | null>(null);

  const startSearch = useCallback(
    async (query: string): Promise<void> => {
      setState({ kind: "searching", query });
      papersRef.current = null;
      let hadError = false;

      try {
        await readSSEStream(query, (event) => {
          switch (event.type) {
            case "papers": {
              papersRef.current = {
                papers: event.papers,
                evidenceSnapshot: event.evidenceSnapshot,
                noEvidence: event.noEvidence,
              };
              setState({
                kind: "papers_ready",
                query,
                papers: event.papers,
                evidenceSnapshot: event.evidenceSnapshot,
                noEvidence: event.noEvidence,
              });
              break;
            }
            case "synthesis": {
              const p = papersRef.current;
              setState({
                kind: "result",
                result: {
                  sessionId: 0,
                  query,
                  plan: { ...STUB_PLAN, userQuestion: query },
                  papers: p?.papers ?? [],
                  evidenceSnapshot: p?.evidenceSnapshot ?? EMPTY_SNAPSHOT,
                  noEvidence: p?.noEvidence ?? true,
                  synthesisText: event.synthesisText,
                  confidence: event.confidence,
                  evidenceSpans: event.evidenceSpans,
                  followUpOptions: event.followUpOptions,
                  coverageNote: event.coverageNote,
                },
              });
              break;
            }
            case "done": {
              setState((prev) =>
                prev.kind === "result"
                  ? { ...prev, result: { ...prev.result, sessionId: event.sessionId } }
                  : prev,
              );
              break;
            }
            case "error": {
              hadError = true;
              setState({ kind: "error", message: event.message });
              break;
            }
          }
        });
      } catch (err) {
        if (!hadError) {
          const message =
            err instanceof Error ? err.message : "Search failed. Please try again.";
          setState({ kind: "error", message });
        }
      }
    },
    [],
  );

  return { state, setState, startSearch };
}
