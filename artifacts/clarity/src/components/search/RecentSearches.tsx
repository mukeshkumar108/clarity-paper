import React from "react";
import { Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchSessionSummary } from "@/lib/search-types";

const CONFIDENCE_DOTS: Record<string, string> = {
  strong: "bg-forest-green-action",
  moderate: "bg-goldenrod-accent",
  promising: "bg-onyx-outline/70",
  preliminary: "bg-muted-stone/50",
};

interface RecentSearchesProps {
  sessions: SearchSessionSummary[];
  onSelect: (sessionId: number) => void;
  isLoading: boolean;
}

export function RecentSearches({ sessions, onSelect, isLoading }: RecentSearchesProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 rounded-xl bg-pebble-gray/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone flex items-center gap-2">
        <Clock className="w-3.5 h-3.5" /> Recent searches
      </p>
      <div className="space-y-1.5">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelect(session.id)}
            className="group w-full text-left flex items-center gap-3 rounded-xl border border-pebble-gray/60 bg-white/50 px-4 py-2.5 hover:border-onyx-outline/40 hover:bg-white transition-all"
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                CONFIDENCE_DOTS[session.confidence] ?? "bg-muted-stone/40",
              )}
            />
            <span className="text-[13px] text-deep-shadow/75 group-hover:text-deep-shadow transition-colors truncate flex-1 leading-snug">
              {session.query}
            </span>
            <span className="text-[11px] text-muted-stone/60 shrink-0">
              {new Date(session.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
            <ChevronRight className="w-4 h-4 text-muted-stone/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ))}
      </div>
    </div>
  );
}
