import React, { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { SearchResults } from "@/components/search/SearchResults";
import { PaperPathways } from "@/components/search/PaperPathways";
import { CurrentFocusStrip } from "@/components/search/CurrentFocusStrip";
import { ExplorationSidebar } from "@/components/search/ExplorationSidebar";
import { AlertCircle, Microscope, Menu } from "lucide-react";
import type { SearchSessionDetail, SearchSessionMessage } from "@/lib/search-types";
import { Button } from "@/components/ui/button";

const sessionQueryKey = (sessionId: number) => ["search-session", sessionId];

function useSearchSession(sessionId: number) {
  return useQuery<SearchSessionDetail>({
    queryKey: sessionQueryKey(sessionId),
    queryFn: () => customFetch<SearchSessionDetail>(`/api/search/sessions/${sessionId}`),
    staleTime: 30_000,
  });
}

function useAppendSessionMessage(sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation<
    { messages: SearchSessionMessage[]; session?: SearchSessionDetail | null },
    Error,
    string
  >({
    mutationFn: (content: string) =>
      customFetch<{ messages: SearchSessionMessage[]; session?: SearchSessionDetail | null }>(
        `/api/search/sessions/${sessionId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        },
      ),
    onSuccess: (payload) => {
      queryClient.setQueryData<SearchSessionDetail | undefined>(
        sessionQueryKey(sessionId),
        (current) => {
          if (!current) return current;
          if (payload.session) return payload.session;
          return { ...current, messages: [...current.messages, ...payload.messages] };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["search-sessions"] });
    },
  });
}

export default function SearchSessionPage({ id }: { id: string }) {
  const sessionId = Number.parseInt(id, 10);
  const { data, isLoading, error } = useSearchSession(sessionId);
  const appendMessage = useAppendSessionMessage(sessionId);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleRefine = useCallback(
    async (content: string) => {
      await appendMessage.mutateAsync(content);
    },
    [appendMessage],
  );

  const handleFollowUp = useCallback(
    async (query: string) => {
      await appendMessage.mutateAsync(query);
    },
    [appendMessage],
  );

  if (Number.isNaN(sessionId)) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[15px] font-medium text-red-700">Invalid session</p>
            <p className="text-[13px] text-red-600 mt-0.5">
              This exploration session link is not valid.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-onyx-outline/8 flex items-center justify-center shrink-0">
              <Microscope className="w-5 h-5 text-onyx-outline" />
            </div>
            <div className="space-y-1 min-w-0">
              <h1 className="text-[24px] font-semibold tracking-tight text-deep-shadow leading-tight">
                {data?.query ?? "Exploration session"}
              </h1>
              <p className="text-[13px] text-muted-stone leading-relaxed">
                A conversational exploration of the evidence.
              </p>
            </div>
          </div>
          
          {/* Drawer toggle button */}
          {data && data.messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDrawerOpen(true)}
              className="shrink-0 flex items-center gap-2"
            >
              <Menu className="w-4 h-4" />
              History
            </Button>
          )}
        </header>

        {isLoading && (
          <div className="rounded-2xl border border-pebble-gray/70 bg-white/60 px-5 py-4">
            <p className="text-[14px] text-muted-stone">
              Loading this exploration session…
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[15px] font-medium text-red-700">
                Could not load exploration
              </p>
              <p className="text-[13px] text-red-600 mt-0.5">
                Please try again.
              </p>
            </div>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Current focus strip - full width */}
            <CurrentFocusStrip session={data} />
            
            {/* Two-column layout: Conversational flow left, Papers right */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
              {/* Left column: Conversational flow */}
              <div className="min-w-0">
                <SearchResults
                  result={data}
                  messages={data.messages}
                  onFollowUp={handleFollowUp}
                  onRefine={handleRefine}
                  isRefining={appendMessage.isPending}
                />
              </div>

              {/* Right column: Paper pathways - independently scrollable */}
              <div className="min-w-0 xl:border-l xl:border-pebble-gray/50 xl:pl-8 xl:h-[calc(100vh-200px)] xl:overflow-y-auto">
                <div className="xl:sticky xl:top-0 pb-6">
                  <PaperPathways papers={data.papers} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Exploration sidebar as drawer */}
      {data && (
        <ExplorationSidebar
          messages={data.messages}
          onSubmit={handleRefine}
          isSubmitting={appendMessage.isPending}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
        />
      )}
    </DashboardLayout>
  );
}
