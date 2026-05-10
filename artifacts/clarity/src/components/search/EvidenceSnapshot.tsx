import React from "react";
import { cn } from "@/lib/utils";
import type { EvidenceSnapshot as EvidenceSnapshotType } from "@/lib/search-types";

interface EvidenceSnapshotProps {
  snapshot: EvidenceSnapshotType;
}

interface BucketRowProps {
  label: string;
  count: number;
  description: string;
  colorClass: string;
}

function BucketRow({ label, count, description, colorClass }: BucketRowProps) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-pebble-gray/60 last:border-0">
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-semibold shrink-0",
          colorClass,
        )}
      >
        {count}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-deep-shadow leading-tight">{label}</p>
        <p className="text-[12px] text-muted-stone leading-tight mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function EvidenceSnapshot({ snapshot }: EvidenceSnapshotProps) {
  return (
    <div className="rounded-xl border border-pebble-gray bg-white/60 p-4 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone mb-3">
        Evidence retrieved
      </p>

      <BucketRow
        label="Meta-analyses & systematic reviews"
        count={snapshot.metaAnalyses}
        description="Strongest signal — aggregates across multiple studies"
        colorClass="bg-forest-green-action/10 text-forest-green-action"
      />
      <BucketRow
        label="Human RCTs"
        count={snapshot.rcts}
        description="Randomized controlled trials with human participants"
        colorClass="bg-forest-green-action/6 text-forest-green-action"
      />
      <BucketRow
        label="Human observational studies"
        count={snapshot.humanObservational}
        description="Cohort, cross-sectional, and similar human evidence"
        colorClass="bg-goldenrod-accent/10 text-goldenrod-accent"
      />
      <BucketRow
        label="Mechanistic & animal evidence"
        count={snapshot.mechanistic}
        description="Animal studies or cell-level research — suggests plausibility, not proof in humans"
        colorClass="bg-onyx-outline/8 text-onyx-outline"
      />
      <BucketRow
        label="Conflicting findings"
        count={snapshot.conflicting}
        description="Studies that showed no effect or contradict the main signal"
        colorClass="bg-pebble-gray text-muted-stone"
      />

      <div className="pt-3 border-t border-pebble-gray/60 mt-2">
        <p className="text-[12px] text-muted-stone">
          {snapshot.totalPapers} paper{snapshot.totalPapers !== 1 ? "s" : ""} reviewed
        </p>
      </div>
    </div>
  );
}
