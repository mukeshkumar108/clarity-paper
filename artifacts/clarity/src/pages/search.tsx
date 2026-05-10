import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { SearchInput } from "@/components/search/SearchInput";
import { SearchResults } from "@/components/search/SearchResults";
import { RecentSearches } from "@/components/search/RecentSearches";
import { useToast } from "@/hooks/use-toast";
import { useStreamingSearch } from "@/hooks/use-streaming-search";
import { AlertCircle, Microscope } from "lucide-react";
import { SearchLoadingState } from "@/components/search/SearchLoadingState";
import type { SearchResult, SearchSessionSummary, EvidenceSnapshot } from "@/lib/search-types";

const SESSIONS_QUERY_KEY = ["search-sessions"];

const EMPTY_SNAPSHOT: EvidenceSnapshot = {
  metaAnalyses: 0, rcts: 0, humanObservational: 0, mechanistic: 0,
  conflicting: 0, totalPapers: 0, overallConfidence: "preliminary",
};

function useSearchSessions() {
  return useQuery<SearchSessionSummary[]>({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => customFetch<SearchSessionSummary[]>("/api/search/sessions"),
    staleTime: 30_000,
  });
}

function useLoadSession() {
  return useMutation<SearchResult, Error, number>({
    mutationFn: (sessionId: number) =>
      customFetch<SearchResult>(`/api/search/sessions/${sessionId}`),
  });
}

export default function Search() {
  const [currentQuery, setCurrentQuery] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sessions, isLoading: sessionsLoading } = useSearchSessions();
  const loadSessionMutation = useLoadSession();
  const { state, setState, startSearch } = useStreamingSearch();

  const handleSearch = useCallback(
    async (query: string) => {
      setCurrentQuery(query);
      try {
        await startSearch(query);
        // Refresh session list once the search fully completes (done event sets sessionId)
        queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      } catch {
        // error state is set inside the hook
        toast({
          title: "Search failed",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [startSearch, queryClient, toast],
  );

  const handleFollowUp = useCallback(
    (option: string) => handleSearch(option),
    [handleSearch],
  );

  const handleSessionSelect = useCallback(
    async (sessionId: number) => {
      setState({ kind: "searching", query: "" });
      try {
        const result = await loadSessionMutation.mutateAsync(sessionId);
        setCurrentQuery(result.query);
        setState({ kind: "result", result });
      } catch {
        setState({ kind: "idle" });
        toast({
          title: "Could not load search",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    },
    [loadSessionMutation, setState, toast],
  );

  const isLoading = state.kind === "searching";

  // Build display props for SearchResults when papers are ready (streaming) or fully complete
  const displayResult: SearchResult | null =
    state.kind === "papers_ready"
      ? {
          sessionId: 0,
          query: state.query,
          plan: {
            intentType: "topic_exploration",
            userQuestion: state.query,
            detectedLanguage: "en",
            responseLanguage: "en",
            normalizedEnglishQuestion: state.query,
            entities: [],
            hiddenGoals: [],
            queryVariants: [],
            directQueryVariants: [],
            contextQueryVariants: [],
            followUpQuestions: [],
          },
          papers: state.papers,
          evidenceSnapshot: state.evidenceSnapshot,
          noEvidence: state.noEvidence,
          synthesisText: "",
          confidence: "preliminary",
          evidenceSpans: [],
          followUpOptions: [],
          coverageNote: "abstracts_only",
        }
      : state.kind === "result"
        ? state.result
        : null;

  const synthesisLoading = state.kind === "papers_ready";

  return (
    <DashboardLayout>
      <div className="max-w-[860px] mx-auto space-y-10">
        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-onyx-outline/8 flex items-center justify-center">
              <Microscope className="w-5 h-5 text-onyx-outline" />
            </div>
            <h1 className="text-[30px] font-semibold tracking-tight text-deep-shadow leading-none">
              Research Search
            </h1>
          </div>
          <p className="text-[15px] text-muted-stone max-w-[60ch] leading-relaxed">
            Start with the messy version of the question. We pull the most
            relevant papers, tell you the real story in plain English, and let
            you inspect the evidence yourself.
          </p>
        </header>

        {/* Search input */}
        <SearchInput
          onSearch={handleSearch}
          isLoading={isLoading}
          initialQuery={currentQuery}
          key={currentQuery}
        />

        {/* Loading — before first papers arrive */}
        {state.kind === "searching" && <SearchLoadingState />}

        {/* Error state */}
        {state.kind === "error" && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[15px] font-medium text-red-700">
                Search unavailable
              </p>
              <p className="text-[13px] text-red-600 mt-0.5">{state.message}</p>
            </div>
          </div>
        )}

        {/* Progressive results — papers immediately, synthesis skeleton until ready */}
        {displayResult && (
          <SearchResults
            result={displayResult}
            onFollowUp={handleFollowUp}
            synthesisLoading={synthesisLoading}
          />
        )}

        {/* Idle: show recent searches */}
        {state.kind === "idle" && (
          <RecentSearches
            sessions={sessions ?? []}
            onSelect={handleSessionSelect}
            isLoading={sessionsLoading}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
