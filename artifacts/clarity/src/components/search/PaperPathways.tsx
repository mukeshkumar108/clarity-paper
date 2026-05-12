import React, { useState } from "react";
import type { RankedPaper } from "@/lib/search-types";
import { PaperCard } from "./PaperCard";
import { ChevronDown, ChevronUp } from "lucide-react";

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

interface PaperPathwaysProps {
  papers: RankedPaper[];
}

export function PaperPathways({ papers }: PaperPathwaysProps) {
  const grouped = groupPapersForDisplay(papers);
  const [showAllPapers, setShowAllPapers] = useState(false);
  let globalIndex = 0;

  // Get first 2-3 papers from "start" group only
  const startPapers = grouped.get("start") || [];
  const initialPaperCount = Math.min(3, startPapers.length);
  const hasMorePapers = papers.length > initialPaperCount;

  if (papers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
          Paper pathways
        </p>
        <p className="text-[13px] text-muted-stone leading-relaxed">
          {papers.length} paper{papers.length !== 1 ? "s" : ""} to explore
        </p>
      </div>

      {/* Show initial papers or all papers based on state */}
      {showAllPapers ? (
        // Show all papers grouped
        DISPLAY_GROUPS.map((group) => {
          const groupPapers = grouped.get(group.key);
          if (!groupPapers) return null;
          if (groupPapers.length === 0) return null;
          return (
            <div key={group.key} className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
                  {group.title}
                </h3>
                <div className="flex-1 h-px bg-pebble-gray" />
                <span className="text-[11px] text-muted-stone/60">
                  {groupPapers.length} paper{groupPapers.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-[13px] text-muted-stone leading-relaxed -mt-1">
                {group.description}
              </p>
              <div className="space-y-4">
                {groupPapers.map((paper) => {
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
        })
      ) : (
        // Show only first 2-3 "start" papers
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
              Where I'd start
            </h3>
            <div className="flex-1 h-px bg-pebble-gray" />
            <span className="text-[11px] text-muted-stone/60">
              {startPapers.length} paper{startPapers.length !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-[13px] text-muted-stone leading-relaxed -mt-1">
            The clearest papers for getting oriented quickly.
          </p>
          <div className="space-y-4">
            {startPapers.slice(0, initialPaperCount).map((paper) => {
              const idx = globalIndex++;
              return (
                <PaperCard
                  key={paper.externalId}
                  paper={paper}
                  index={idx}
                  displayGroup="start"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Show more papers button */}
      {hasMorePapers && !showAllPapers && (
        <button
          onClick={() => setShowAllPapers(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-pebble-gray/70 bg-white/60 px-4 py-3 hover:bg-white transition-colors text-[13px] font-medium text-deep-shadow"
        >
          <ChevronDown className="w-4 h-4" />
          Show {papers.length - initialPaperCount} more paper{papers.length - initialPaperCount !== 1 ? "s" : ""}
        </button>
      )}

      {/* Show less button when expanded */}
      {showAllPapers && hasMorePapers && (
        <button
          onClick={() => setShowAllPapers(false)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-pebble-gray/70 bg-white/60 px-4 py-3 hover:bg-white transition-colors text-[13px] font-medium text-deep-shadow"
        >
          <ChevronUp className="w-4 h-4" />
          Show fewer papers
        </button>
      )}
    </div>
  );
}
