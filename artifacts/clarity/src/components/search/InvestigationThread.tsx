import React, { useRef, useEffect } from "react";
import { TurnV1Component, TurnV1, PaperV1, ContradictionV1 } from "./TurnV1";
import { MainRefineInput } from "./MainRefineInput";

interface InvestigationThreadProps {
  turns: TurnV1[];
  papers: PaperV1[];
  isExploring: boolean;
  activePaperId?: string | null;
  onPaperClick: (paperId: string) => void;
  onContradictionClick: (contradictionId: string) => void;
  onSuggestedPath: (path: string) => void;
  onSubmit: (content: string) => void;
}

export function InvestigationThread({
  turns,
  papers,
  isExploring,
  activePaperId,
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
      {/* Thread content - editorial spacing */}
      <div className="flex-1 overflow-y-auto px-8 py-8 space-y-2">
        {turns.map((turn, index) => (
          <TurnV1Component
            key={turn.id}
            turn={turn}
            papers={papers}
            activePaperId={activePaperId}
            onPaperClick={onPaperClick}
            onContradictionClick={onContradictionClick}
            onSuggestedPath={onSuggestedPath}
            isLatest={index === turns.length - 1}
          />
        ))}
        
        {/* Exploring indicator - calm, minimal */}
        {isExploring && (
          <div className="flex gap-3 py-6 opacity-60">
            <div className="shrink-0 w-6 h-6 rounded-full bg-pebble-gray/20 flex items-center justify-center mt-0.5">
              <div className="w-2 h-2 rounded-full bg-onyx-outline/40 animate-pulse" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-[13px] text-muted-stone italic">
                Exploring evidence...
              </p>
            </div>
          </div>
        )}
        
        <div ref={bottomRef} className="h-4" />
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
