import React from "react";
import { Layers } from "lucide-react";

export type EvidenceFilter = "all" | "rct_meta" | "human_only";

interface FilterChipsProps {
  active: EvidenceFilter;
  onChange: (filter: EvidenceFilter) => void;
}

const FILTERS: Array<{ id: EvidenceFilter; label: string }> = [
  { id: "all", label: "All evidence" },
  { id: "rct_meta", label: "RCTs & meta-analyses" },
  { id: "human_only", label: "Human only" },
];

export function FilterChips({ active, onChange }: FilterChipsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Layers className="w-3 h-3 text-muted-stone/60 shrink-0" />
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
            active === f.id
              ? "bg-onyx-outline text-white"
              : "bg-pebble-gray/40 text-muted-stone hover:text-deep-shadow hover:bg-pebble-gray/60"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
