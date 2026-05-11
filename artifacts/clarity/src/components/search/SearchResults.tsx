import React from "react";
import type { SearchResult, RankedPaper } from "@/lib/search-types";
import { SynthesisAnswer } from "./SynthesisAnswer";
import { SynthesisSkeleton } from "./SynthesisSkeleton";
import { EvidenceSnapshot } from "./EvidenceSnapshot";
import { EvidencePanel } from "./EvidencePanel";
import { PaperCard } from "./PaperCard";
import { FollowUpOptions } from "./FollowUpOptions";

type DisplayGroup = "start" | "background" | "early" | "messy";

const DISPLAY_GROUPS: Array<{
  key: DisplayGroup;
  title: string;
  description: string;
}> = [
  {
    key: "start",
    title: "Where I'd start",
    description: "The clearest papers for getting oriented quickly.",
  },
  {
    key: "background",
    title: "Useful background",
    description: "Helpful supporting context once you have the basic shape of the evidence.",
  },
  {
    key: "early",
    title: "Early or adjacent",
    description: "Signals that add plausibility or side paths, but are not the main place to lean first.",
  },
  {
    key: "messy",
    title: "Where the story gets messy",
    description: "Papers worth opening when the signal is mixed or less clean than it first appears.",
  },
];

function groupPapersForDisplay(papers: RankedPaper[]): Map<DisplayGroup, RankedPaper[]> {
  const strongest = papers.filter((p) => p.evidenceBucket === "strongest");
  const observational = papers.filter((p) => p.evidenceBucket === "human_observational");
  const background = papers.filter((p) => p.evidenceBucket === "background");
  const mechanistic = papers.filter((p) => p.evidenceBucket === "mechanistic");
  const conflicting = papers.filter((p) => p.evidenceBucket === "conflicting");

  const start = [...strongest];
  const startIds = new Set(start.map((paper) => paper.externalId));

  for (const paper of observational) {
    if (start.length >= 4) break;
    if (startIds.has(paper.externalId)) continue;
    start.push(paper);
    startIds.add(paper.externalId);
  }

  const usefulBackground = observational.filter((paper) => !startIds.has(paper.externalId));

  return new Map<DisplayGroup, RankedPaper[]>([
    ["start", start],
    ["background", [...usefulBackground, ...background]],
    ["early", mechanistic],
    ["messy", conflicting],
  ]);
}

interface SearchResultsProps {
  result: SearchResult;
  onFollowUp: (query: string) => void;
  /** When true, papers are shown but synthesis is still loading — show skeleton */
  synthesisLoading?: boolean;
}

export function SearchResults({ result, onFollowUp, synthesisLoading = false }: SearchResultsProps) {
  const grouped = groupPapersForDisplay(result.papers);
  let globalIndex = 0;

  return (
    <div className="space-y-10">
      {/* Synthesis — skeleton while loading, real content once ready */}
      <section>
        {synthesisLoading ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-pebble-gray/70 bg-fog-white px-4 py-3">
              <p className="text-[13px] text-muted-stone leading-relaxed">
                We&apos;ve found some promising papers. Your first read is still coming together.
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

            {result.followUpOptions.length > 0 && (
              <FollowUpOptions
                options={result.followUpOptions}
                onSelect={onFollowUp}
              />
            )}
          </div>
        )}
      </section>

      {/* Paper cards grouped by usefulness for exploration */}
      {result.papers.length > 0 && (
        <section className="space-y-8">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
              Paper pathways
            </p>
            <p className="text-[13px] text-muted-stone leading-relaxed">
              These are a curated few papers to help you get oriented, not an exhaustive literature review.
            </p>
          </div>

          {DISPLAY_GROUPS.map((group) => {
            const papers = grouped.get(group.key);
            if (!papers) return null;
            if (papers.length === 0) return null;
            return (
              <div key={group.key} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                    {group.title}
                  </h3>
                  <div className="flex-1 h-px bg-pebble-gray" />
                  <span className="text-[11px] text-muted-stone/60">
                    {papers.length} paper{papers.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-[13px] text-muted-stone leading-relaxed -mt-1">
                  {group.description}
                </p>
                <div className="space-y-4">
                  {papers.map((paper) => {
                    const idx = globalIndex++;
                    return (
                      <PaperCard
                        key={paper.externalId}
                        paper={paper}
                        index={idx}
                        displayGroup={group.key}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {result.papers.length > 0 && (
        <section>
          <EvidenceSnapshot snapshot={result.evidenceSnapshot} />
        </section>
      )}

      {/* Evidence panel — only shown once synthesis (and spans) are ready */}
      {!synthesisLoading && result.evidenceSpans && result.evidenceSpans.length > 0 && (
        <section>
          <details className="group rounded-2xl border border-pebble-gray/70 bg-white/45 p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                    Evidence beneath the first read
                  </p>
                  <p className="text-[13px] text-muted-stone leading-relaxed mt-1">
                    Open this when you want to inspect the abstract passages supporting each claim.
                  </p>
                </div>
                <span className="text-[12px] text-muted-stone group-open:hidden">
                  Show
                </span>
                <span className="text-[12px] text-muted-stone hidden group-open:inline">
                  Hide
                </span>
              </div>
            </summary>
            <div className="pt-4">
              <EvidencePanel spans={result.evidenceSpans} />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
