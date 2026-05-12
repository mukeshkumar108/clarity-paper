import React from "react";
import type { EvidenceSnapshot as EvidenceSnapshotType, EvidenceSpan } from "@/lib/search-types";
import { EvidenceSnapshot } from "./EvidenceSnapshot";
import { EvidencePanel } from "./EvidencePanel";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";

interface CompactEvidenceProps {
  snapshot: EvidenceSnapshotType;
  spans: EvidenceSpan[];
  coverageNote?: "abstracts_only" | "partial_full_text" | "full_text";
  isExpanded: boolean;
  onToggle: () => void;
}

export function CompactEvidence({ snapshot, spans, coverageNote = "abstracts_only", isExpanded, onToggle }: CompactEvidenceProps) {
  return (
    <div className="mt-4 pt-4 border-t border-pebble-gray/30">
      {/* Evidence line */}
      <div className="flex items-center gap-2 text-[12px] text-muted-stone mb-2">
        <FileText className="w-3.5 h-3.5" />
        <span>
          Based on {snapshot.totalPapers} papers ({snapshot.metaAnalyses} meta-analyses, {snapshot.rcts} RCTs)
        </span>
        {coverageNote === "abstracts_only" && (
          <span className="text-muted-stone/60">· abstracts only</span>
        )}
      </div>

      {/* Toggle for claim-level provenance */}
      {spans.length > 0 && (
        <div>
          <button
            onClick={onToggle}
            className="text-[12px] text-onyx-outline hover:text-deep-shadow flex items-center gap-1 transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Hide claim details
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Show claims & evidence
              </>
            )}
          </button>

          {isExpanded && (
            <div className="mt-3">
              <EvidencePanel spans={spans} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
