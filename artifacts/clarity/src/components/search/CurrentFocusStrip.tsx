import React from "react";
import type { SearchSessionDetail } from "@/lib/search-types";

interface CurrentFocusStripProps {
  session: SearchSessionDetail;
}

export function CurrentFocusStrip({ session }: CurrentFocusStripProps) {
  const { focusState } = session;

  return (
    <div className="rounded-2xl border border-pebble-gray/70 bg-white/65 px-5 py-4 space-y-3">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
          Current focus
        </p>
        <p className="text-[14px] text-deep-shadow leading-relaxed">
          {focusState.summary}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {focusState.badges.map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-pebble-gray bg-canvas-parchment/80 px-3 py-1 text-[11px] text-muted-stone"
          >
            {badge}
          </span>
        ))}
      </div>

      {(focusState.lastActionLabel || focusState.lastActionDetail) && (
        <div className="rounded-xl border border-pebble-gray/70 bg-canvas-parchment/70 px-4 py-3 space-y-1">
          {focusState.lastActionLabel && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-stone">
              {focusState.lastActionLabel}
            </p>
          )}
          {focusState.lastActionDetail && (
            <p className="text-[13px] text-muted-stone leading-relaxed">
              {focusState.lastActionDetail}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
