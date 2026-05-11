import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const STAGES = [
  {
    label: "Understanding your question",
    detail: "Figuring out what you are really asking, and which angles matter most.",
    durationMs: 2500,
  },
  {
    label: "Finding the most relevant papers",
    detail: "Starting with direct human evidence, then widening only if needed.",
    durationMs: 4000,
  },
  {
    label: "Picking the best places to start",
    detail: "Looking for papers that seem most useful for getting oriented quickly.",
    durationMs: 1500,
  },
  {
    label: "Writing your first read",
    detail: "Pulling the story together in plain English while keeping the papers underneath.",
    durationMs: 99999,
  },
];

export function SearchLoadingState() {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    if (stageIdx >= STAGES.length - 1) return;
    const timer = setTimeout(() => setStageIdx((i) => i + 1), STAGES[stageIdx].durationMs);
    return () => clearTimeout(timer);
  }, [stageIdx]);

  const current = STAGES[stageIdx];

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <div className="w-14 h-14 rounded-full border-2 border-pebble-gray flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-onyx-outline animate-spin" />
      </div>

      <div className="space-y-1.5">
        <p className="text-[16px] font-medium text-deep-shadow">{current.label}</p>
        <p className="text-[13px] text-muted-stone max-w-[38ch]">{current.detail}</p>
      </div>

      <div className="flex gap-1.5 mt-1">
        {STAGES.map((s, i) => (
          <div
            key={s.label}
            className={`h-1 rounded-full transition-all duration-500 ${
              i < stageIdx
                ? "w-6 bg-forest-green-action"
                : i === stageIdx
                  ? "w-6 bg-onyx-outline animate-pulse"
                  : "w-2 bg-pebble-gray"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
