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
  if (!isOpen) {
    return (
      <button
        onClick={() => {}}
        className="absolute right-4 top-20 bg-white border border-pebble-gray/70 rounded-lg px-3 py-2 text-[13px] text-muted-stone hover:text-deep-shadow shadow-subtle"
      >
        Open inspector
      </button>
    );
  }

  return (
    <div className="w-[400px] border-l border-pebble-gray/50 bg-white/80 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pebble-gray/50">
        <h3 className="text-[14px] font-semibold text-deep-shadow">
          {mode === 'paper' && 'Paper'}
          {mode === 'contradiction' && 'Contradiction'}
          {!mode && 'Inspector'}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-pebble-gray/50 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-muted-stone" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
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
          <div className="text-center py-12 text-muted-stone">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">Select a paper or contradiction<br/>to inspect</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PaperView({ paper }: { paper: PaperV1 }) {
  if (!paper) return null;

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h4 className="text-[16px] font-semibold text-deep-shadow leading-snug">
          {paper.title}
        </h4>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-stone">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {paper.year}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-pebble-gray/50">
            {paper.studyType}
          </span>
          {paper.sampleSize && (
            <span>n={paper.sampleSize}</span>
          )}
        </div>
      </div>

      {/* Authors */}
      <div className="flex items-start gap-2 text-[13px] text-muted-stone">
        <Users className="w-4 h-4 mt-0.5 shrink-0" />
        <p>{paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 ? ' et al.' : ''}</p>
      </div>

      {/* Abstract */}
      <div className="pt-3 border-t border-pebble-gray/30">
        <h5 className="text-[12px] font-semibold uppercase tracking-wide text-muted-stone mb-2">
          Abstract
        </h5>
        <p className="text-[13px] text-deep-shadow/80 leading-relaxed">
          {paper.abstract}
        </p>
      </div>

      {/* Actions */}
      {paper.doi && (
        <div className="pt-2">
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-onyx-outline hover:text-deep-shadow transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View full text
          </a>
        </div>
      )}
    </div>
  );
}

function ContradictionView({ contradiction }: { contradiction: ContradictionV1 }) {
  if (!contradiction) return null;

  return (
    <div className="space-y-5">
      {/* Claim */}
      <div>
        <h5 className="text-[12px] font-semibold uppercase tracking-wide text-muted-stone mb-2">
          Disagreement on
        </h5>
        <p className="text-[15px] font-medium text-deep-shadow">
          {contradiction.claim}
        </p>
      </div>

      {/* Paper A */}
      <div className="bg-forest-green-action/5 border border-forest-green-action/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-forest-green-action" />
          <span className="text-[12px] font-medium text-forest-green-action">
            {contradiction.paperA.authors[0]} et al. {contradiction.paperA.year}
          </span>
        </div>
        <p className="text-[14px] text-deep-shadow">
          {contradiction.findingA}
        </p>
      </div>

      {/* VS */}
      <div className="text-center text-[12px] font-semibold text-muted-stone uppercase tracking-wide">
        vs
      </div>

      {/* Paper B */}
      <div className="bg-goldenrod-accent/5 border border-goldenrod-accent/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-goldenrod-accent" />
          <span className="text-[12px] font-medium text-goldenrod-accent">
            {contradiction.paperB.authors[0]} et al. {contradiction.paperB.year}
          </span>
        </div>
        <p className="text-[14px] text-deep-shadow">
          {contradiction.findingB}
        </p>
      </div>

      {/* Possible reason */}
      {contradiction.possibleReason && (
        <div className="pt-3 border-t border-pebble-gray/30">
          <h5 className="text-[12px] font-semibold uppercase tracking-wide text-muted-stone mb-2">
            Possible explanation
          </h5>
          <p className="text-[13px] text-deep-shadow/80">
            {contradiction.possibleReason}
          </p>
        </div>
      )}

      {/* Question */}
      <div className="pt-2">
        <button className="w-full text-left rounded-lg border border-pebble-gray/60 bg-transparent px-3 py-2 text-[13px] text-deep-shadow hover:border-onyx-outline/40 hover:bg-onyx-outline/5 transition-all">
          Ask about this contradiction →
        </button>
      </div>
    </div>
  );
}
