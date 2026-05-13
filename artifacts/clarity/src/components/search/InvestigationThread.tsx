import React, { useRef, useEffect } from "react";
import { TurnV1Component, TurnV1, PaperV1, ContradictionV1 } from "./TurnV1";
import { MainRefineInput } from "./MainRefineInput";

interface InvestigationThreadProps {
  turns: TurnV1[];
  papers: PaperV1[];
  isExploring: boolean;
  onPaperClick: (paperId: string) => void;
  onContradictionClick: (contradictionId: string) => void;
  onSuggestedPath: (path: string) => void;
  onSubmit: (content: string) => void;
}

export function InvestigationThread({
  turns,
  papers,
  isExploring,
  onPaperClick,
  onContradictionClick,
  onSuggestedPath,
  onSubmit
}: InvestigationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, isExploring]);

  return (
    <div className="flex flex-col h-full">
      {/* Thread content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {turns.map((turn, index) => (
          <TurnV1Component
            key={turn.id}
            turn={turn}
            papers={papers}
            onPaperClick={onPaperClick}
            onContradictionClick={onContradictionClick}
            onSuggestedPath={onSuggestedPath}
            isLatest={index === turns.length - 1}
          />
        ))}
        
        {/* Exploring indicator */}
        {isExploring && (
          <div className="flex gap-3 opacity-70">
            <div className="shrink-0 w-8 h-8 rounded-full bg-canvas-parchment border border-pebble-gray flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-onyx-outline/30 animate-pulse" />
            </div>
            <div className="flex-1">
              <div className="bg-white/50 border border-pebble-gray/50 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-2 text-[14px] text-muted-stone">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-onyx-outline/40 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-onyx-outline"></span>
                  </span>
                  Exploring evidence...
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-pebble-gray/30 px-4 py-4 bg-white/50">
        <MainRefineInput
          onSubmit={onSubmit}
          isSubmitting={isExploring}
          placeholder="Ask about dosage, timing, contradictions..."
        />
      </div>
    </div>
  );
}
