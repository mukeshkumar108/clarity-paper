import React, { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { ChatCanvas } from "@/components/search/ChatCanvas";
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
      <div className="max-w-full lg:max-w-6xl mx-auto h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 mb-6 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-onyx-outline/8 flex items-center justify-center shrink-0">
            <Microscope className="w-5 h-5 text-onyx-outline" />
          </div>
          <div className="space-y-1 min-w-0">
            <h1 className="text-[20px] font-semibold tracking-tight text-deep-shadow leading-tight">
              {data?.query ?? "Exploration session"}
            </h1>
            <p className="text-[12px] text-muted-stone leading-relaxed">
              Ask questions and explore the evidence
            </p>
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
          <div className="flex-1 overflow-y-auto pb-6">
            <ChatCanvas
              result={data}
              messages={data.messages}
              onFollowUp={handleFollowUp}
              onRefine={handleRefine}
              isRefining={appendMessage.isPending}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
