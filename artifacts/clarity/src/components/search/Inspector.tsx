import React from "react";
import { X, FileText, ExternalLink, Users, Calendar, FlaskConical } from "lucide-react";
import { PaperV1, ContradictionV1 } from "./TurnV1";

interface InspectorProps {
  isOpen: boolean;
  mode: 'paper' | 'contradiction' | null;
  papers: PaperV1[];
  contradictions: ContradictionV1[];
  selectedPaperId: string | null;
  selectedContradictionId: string | null;
  onClose: () => void;
}

export function Inspector({
  isOpen,
  mode,
  papers,
  contradictions,
  selectedPaperId,
  selectedContradictionId,
  onClose
}: InspectorProps) {
  if (!isOpen) return null;

  return (
    <div className="w-[380px] border-l border-pebble-gray/30 bg-white flex flex-col h-full">
      {/* Header - minimal, elegant */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-pebble-gray/20">
        <h3 className="text-[13px] font-medium text-muted-stone uppercase tracking-wider">
          {mode === 'paper' && 'Paper'}
          {mode === 'contradiction' && 'Contradiction'}
          {!mode && 'Inspector'}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-pebble-gray/30 rounded-md transition-colors text-muted-stone hover:text-deep-shadow"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content - editorial spacing */}
      <div className="flex-1 overflow-y-auto p-5">
        {mode === 'paper' && selectedPaperId && (
          <PaperView 
            paper={papers.find(p => p.id === selectedPaperId)!} 
          />
        )}
        
        {mode === 'contradiction' && selectedContradictionId && (
          <ContradictionView 
            contradiction={contradictions.find(c => c.id === selectedContradictionId)!}
          />
        )}
        
        {!mode && (
          <div className="text-center py-16 text-muted-stone/50">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" strokeWidth={1.5} />
            <p className="text-[13px]">Select evidence to inspect</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PaperView({ paper }: { paper: PaperV1 }) {
  if (!paper) return null;

  return (
    <div className="space-y-6">
      {/* Title - editorial prominence */}
      <div>
        <h4 className="text-[17px] font-medium text-deep-shadow leading-[1.5]">
          {paper.title}
        </h4>
        
        {/* Meta - calm, integrated */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted-stone">
          <span>{paper.year}</span>
          <span className="text-pebble-gray">·</span>
          <span className="px-2 py-0.5 rounded-full border border-pebble-gray/40 text-[11px]">
            {paper.studyType}
          </span>
          {paper.sampleSize && (
            <>
              <span className="text-pebble-gray">·</span>
              <span>n={paper.sampleSize}</span>
            </>
          )}
        </div>
      </div>

      {/* Authors - subtle */}
      <div className="text-[13px] text-muted-stone">
        <p>{paper.authors.slice(0, 4).join(', ')}{paper.authors.length > 4 ? ' et al.' : ''}</p>
      </div>

      {/* Abstract - reading experience */}
      <div className="pt-4 border-t border-pebble-gray/20">
        <p className="text-[14px] text-deep-shadow/80 leading-[1.7]">
          {paper.abstract}
        </p>
      </div>

      {/* Actions - minimal */}
      {paper.doi && (
        <div className="pt-2">
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-onyx-outline hover:text-deep-shadow transition-colors underline underline-offset-2 decoration-onyx-outline/30 hover:decoration-onyx-outline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View full paper
          </a>
        </div>
      )}
    </div>
  );
}

function ContradictionView({ contradiction }: { contradiction: ContradictionV1 }) {
  if (!contradiction) return null;

  return (
    <div className="space-y-6">
      {/* Claim - clear framing */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-stone/60 font-medium mb-2">
          Disagreement
        </p>
        <p className="text-[16px] text-deep-shadow leading-[1.5]">
          {contradiction.claim}
        </p>
      </div>

      {/* Paper A - calm, not colored */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-deep-shadow/40" />
          <span className="text-[12px] text-muted-stone">
            {contradiction.paperA.authors[0]} et al., {contradiction.paperA.year}
          </span>
        </div>
        <p className="text-[14px] text-deep-shadow pl-3.5 border-l-2 border-deep-shadow/20">
          {contradiction.findingA}
        </p>
      </div>

      {/* VS - minimal */}
      <div className="py-1">
        <div className="h-px bg-pebble-gray/30" />
      </div>

      {/* Paper B */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-deep-shadow/40" />
          <span className="text-[12px] text-muted-stone">
            {contradiction.paperB.authors[0]} et al., {contradiction.paperB.year}
          </span>
        </div>
        <p className="text-[14px] text-deep-shadow pl-3.5 border-l-2 border-deep-shadow/20">
          {contradiction.findingB}
        </p>
      </div>

      {/* Possible reason - editorial */}
      {contradiction.possibleReason && (
        <div className="pt-4 border-t border-pebble-gray/20">
          <p className="text-[11px] uppercase tracking-wider text-muted-stone/60 font-medium mb-2">
            Possible explanation
          </p>
          <p className="text-[14px] text-deep-shadow/80 leading-[1.6]">
            {contradiction.possibleReason}
          </p>
        </div>
      )}

      {/* Question action - subtle */}
      <div className="pt-2">
        <button className="text-[13px] text-onyx-outline hover:text-deep-shadow transition-colors underline underline-offset-2 decoration-onyx-outline/30 hover:decoration-onyx-outline">
          Ask about this contradiction
        </button>
      </div>
    </div>
  );
}
