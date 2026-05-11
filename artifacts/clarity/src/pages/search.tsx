import React, { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { SearchInput } from "@/components/search/SearchInput";
import { RecentSearches } from "@/components/search/RecentSearches";
import { useToast } from "@/hooks/use-toast";
import { useStreamingSearch } from "@/hooks/use-streaming-search";
import { AlertCircle, Microscope } from "lucide-react";
import { SearchLoadingState } from "@/components/search/SearchLoadingState";
import type { SearchSessionSummary } from "@/lib/search-types";
import { useLocation } from "wouter";

const SESSIONS_QUERY_KEY = ["search-sessions"];

function useSearchSessions() {
  return useQuery<SearchSessionSummary[]>({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => customFetch<SearchSessionSummary[]>("/api/search/sessions"),
    staleTime: 30_000,
  });
}

export default function Search() {
  const [currentQuery, setCurrentQuery] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: sessions, isLoading: sessionsLoading } = useSearchSessions();
  const { state, startSearch } = useStreamingSearch();

  const handleSearch = useCallback(
    async (query: string) => {
      setCurrentQuery(query);
      try {
        const result = await startSearch(query);
        // Refresh session list once the search fully completes (done event sets sessionId)
        queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
        if (result?.sessionId) {
          navigate(`/search/${result.sessionId}`);
        }
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

  const handleSessionSelect = useCallback(
    async (sessionId: number) => {
      navigate(`/search/${sessionId}`);
    },
    [navigate],
  );

  const isLoading = state.kind === "searching";

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
              Ask a research question
            </h1>
          </div>
          <p className="text-[15px] text-muted-stone max-w-[60ch] leading-relaxed">
            Start with the messy version. Clarity gives you a warm first read of
            the evidence, then points you toward the papers most worth opening.
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

        {/* Idle: show recent searches */}
        {state.kind !== "searching" && (
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
