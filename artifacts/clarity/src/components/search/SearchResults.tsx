import React from "react";
import type { SearchResult, SearchSessionMessage } from "@/lib/search-types";
import { SynthesisAnswer } from "./SynthesisAnswer";
import { SynthesisSkeleton } from "./SynthesisSkeleton";
import { EvidenceBehindRead } from "./EvidenceBehindRead";
import { FollowUpOptions } from "./FollowUpOptions";
import { MainRefineInput } from "./MainRefineInput";
import { ResearchTrail } from "./ResearchTrail";

interface SearchResultsProps {
  result: SearchResult;
  messages?: SearchSessionMessage[];
  onFollowUp: (query: string) => void;
  onRefine?: (content: string) => Promise<void>;
  isRefining?: boolean;
  /** When true, papers are shown but synthesis is still loading — show skeleton */
  synthesisLoading?: boolean;
}

export function SearchResults({ 
  result, 
  messages = [],
  onFollowUp, 
  onRefine,
  isRefining = false,
  synthesisLoading = false 
}: SearchResultsProps) {
  return (
    <div className="space-y-8">
      {/* 1. First Read / Synthesis */}
      <section>
        {synthesisLoading ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-pebble-gray/70 bg-fog-white px-4 py-3">
              <p className="text-[13px] text-muted-stone leading-relaxed">
                We've found some promising papers. Your first read is still coming together.
              </p>
            </div>
            <SynthesisSkeleton />
          </div>
        ) : (
          <div className="space-y-4">
            <SynthesisAnswer
              synthesisText={result.synthesisText}
              confidence={result.confidence}
              noEvidence={result.noEvidence}
              query={result.query}
              coverageNote={result.coverageNote}
            />
          </div>
        )}
      </section>

      {/* 2. Evidence behind this read */}
      {!synthesisLoading && (
        <section>
          <EvidenceBehindRead 
            snapshot={result.evidenceSnapshot} 
            spans={result.evidenceSpans}
            coverageNote={result.coverageNote}
          />
        </section>
      )}

      {/* 3. Follow-up question chips */}
      {!synthesisLoading && result.followUpOptions.length > 0 && (
        <section>
          <FollowUpOptions
            options={result.followUpOptions}
            onSelect={onFollowUp}
          />
        </section>
      )}

      {/* 4. Main ask/refine input */}
      {!synthesisLoading && onRefine && (
        <section>
          <MainRefineInput 
            onSubmit={onRefine}
            isSubmitting={isRefining}
          />
        </section>
      )}

      {/* 5. Exploration trail / history */}
      {!synthesisLoading && messages.length > 0 && (
        <section>
          <ResearchTrail 
            messages={messages} 
            originalQuery={result.query}
          />
        </section>
      )}
    </div>
  );
}
