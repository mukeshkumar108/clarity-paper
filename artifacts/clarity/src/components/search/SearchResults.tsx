import React from "react";
import type { SearchResult, EvidenceBucket, RankedPaper } from "@/lib/search-types";
import { SynthesisAnswer } from "./SynthesisAnswer";
import { SynthesisSkeleton } from "./SynthesisSkeleton";
import { EvidenceSnapshot } from "./EvidenceSnapshot";
import { EvidencePanel } from "./EvidencePanel";
import { PaperCard } from "./PaperCard";
import { FollowUpOptions } from "./FollowUpOptions";

const BUCKET_ORDER: EvidenceBucket[] = [
  "strongest",
  "human_observational",
  "conflicting",
  "mechanistic",
  "background",
];

const BUCKET_HEADINGS: Record<EvidenceBucket, string> = {
  strongest: "Strongest Evidence",
  human_observational: "Human Evidence",
  conflicting: "Conflicting Findings",
  mechanistic: "Mechanistic & Animal Evidence",
  background: "Background & Context",
};

function groupByBucket(papers: RankedPaper[]): Map<EvidenceBucket, RankedPaper[]> {
  const grouped = new Map<EvidenceBucket, RankedPaper[]>();
  for (const bucket of BUCKET_ORDER) {
    const inBucket = papers.filter((p) => p.evidenceBucket === bucket);
    if (inBucket.length > 0) {
      grouped.set(bucket, inBucket);
    }
  }
  return grouped;
}

interface SearchResultsProps {
  result: SearchResult;
  onFollowUp: (query: string) => void;
  /** When true, papers are shown but synthesis is still loading — show skeleton */
  synthesisLoading?: boolean;
}

export function SearchResults({ result, onFollowUp, synthesisLoading = false }: SearchResultsProps) {
  const grouped = groupByBucket(result.papers);
  let globalIndex = 0;

  return (
    <div className="space-y-10">
      {/* Evidence snapshot — leads with what was found, not what the AI says */}
      {result.papers.length > 0 && (
        <section>
          <EvidenceSnapshot snapshot={result.evidenceSnapshot} />
        </section>
      )}

      {/* Synthesis — skeleton while loading, real content once ready */}
      <section>
        {synthesisLoading ? (
          <SynthesisSkeleton />
        ) : (
          <SynthesisAnswer
            synthesisText={result.synthesisText}
            confidence={result.confidence}
            noEvidence={result.noEvidence}
            query={result.query}
            coverageNote={result.coverageNote}
          />
        )}
      </section>

      {/* Evidence panel — only shown once synthesis (and spans) are ready */}
      {!synthesisLoading && result.evidenceSpans && result.evidenceSpans.length > 0 && (
        <section>
          <EvidencePanel spans={result.evidenceSpans} />
        </section>
      )}

      {/* Paper cards grouped by evidence bucket */}
      {result.papers.length > 0 && (
        <section className="space-y-8">
          {BUCKET_ORDER.map((bucket) => {
            const papers = grouped.get(bucket);
            if (!papers) return null;
            return (
              <div key={bucket} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                    {BUCKET_HEADINGS[bucket]}
                  </h3>
                  <div className="flex-1 h-px bg-pebble-gray" />
                  <span className="text-[11px] text-muted-stone/60">
                    {papers.length} paper{papers.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-4">
                  {papers.map((paper) => {
                    const idx = globalIndex++;
                    return (
                      <PaperCard
                        key={paper.externalId}
                        paper={paper}
                        index={idx}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Follow-up options — only shown when synthesis is complete */}
      {!synthesisLoading && result.followUpOptions.length > 0 && (
        <section>
          <FollowUpOptions
            options={result.followUpOptions}
            onSelect={onFollowUp}
          />
        </section>
      )}
    </div>
  );
}
