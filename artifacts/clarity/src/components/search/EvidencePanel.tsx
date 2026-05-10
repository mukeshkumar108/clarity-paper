import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { EvidenceSpan, SourceSnippet, SupportType } from "@/lib/search-types";

// P5 taxonomy labels — human-readable, epistemically honest
const SUPPORT_CONFIG: Record<SupportType, { label: string; dotClasses: string; textClasses: string }> = {
  strongly_supported: {
    label: "Strongly supported",
    dotClasses: "bg-forest-green-action",
    textClasses: "text-forest-green-action",
  },
  partially_supported: {
    label: "Partially supported",
    dotClasses: "bg-goldenrod-accent",
    textClasses: "text-goldenrod-accent",
  },
  related_evidence: {
    label: "Related evidence",
    dotClasses: "bg-muted-stone/40",
    textClasses: "text-muted-stone/70",
  },
};

interface SnippetCardProps {
  snippet: SourceSnippet;
}

function SnippetCard({ snippet }: SnippetCardProps) {
  const config = SUPPORT_CONFIG[snippet.supportType];

  return (
    <div className="rounded-xl border border-pebble-gray bg-white/60 p-4 space-y-2">
      {/* Paper attribution */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-deep-shadow leading-snug truncate" title={snippet.paperTitle}>
            {snippet.paperTitle}
          </p>
          {snippet.paperYear && (
            <span className="text-[11px] text-muted-stone">{snippet.paperYear}</span>
          )}
        </div>
        {snippet.doi && (
          <a
            href={`https://doi.org/${snippet.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-stone/60 hover:text-muted-stone transition-colors"
            title="View paper"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Verbatim abstract passage */}
      <blockquote className="border-l-2 border-pebble-gray pl-3 text-[13px] text-deep-shadow/80 leading-[1.65] italic">
        {snippet.text}
      </blockquote>

      {/* Support classification */}
      <div className="flex items-center gap-1.5">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dotClasses)} />
        <span className={cn("text-[11px] font-medium", config.textClasses)}>
          {config.label}
        </span>
      </div>
    </div>
  );
}

interface ClaimRowProps {
  span: EvidenceSpan;
  index: number;
}

function ClaimRow({ span, index }: ClaimRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasEvidence = span.evidence.length > 0;
  const topSupport = span.evidence[0]?.supportType;

  const topConfig = topSupport ? SUPPORT_CONFIG[topSupport] : null;

  return (
    <div className="border border-pebble-gray rounded-2xl bg-white/40 overflow-hidden">
      <button
        onClick={() => hasEvidence && setExpanded(!expanded)}
        className={cn(
          "w-full text-left p-4 flex items-start gap-3 transition-colors",
          hasEvidence ? "hover:bg-pebble-gray/20 cursor-pointer" : "cursor-default",
        )}
        disabled={!hasEvidence}
      >
        {/* Claim index */}
        <span className="text-[11px] text-muted-stone/50 font-mono mt-0.5 w-4 shrink-0">
          {index + 1}
        </span>

        {/* Claim text */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-[14px] text-deep-shadow leading-[1.6]">{span.claimText}</p>

          {/* Evidence summary line */}
          {hasEvidence ? (
            <div className="flex items-center gap-2">
              {topConfig && (
                <div className="flex items-center gap-1">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", topConfig.dotClasses)} />
                  <span className={cn("text-[11px]", topConfig.textClasses)}>
                    {topConfig.label}
                  </span>
                </div>
              )}
              <span className="text-[11px] text-muted-stone/60">
                {span.evidence.length} source{span.evidence.length !== 1 ? "s" : ""}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-stone/50">No matching passages found in abstracts</span>
          )}
        </div>

        {/* Expand toggle */}
        {hasEvidence && (
          <span className="text-muted-stone/40 shrink-0 mt-0.5">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </button>

      {/* Expanded snippets */}
      {expanded && hasEvidence && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-pebble-gray/50">
          <p className="text-[11px] text-muted-stone/60 pt-3 pb-1">
            Supporting passages from retrieved abstracts:
          </p>
          {span.evidence.map((snippet) => (
            <SnippetCard key={snippet.snippetId} snippet={snippet} />
          ))}
        </div>
      )}
    </div>
  );
}

interface EvidencePanelProps {
  spans: EvidenceSpan[];
}

export function EvidencePanel({ spans }: EvidencePanelProps) {
  if (spans.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
          Claim Provenance
        </h3>
        <div className="flex-1 h-px bg-pebble-gray" />
        <span className="text-[11px] text-muted-stone/60">
          Tap any claim to see source passages
        </span>
      </div>

      {/* Claim rows */}
      <div className="space-y-2">
        {spans.map((span, i) => (
          <ClaimRow key={span.claimId} span={span} index={i} />
        ))}
      </div>

      <p className="text-[11px] text-muted-stone/50 pt-1">
        Passages are extracted verbatim from paper abstracts. Support classification is based on keyword alignment — verify with the full paper for authoritative interpretation.
      </p>
    </div>
  );
}
