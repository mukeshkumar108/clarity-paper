import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  Loader2,
} from "lucide-react";
import type { RankedPaper, EvidenceBucket, StudyDesign, PopulationType } from "@/lib/search-types";
import { customFetch } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BUCKET_CONFIG: Record<
  EvidenceBucket,
  { label: string; classes: string }
> = {
  strongest: {
    label: "Strong evidence",
    classes: "bg-forest-green-action/8 text-forest-green-action border-forest-green-action/25",
  },
  human_observational: {
    label: "Human observational",
    classes: "bg-goldenrod-accent/8 text-goldenrod-accent border-goldenrod-accent/25",
  },
  mechanistic: {
    label: "Mechanistic / animal",
    classes: "bg-onyx-outline/6 text-onyx-outline border-onyx-outline/20",
  },
  background: {
    label: "Background",
    classes: "bg-pebble-gray/60 text-muted-stone border-pebble-gray",
  },
  conflicting: {
    label: "Conflicting findings",
    classes: "bg-red-50 text-red-600 border-red-200",
  },
};

const DESIGN_LABELS: Record<StudyDesign, string> = {
  meta_analysis: "Meta-analysis",
  systematic_review: "Systematic review",
  rct: "RCT",
  cohort: "Cohort",
  cross_sectional: "Cross-sectional",
  case_report: "Case report",
  editorial: "Editorial",
  unknown: "Study",
};

const POPULATION_LABELS: Record<PopulationType, string> = {
  human: "Human",
  animal: "Animal",
  in_vitro: "In vitro",
  unknown: "",
};

interface PaperCardProps {
  paper: RankedPaper;
  index: number;
  displayGroup: "start" | "background" | "early" | "messy";
  /** Whether to show framing copy (eyebrow + whyItMatters). Only true for first 1-2 papers. */
  showFraming?: boolean;
}

const GROUP_INTRO: Record<
  PaperCardProps["displayGroup"],
  { eyebrow: string; whyItMatters: string }
> = {
  start: {
    eyebrow: "Good place to start",
    whyItMatters: "This looks like one of the clearest papers to open first if you want the main signal quickly.",
  },
  background: {
    eyebrow: "Helpful context",
    whyItMatters: "This adds useful context once you have the basic shape of the evidence in view.",
  },
  early: {
    eyebrow: "Early or side-path signal",
    whyItMatters: "This is better for plausibility, mechanism, or adjacent angles than for a clean first answer.",
  },
  messy: {
    eyebrow: "Worth opening for the tension",
    whyItMatters: "This is where the story gets less tidy, which often makes it one of the more interesting papers to inspect.",
  },
};

export function PaperCard({ paper, index, displayGroup, showFraming = false }: PaperCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const bucketConfig = BUCKET_CONFIG[paper.evidenceBucket];
  const designLabel = DESIGN_LABELS[paper.studyDesign];
  const popLabel = POPULATION_LABELS[paper.populationType];
  const intro = GROUP_INTRO[displayGroup];

  const authorDisplay =
    paper.authors.length > 0
      ? paper.authors.slice(0, 3).join(", ") +
        (paper.authors.length > 3 ? " et al." : "")
      : null;

  async function handleAnalyse() {
    setAnalysing(true);
    try {
      const result = await customFetch<{ documentId: number }>(
        "/api/search/analyse-paper",
        {
          method: "POST",
          body: JSON.stringify({
            doi: paper.doi,
            title: paper.title,
            abstract: paper.abstract,
            authors: paper.authors,
            year: paper.year,
          }),
        },
      );
      navigate(`/documents/${result.documentId}`);
    } catch (err) {
      toast({
        title: "Couldn't create document",
        description: "Please try again.",
        variant: "destructive",
      });
      setAnalysing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-pebble-gray bg-white/82 shadow-subtle overflow-hidden">
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 space-y-1">
            {showFraming ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-medium text-muted-stone/60 w-5">
                  {index + 1}
                </span>
                <span className="text-[11px] font-medium text-muted-stone">
                  {intro.eyebrow}
                </span>
              </div>
            ) : (
              <span className="text-[11px] font-medium text-muted-stone/60 w-5">
                {index + 1}
              </span>
            )}
            <span
              className={cn(
                "inline-flex text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded border w-fit",
                bucketConfig.classes,
              )}
            >
              {bucketConfig.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-stone shrink-0">
            {popLabel && (
              <span className="px-1.5 py-0.5 rounded bg-pebble-gray/60 border border-pebble-gray">
                {popLabel}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-pebble-gray/60 border border-pebble-gray">
              {designLabel}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-semibold text-deep-shadow leading-snug mb-1.5">
          {paper.title}
        </h3>

        {/* Authors + year */}
        {(authorDisplay || paper.year) && (
          <p className="text-[12px] text-muted-stone mb-3">
            {[authorDisplay, paper.year].filter(Boolean).join(" · ")}
          </p>
        )}

        {showFraming && (
          <p className="text-[13px] text-muted-stone leading-relaxed mb-2">
            {intro.whyItMatters}
          </p>
        )}

        {/* Plain summary */}
        <p className="text-[14px] text-inkwell/80 leading-relaxed mb-4">
          {paper.plainSummary}
        </p>

        {/* Action row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92 h-8"
            onClick={handleAnalyse}
            disabled={analysing}
          >
            {analysing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BookOpen className="w-3.5 h-3.5" />
            )}
            {analysing ? "Opening…" : "Analyse this paper"}
          </Button>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[12px] text-muted-stone hover:text-deep-shadow flex items-center gap-1 transition-colors px-2 py-1.5"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" /> Hide abstract
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" /> Read abstract
              </>
            )}
          </button>

          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-muted-stone hover:text-deep-shadow flex items-center gap-1 transition-colors px-2 py-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View source
            </a>
          )}
        </div>
      </div>

      {/* Expanded abstract */}
      {expanded && (
        <div className="px-5 pb-5 pt-0 border-t border-pebble-gray/60 mt-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone pt-4">
            Abstract
          </p>
          <p className="text-[13px] text-deep-shadow/80 leading-[1.75] mt-3">
            {paper.abstract}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-stone/70">
            {paper.sources.map((s) => (
              <span key={s}>
                Source: {s === "semantic_scholar"
                  ? "Semantic Scholar"
                  : s === "openalex"
                    ? "OpenAlex"
                    : s === "europe_pmc"
                      ? "Europe PMC"
                      : "CORE"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
