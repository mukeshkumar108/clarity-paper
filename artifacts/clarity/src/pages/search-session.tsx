import React, { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { SearchResults } from "@/components/search/SearchResults";
import { CurrentFocusStrip } from "@/components/search/CurrentFocusStrip";
import { ExplorationSidebar } from "@/components/search/ExplorationSidebar";
import { AlertCircle, Microscope } from "lucide-react";
import type { SearchSessionDetail, SearchSessionMessage } from "@/lib/search-types";

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

  const handleSidebarSubmit = useCallback(
    async (content: string) => {
      await appendMessage.mutateAsync(content);
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
      <div className="space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-onyx-outline/8 flex items-center justify-center">
              <Microscope className="w-5 h-5 text-onyx-outline" />
            </div>
            <div className="space-y-1">
              <h1 className="text-[30px] font-semibold tracking-tight text-deep-shadow leading-none">
                {data?.query ?? "Exploration session"}
              </h1>
              <p className="text-[14px] text-muted-stone leading-relaxed">
                A persistent scientific canvas with an attached refinement rail.
              </p>
            </div>
          </div>
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
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6 min-w-0">
              <CurrentFocusStrip session={data} />
              <SearchResults
                result={data}
                onFollowUp={handleSidebarSubmit}
              />
            </div>

            <div className="min-w-0">
              <ExplorationSidebar
                messages={data.messages}
                onSubmit={handleSidebarSubmit}
                isSubmitting={appendMessage.isPending}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
