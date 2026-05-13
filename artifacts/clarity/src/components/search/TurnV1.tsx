import React, { useState } from "react";
import { User, Bot, Flame, FileText, ChevronDown, ChevronUp } from "lucide-react";

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
  activePaperId?: string | null;
  onPaperClick: (paperId: string) => void;
  onContradictionClick: (contradictionId: string) => void;
  onSuggestedPath: (path: string) => void;
  isLatest?: boolean;
}

export function TurnV1Component({ 
  turn, 
  papers, 
  activePaperId,
  onPaperClick, 
  onContradictionClick,
  onSuggestedPath,
  isLatest 
}: TurnProps) {
  const isUser = turn.role === 'user';
  const [showEvidence, setShowEvidence] = useState(false);

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end py-2">
        <div className="flex-1 max-w-[80%] text-right">
          <p className="text-[15px] text-deep-shadow/80 leading-relaxed inline-block">
            {turn.synthesis}
          </p>
        </div>
        <div className="shrink-0 w-6 h-6 rounded-full bg-pebble-gray/30 flex items-center justify-center mt-0.5">
          <User className="w-3 h-3 text-muted-stone" />
        </div>
      </div>
    );
  }

  // Assistant turn - editorial, calm, spacious
  return (
    <div className={`py-6 ${isLatest ? 'animate-in fade-in duration-500' : ''}`}>
      {/* Avatar and content */}
      <div className="flex gap-4">
        <div className="shrink-0 w-6 h-6 rounded-full bg-onyx-outline/10 flex items-center justify-center mt-1">
          <Bot className="w-3.5 h-3.5 text-onyx-outline/60" />
        </div>
        
        <div className="flex-1 min-w-0 space-y-4">
          {/* Synthesis - editorial typography */}
          <div className="prose prose-slate max-w-none">
            <div 
              className="text-[16px] text-deep-shadow leading-[1.7] whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ 
                __html: formatSynthesis(turn.synthesis) 
              }}
            />
          </div>

          {/* Evidence and contradictions - minimal, integrated */}
          <div className="flex items-center gap-4 text-[13px] text-muted-stone">
            <button 
              onClick={() => setShowEvidence(!showEvidence)}
              className="flex items-center gap-1.5 hover:text-deep-shadow transition-colors group"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                {turn.evidenceCount} papers
                {turn.newEvidenceCount > 0 && (
                  <span className="text-onyx-outline"> · {turn.newEvidenceCount} new</span>
                )}
              </span>
              <span className="text-pebble-gray group-hover:text-onyx-outline transition-colors">
                {showEvidence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
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
                <Flame className="w-3.5 h-3.5" />
                <span>{turn.contradictionCount} contradiction{turn.contradictionCount !== 1 ? 's' : ''}</span>
              </button>
            )}
          </div>

          {/* Inline evidence expansion */}
          {showEvidence && (
            <div className="pt-4 border-t border-pebble-gray/20 space-y-3">
              <p className="text-[12px] uppercase tracking-wider text-muted-stone/60 font-medium">
                Evidence grounding
              </p>
              <div className="space-y-2">
                {turn.paperReferences.slice(0, 5).map((paperId) => {
                  const paper = papers.find(p => p.id === paperId);
                  if (!paper) return null;
                  const isActive = activePaperId === paperId;
                  return (
                    <button
                      key={paperId}
                      onClick={() => onPaperClick(paperId)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isActive 
                          ? 'bg-onyx-outline/5 border-onyx-outline/30' 
                          : 'bg-white/40 border-pebble-gray/30 hover:border-pebble-gray/60'
                      }`}
                    >
                      <p className="text-[13px] font-medium text-deep-shadow leading-snug">
                        {paper.title}
                      </p>
                      <p className="text-[11px] text-muted-stone mt-1">
                        {paper.authors[0]} et al. · {paper.year} · {paper.studyType}
                      </p>
                    </button>
                  );
                })}
                {turn.paperReferences.length > 5 && (
                  <button 
                    onClick={() => onPaperClick(turn.paperReferences[0])}
                    className="text-[12px] text-onyx-outline hover:text-deep-shadow transition-colors"
                  >
                    + {turn.paperReferences.length - 5} more papers
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Suggested paths - integrated, subtle */}
          {turn.suggestedPaths.length > 0 && (
            <div className="pt-2">
              <div className="flex flex-wrap gap-2">
                {turn.suggestedPaths.map((path, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSuggestedPath(path)}
                    className="text-[13px] text-onyx-outline hover:text-deep-shadow hover:underline transition-all underline-offset-2 decoration-onyx-outline/30"
                  >
                    {path}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Format synthesis to handle bold sections
function formatSynthesis(text: string): string {
  // Convert **text** to <strong> for short answer emphasis
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-deep-shadow font-semibold">$1</strong>')
    .replace(/\n/g, '<br />');
}
