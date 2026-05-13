import React, { useCallback, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { InvestigationThread } from "@/components/search/InvestigationThread";
import { Inspector } from "@/components/search/Inspector";
import { AlertCircle, Microscope, Plus, ChevronLeft } from "lucide-react";
import type { TurnV1, PaperV1, ContradictionV1 } from "@/components/search/TurnV1";
import type { SearchSessionDetail, SearchSessionMessage, RankedPaper, EvidenceSpan } from "@/lib/search-types";

const sessionQueryKey = (sessionId: number) => ["search-session-v1", sessionId];

// Transform real API papers to the format InvestigationThread expects
function transformPaper(rankedPaper: RankedPaper): PaperV1 {
  return {
    id: rankedPaper.externalId,
    title: rankedPaper.title,
    authors: rankedPaper.authors.slice(0, 5),
    year: rankedPaper.year ?? new Date().getFullYear(),
    journal: rankedPaper.source,
    abstract: rankedPaper.abstract,
    studyType: mapStudyType(rankedPaper.studyDesign),
    sampleSize: undefined, // Not always available in RankedPaper
    doi: rankedPaper.doi,
  };
}

function mapStudyType(design: string): PaperV1['studyType'] {
  switch (design) {
    case 'meta_analysis': return 'Meta-analysis';
    case 'systematic_review': return 'Meta-analysis';
    case 'rct': return 'RCT';
    case 'cohort': return 'Observational';
    case 'cross_sectional': return 'Observational';
    default: return 'Mechanistic';
  }
}

// Detect contradictions from evidence spans
function detectContradictions(spans: EvidenceSpan[], papers: PaperV1[]): ContradictionV1[] {
  const contradictions: ContradictionV1[] = [];
  
  // Look for spans with conflicting evidence
  spans.forEach((span, idx) => {
    const conflictingEvidence = span.evidence.filter(e => e.supportType === 'related_evidence');
    if (conflictingEvidence.length >= 2) {
      const paperA = papers.find(p => p.id === conflictingEvidence[0]?.paperExternalId);
      const paperB = papers.find(p => p.id === conflictingEvidence[1]?.paperExternalId);
      
      if (paperA && paperB) {
        contradictions.push({
          id: `contradiction-${idx}`,
          claim: span.claimText,
          paperA,
          paperB,
          findingA: conflictingEvidence[0].text,
          findingB: conflictingEvidence[1].text,
          possibleReason: "Different study designs or populations may explain the discrepancy",
        });
      }
    }
  });
  
  return contradictions;
}

// Transform session messages to turns
function transformMessagesToTurns(
  session: SearchSessionDetail | undefined
): TurnV1[] {
  if (!session) return [];
  
  const papers = session.papers.map(transformPaper);
  const turns: TurnV1[] = [];
  
  // Initial assistant turn with synthesis
  const contradictions = detectContradictions(session.evidenceSpans, papers);
  
  turns.push({
    id: `turn-initial`,
    timestamp: new Date().toISOString(),
    role: "assistant",
    synthesis: session.synthesisText,
    evidenceCount: session.papers.length,
    newEvidenceCount: session.papers.length,
    contradictionCount: contradictions.length,
    contradictions: contradictions.length > 0 ? contradictions : undefined,
    paperReferences: papers.map(p => p.id),
    suggestedPaths: session.followUpOptions.slice(0, 3),
  });
  
  // Add message history
  session.messages.forEach((msg, idx) => {
    if (msg.role === 'user') {
      turns.push({
        id: `turn-msg-${msg.id}`,
        timestamp: msg.createdAt,
        role: "user",
        synthesis: msg.content,
        evidenceCount: 0,
        newEvidenceCount: 0,
        contradictionCount: 0,
        paperReferences: [],
        suggestedPaths: [],
      });
    } else if (msg.role === 'assistant') {
      turns.push({
        id: `turn-msg-${msg.id}`,
        timestamp: msg.createdAt,
        role: "assistant",
        synthesis: msg.content,
        evidenceCount: session.papers.length,
        newEvidenceCount: msg.metadata?.canvasChanged ? 0 : 0, // Would need real data
        contradictionCount: 0,
        paperReferences: papers.map(p => p.id),
        suggestedPaths: [],
      });
    }
  });
  
  return turns;
}

export default function SearchSessionV1Page({ id }: { id: string }) {
  const sessionId = Number.parseInt(id, 10);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  // Fetch real session data
  const { data: session, isLoading, error } = useQuery<SearchSessionDetail>({
    queryKey: sessionQueryKey(sessionId),
    queryFn: () => customFetch<SearchSessionDetail>(`/api/search/sessions/${sessionId}`),
    staleTime: 30_000,
    enabled: !Number.isNaN(sessionId),
  });
  
  // Transform data for UI
  const papers = useMemo(() => 
    session?.papers.map(transformPaper) ?? [], 
    [session]
  );
  
  const turns = useMemo(() => 
    transformMessagesToTurns(session),
    [session]
  );
  
  const contradictions = useMemo(() => {
    if (!session) return [];
    return detectContradictions(session.evidenceSpans, papers);
  }, [session, papers]);
  
  // Append message mutation
  const appendMessage = useMutation<
    { messages: SearchSessionMessage[]; session?: SearchSessionDetail | null },
    Error,
    string
  >({
    mutationFn: (content: string) =>
      customFetch<{ messages: SearchSessionMessage[]; session?: SearchSessionDetail | null }>(
        `/api/search/sessions/${sessionId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        },
      ),
    onSuccess: (payload) => {
      queryClient.setQueryData<SearchSessionDetail | undefined>(
        sessionQueryKey(sessionId),
        (current) => {
          if (!current) return current;
          if (payload.session) return payload.session;
          return { 
            ...current, 
            messages: [...current.messages, ...payload.messages] 
          };
        },
      );
    },
  });
  
  // State for inspector
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<'paper' | 'contradiction' | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedContradictionId, setSelectedContradictionId] = useState<string | null>(null);

  // Handlers
  const handlePaperClick = useCallback((paperId: string) => {
    setSelectedPaperId(paperId);
    setInspectorMode('paper');
    setInspectorOpen(true);
  }, []);

  const handleContradictionClick = useCallback((contradictionId: string) => {
    setSelectedContradictionId(contradictionId);
    setInspectorMode('contradiction');
    setInspectorOpen(true);
  }, []);

  const handleSuggestedPath = useCallback(async (path: string) => {
    await appendMessage.mutateAsync(path);
  }, [appendMessage]);

  const handleSubmit = useCallback(async (content: string) => {
    await appendMessage.mutateAsync(content);
  }, [appendMessage]);

  const handleCloseInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorMode(null);
    setSelectedPaperId(null);
    setSelectedContradictionId(null);
  }, []);

  if (Number.isNaN(sessionId)) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[15px] font-medium text-red-700">Invalid session</p>
            <p className="text-[13px] text-red-600 mt-0.5">
              This exploration session link is not valid.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="h-[calc(100vh-64px)] flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-onyx-outline/20 border-t-onyx-outline rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[14px] text-muted-stone">Loading session...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !session) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[15px] font-medium text-red-700">Failed to load session</p>
            <p className="text-[13px] text-red-600 mt-0.5">
              {error instanceof Error ? error.message : "Could not load this exploration session."}
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header - minimal, elegant */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-pebble-gray/20 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/search')}
              className="p-1.5 hover:bg-pebble-gray/30 rounded-md transition-colors text-muted-stone hover:text-deep-shadow"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Microscope className="w-4 h-4 text-onyx-outline/70" />
              <h1 className="text-[15px] font-medium text-deep-shadow truncate max-w-md">
                {session.query}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate('/search')}
              className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-muted-stone hover:text-deep-shadow hover:bg-pebble-gray/30 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Investigation Thread - Center */}
          <div className={`flex-1 min-w-0 bg-canvas-parchment/30 transition-all duration-300 ${inspectorOpen ? 'border-r border-pebble-gray/20' : ''}`}>
            <InvestigationThread
              turns={turns}
              papers={papers}
              isExploring={appendMessage.isPending}
              activePaperId={selectedPaperId}
              onPaperClick={handlePaperClick}
              onContradictionClick={handleContradictionClick}
              onSuggestedPath={handleSuggestedPath}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Inspector - Right */}
          <div className={`transition-all duration-300 ${inspectorOpen ? 'w-[380px] opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
            {inspectorOpen && (
              <Inspector
                isOpen={inspectorOpen}
                mode={inspectorMode}
                papers={papers}
                contradictions={contradictions}
                selectedPaperId={selectedPaperId}
                selectedContradictionId={selectedContradictionId}
                onClose={handleCloseInspector}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
