import React from "react";
import { User, Bot, Flame, FileText } from "lucide-react";

export interface PaperV1 {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal?: string;
  abstract: string;
  studyType: 'RCT' | 'Meta-analysis' | 'Observational' | 'Mechanistic' | 'Review';
  sampleSize?: number;
  doi?: string;
}

export interface ContradictionV1 {
  id: string;
  claim: string;
  paperA: PaperV1;
  paperB: PaperV1;
  findingA: string;
  findingB: string;
  possibleReason?: string;
}

export interface TurnV1 {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant';
  synthesis: string;
  evidenceCount: number;
  newEvidenceCount: number;
  contradictionCount: number;
  contradictions?: ContradictionV1[];
  paperReferences: string[];
  suggestedPaths: string[];
}

interface TurnProps {
  turn: TurnV1;
  papers: PaperV1[];
  onPaperClick: (paperId: string) => void;
  onContradictionClick: (contradictionId: string) => void;
  onSuggestedPath: (path: string) => void;
  isLatest?: boolean;
}

export function TurnV1Component({ 
  turn, 
  papers, 
  onPaperClick, 
  onContradictionClick,
  onSuggestedPath,
  isLatest 
}: TurnProps) {
  const isUser = turn.role === 'user';

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end">
        <div className="flex-1 max-w-[85%]">
          <div className="bg-onyx-outline text-white rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-[15px] leading-relaxed">{turn.synthesis}</p>
          </div>
        </div>
        <div className="shrink-0 w-8 h-8 rounded-full bg-onyx-outline flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
      </div>
    );
  }

  // Assistant turn
  return (
    <div className={`flex gap-3 ${isLatest ? 'animate-in fade-in slide-in-from-bottom-2 duration-500' : ''}`}>
      <div className="shrink-0 w-8 h-8 rounded-full bg-canvas-parchment border border-pebble-gray flex items-center justify-center">
        <Bot className="w-4 h-4 text-onyx-outline" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-white/70 border border-pebble-gray/70 rounded-2xl rounded-tl-sm px-4 py-4">
          {/* Synthesis */}
          <div className="prose prose-sm max-w-none">
            <p className="text-[15px] text-deep-shadow leading-relaxed whitespace-pre-wrap">
              {turn.synthesis}
            </p>
          </div>

          {/* Evidence line */}
          <div className="mt-4 pt-3 border-t border-pebble-gray/30 flex items-center gap-4 text-[13px]">
            <button 
              onClick={() => {
                // Open inspector with papers
                if (turn.paperReferences.length > 0) {
                  onPaperClick(turn.paperReferences[0]);
                }
              }}
              className="flex items-center gap-1.5 text-muted-stone hover:text-deep-shadow transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>
                Based on {turn.evidenceCount} papers
                {turn.newEvidenceCount > 0 && (
                  <span className="text-onyx-outline font-medium"> (+{turn.newEvidenceCount} new)</span>
                )}
              </span>
            </button>
            
            {turn.contradictionCount > 0 && (
              <button
                onClick={() => {
                  if (turn.contradictions && turn.contradictions.length > 0) {
                    onContradictionClick(turn.contradictions[0].id);
                  }
                }}
                className="flex items-center gap-1.5 text-goldenrod-accent hover:text-goldenrod-accent/80 transition-colors"
              >
                <Flame className="w-4 h-4" />
                <span>{turn.contradictionCount} contradiction{turn.contradictionCount !== 1 ? 's' : ''}</span>
              </button>
            )}
          </div>

          {/* Suggested paths */}
          {turn.suggestedPaths.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {turn.suggestedPaths.map((path, idx) => (
                <button
                  key={idx}
                  onClick={() => onSuggestedPath(path)}
                  className="rounded-full border border-pebble-gray/60 bg-transparent px-3 py-1.5 text-[13px] text-deep-shadow hover:border-onyx-outline/40 hover:bg-onyx-outline/5 transition-all"
                >
                  {path}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
