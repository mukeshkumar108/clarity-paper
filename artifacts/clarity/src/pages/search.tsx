import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { SearchInput } from "@/components/search/SearchInput";
import { SearchResults } from "@/components/search/SearchResults";
import { RecentSearches } from "@/components/search/RecentSearches";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Microscope } from "lucide-react";
import { SearchLoadingState } from "@/components/search/SearchLoadingState";
import type { SearchResult, SearchSessionSummary } from "@/lib/search-types";

const SESSIONS_QUERY_KEY = ["search-sessions"];

function useSearchSessions() {
  return useQuery<SearchSessionSummary[]>({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => customFetch<SearchSessionSummary[]>("/api/search/sessions"),
    staleTime: 30_000,
  });
}

function useRunSearch() {
  return useMutation<SearchResult, Error, string>({
    mutationFn: (query: string) =>
      customFetch<SearchResult>("/api/search", {
        method: "POST",
        body: JSON.stringify({ query }),
      }),
  });
}

function useLoadSession() {
  return useMutation<SearchResult, Error, number>({
    mutationFn: (sessionId: number) =>
      customFetch<SearchResult>(`/api/search/sessions/${sessionId}`),
  });
}

type SearchState =
  | { kind: "idle" }
  | { kind: "loading"; query: string }
  | { kind: "result"; result: SearchResult }
  | { kind: "error"; message: string };

export default function Search() {
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [currentQuery, setCurrentQuery] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: sessions, isLoading: sessionsLoading } = useSearchSessions();
  const searchMutation = useRunSearch();
  const loadSessionMutation = useLoadSession();

  const handleSearch = useCallback(
    async (query: string) => {
      setCurrentQuery(query);
      setState({ kind: "loading", query });

      try {
        const result = await searchMutation.mutateAsync(query);
        setState({ kind: "result", result });
        queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Search failed. Please try again.";
        setState({ kind: "error", message });
        toast({ title: "Search failed", description: message, variant: "destructive" });
      }
    },
    [searchMutation, queryClient, toast],
  );

  const handleFollowUp = useCallback(
    (option: string) => {
      handleSearch(option);
    },
    [handleSearch],
  );

  const handleSessionSelect = useCallback(
    async (sessionId: number) => {
      setState({ kind: "loading", query: "" });
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
    [loadSessionMutation, toast],
  );

  const isLoading = state.kind === "loading";

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
            Ask any health or science question. We search across millions of
            papers and give you an honest synthesis of what the evidence
            actually shows.
          </p>
        </header>

        {/* Search input */}
        <SearchInput
          onSearch={handleSearch}
          isLoading={isLoading}
          initialQuery={currentQuery}
          key={currentQuery}
        />

        {/* Loading state */}
        {state.kind === "loading" && <SearchLoadingState />}

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

        {/* Results */}
        {state.kind === "result" && (
          <SearchResults result={state.result} onFollowUp={handleFollowUp} />
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
