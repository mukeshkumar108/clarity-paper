import React from "react";
import { ArrowRight } from "lucide-react";

interface FollowUpOptionsProps {
  options: string[];
  onSelect: (option: string) => void;
}

export function FollowUpOptions({ options, onSelect }: FollowUpOptionsProps) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
        Want to go deeper?
      </p>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className="group w-full text-left flex items-center gap-3 rounded-xl border border-pebble-gray bg-white/60 px-4 py-3 hover:border-onyx-outline/40 hover:bg-white transition-all"
          >
            <ArrowRight className="w-4 h-4 text-muted-stone/50 shrink-0 group-hover:text-onyx-outline group-hover:translate-x-0.5 transition-all" />
            <span className="text-[14px] text-deep-shadow/80 group-hover:text-deep-shadow transition-colors leading-snug">
              {option}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
