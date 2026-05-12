import React from "react";
import type { EvidenceSnapshot as EvidenceSnapshotType, EvidenceSpan } from "@/lib/search-types";
import { EvidenceSnapshot } from "./EvidenceSnapshot";
import { EvidencePanel } from "./EvidencePanel";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";

interface EvidenceBehindReadProps {
  snapshot: EvidenceSnapshotType;
  spans: EvidenceSpan[];
  coverageNote?: "abstracts_only" | "partial_full_text" | "full_text";
}

export function EvidenceBehindRead({ snapshot, spans, coverageNote = "abstracts_only" }: EvidenceBehindReadProps) {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div className="rounded-2xl border border-pebble-gray/70 bg-white/50 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-onyx-outline/8 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-onyx-outline" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-deep-shadow">
            Evidence behind this read
          </h3>
          <p className="text-[12px] text-muted-stone leading-relaxed mt-1">
            We checked this first read against {snapshot.totalPapers} paper{snapshot.totalPapers !== 1 ? "s" : ""}.
            {coverageNote === "abstracts_only" && (
              <>
                {" "}This is a curated starting set, not a full literature sweep.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Evidence counts */}
      <EvidenceSnapshot snapshot={snapshot} />

      {/* Toggle for claim-level provenance */}
      {spans.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="group w-full flex items-center justify-between gap-3 rounded-xl border border-pebble-gray/70 bg-white/60 px-4 py-3 hover:bg-white transition-colors text-left"
          >
            <div>
              <p className="text-[13px] font-medium text-deep-shadow">
                {showDetails ? "Hide claim-level details" : "Inspect the claims"}
              </p>
              <p className="text-[11px] text-muted-stone mt-0.5">
                Open this when you want to see the abstract passages behind the main claims.
              </p>
            </div>
            <span className="text-muted-stone shrink-0">
              {showDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {showDetails && (
            <div className="mt-3 pt-3 border-t border-pebble-gray/50">
              <EvidencePanel spans={spans} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
