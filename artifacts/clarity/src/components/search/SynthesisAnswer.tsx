import React from "react";
import { cn } from "@/lib/utils";
import type { EvidenceSnapshot } from "@/lib/search-types";
import { AlertTriangle, CheckCircle2, Info, TrendingUp, FileText } from "lucide-react";

const CONFIDENCE_CONFIG: Record<
  string,
  { label: string; classes: string; icon: React.ElementType }
> = {
  strong: {
    label: "Strong evidence",
    classes: "bg-forest-green-action/8 border-forest-green-action/30 text-forest-green-action",
    icon: CheckCircle2,
  },
  moderate: {
    label: "Moderate evidence",
    classes: "bg-goldenrod-accent/8 border-goldenrod-accent/30 text-goldenrod-accent",
    icon: TrendingUp,
  },
  promising: {
    label: "Promising but early",
    classes: "bg-onyx-outline/6 border-onyx-outline/25 text-onyx-outline",
    icon: Info,
  },
  preliminary: {
    label: "Preliminary only",
    classes: "bg-pebble-gray/60 border-pebble-gray text-muted-stone",
    icon: AlertTriangle,
  },
};

interface SynthesisAnswerProps {
  synthesisText: string;
  confidence: string;
  noEvidence: boolean;
  query: string;
  coverageNote?: "abstracts_only" | "partial_full_text" | "full_text";
  label?: string;
}

export function SynthesisAnswer({
  synthesisText,
  confidence,
  noEvidence,
  query,
  coverageNote = "abstracts_only",
  label = "First read",
}: SynthesisAnswerProps) {
  const config =
    CONFIDENCE_CONFIG[confidence] ?? CONFIDENCE_CONFIG["preliminary"];
  const Icon = config.icon;

  return (
    <div className="space-y-4">
      {/* Section label — makes clear this is an orientation, not a verdict */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone/60">
          {label}
        </span>
      </div>

      {noEvidence && (
        <div className="flex items-start gap-3 rounded-xl border border-goldenrod-accent/30 bg-goldenrod-accent/5 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-goldenrod-accent mt-0.5 shrink-0" />
          <p className="text-[13px] text-goldenrod-accent leading-relaxed">
            We found only limited strong human evidence on this exact question, so this readout is more exploratory than settled.
          </p>
        </div>
      )}

      <div className="prose prose-sm max-w-none">
        <p className="text-[16px] leading-[1.8] text-deep-shadow font-normal">
          {synthesisText}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em]",
            config.classes,
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          {config.label}
        </div>

        {/* P4: Abstract-only coverage notice */}
        {coverageNote === "abstracts_only" && (
          <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-stone/70">
            <FileText className="w-3 h-3" />
            <span>Based on paper abstracts · full texts not reviewed yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
