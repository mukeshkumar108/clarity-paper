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
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone">
          Where to go next
        </p>
        <p className="text-[13px] text-muted-stone leading-relaxed">
          You could take this in a few directions.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className="group rounded-full border border-pebble-gray/60 bg-transparent px-4 py-2 hover:border-onyx-outline/40 hover:bg-onyx-outline/5 transition-all"
          >
            <span className="text-[13px] text-deep-shadow/80 group-hover:text-deep-shadow transition-colors leading-snug">
              {option}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
