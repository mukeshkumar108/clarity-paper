import React, { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { InvestigationThread } from "@/components/search/InvestigationThread";
import { Inspector } from "@/components/search/Inspector";
import { AlertCircle, Microscope, Plus, ChevronLeft } from "lucide-react";
import type { TurnV1, PaperV1, ContradictionV1, InvestigationV1 } from "@/components/search/TurnV1";

// Demo data for Phase 1
const demoPapers: PaperV1[] = [
  {
    id: "smith-2023",
    title: "Creatine supplementation improves physical performance during sleep deprivation in athletes",
    authors: ["Smith", "Johnson", "Lee"],
    year: 2023,
    journal: "Journal of Sports Medicine",
    abstract: "This randomized controlled trial examined the effects of creatine supplementation on physical performance during 48 hours of sleep deprivation in 48 trained athletes. Participants received either 5g/day creatine or placebo for 4 weeks. The creatine group maintained power output during sleep restriction (p<0.01), while the placebo group declined by 15%. Sleep efficiency was preserved in the creatine group.",
    studyType: "RCT",
    sampleSize: 48,
    doi: "10.1234/jsm.2023.001"
  },
  {
    id: "jones-2021",
    title: "Cognitive effects of creatine during sleep restriction: A randomized trial",
    authors: ["Jones", "Williams"],
    year: 2021,
    journal: "Sleep Research Quarterly",
    abstract: "We investigated whether creatine supplementation could protect cognitive function during 24 hours of sleep deprivation. 32 healthy adults received creatine (20g loading, then 5g/day) or placebo. Results showed no significant difference in working memory, reaction time, or executive function between groups (p>0.05).",
    studyType: "RCT",
    sampleSize: 32,
    doi: "10.5678/srq.2021.042"
  },
  {
    id: "chen-2022",
    title: "Meta-analysis: Creatine and sleep quality in physically active populations",
    authors: ["Chen", "Rodriguez", "Kim", "Anderson"],
    year: 2022,
    journal: "International Review of Sports Nutrition",
    abstract: "This meta-analysis pooled data from 8 RCTs examining creatine's effects on sleep quality. Overall effect size was small but significant (d=0.32, 95% CI: 0.12-0.52) for sleep efficiency. Effects were stronger in studies with >4 week duration and in athletic populations.",
    studyType: "Meta-analysis",
    sampleSize: 312,
    doi: "10.9012/irsnu.2022.103"
  }
];

const demoContradictions: ContradictionV1[] = [
  {
    id: "cognitive-contradiction",
    claim: "Does creatine improve cognitive function during sleep deprivation?",
    paperA: demoPapers[0], // Smith
    paperB: demoPapers[1], // Jones
    findingA: "Working memory improved by 12% with creatine supplementation",
    findingB: "No significant effect on working memory, reaction time, or executive function",
    possibleReason: "Different timing of assessment—Smith tested immediately post-deprivation, Jones tested after recovery sleep"
  }
];

const initialTurns: TurnV1[] = [
  {
    id: "turn-1",
    timestamp: new Date().toISOString(),
    role: "assistant",
    synthesis: "**Short answer:** Creatine helps physical performance during sleep deprivation, but podcasts often exaggerate how much it helps mentally.\n\n**The evidence:** Two solid RCTs found creatine maintained power output and sleep efficiency during restriction. That's real for athletes. But cognitive effects are genuinely mixed—one study found +12% working memory improvement, another found no effect at all.\n\n**So practically:** Facing a tough training session after poor sleep? Creatine is worth considering. Need to think clearly for a big decision? The evidence is shakier. The podcasts are highlighting one positive study while glossing over the mixed results.",
    evidenceCount: 5,
    newEvidenceCount: 5,
    contradictionCount: 1,
    contradictions: [demoContradictions[0]],
    paperReferences: ["smith-2023", "jones-2021", "chen-2022"],
    suggestedPaths: ["Why the contradiction?", "Optimal dosage", "Timing matters?"]
  }
];

export default function SearchSessionV1Page({ id }: { id: string }) {
  const sessionId = Number.parseInt(id, 10);
  const [, navigate] = useLocation();
  
  // State
  const [turns, setTurns] = useState<TurnV1[]>(initialTurns);
  const [papers] = useState<PaperV1[]>(demoPapers);
  const [contradictions] = useState<ContradictionV1[]>(demoContradictions);
  const [isExploring, setIsExploring] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<'paper' | 'contradiction' | null>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedContradictionId, setSelectedContradictionId] = useState<string | null>(null);

  // Generate better mock responses with short answer format
  // MUST be defined BEFORE handlers that use it
  const generateShortAnswerResponse = useCallback((query: string): string => {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('contradiction') || lowerQuery.includes('why')) {
      return "**Short answer:** The contradiction is about timing—when they tested cognitive function.\n\n**The evidence:** Smith tested immediately after sleep deprivation and found +12% working memory improvement. Jones tested after recovery sleep and found no effect. This suggests creatine helps acute sleep loss (in the moment) but doesn't fix underlying sleep debt.\n\n**So practically:** If you need to perform right after a bad night's sleep, creatine might help. But it won't restore you to fully-rested cognitive performance.";
    }
    
    if (lowerQuery.includes('dosage') || lowerQuery.includes('dose')) {
      return "**Short answer:** 5g/day is standard, but the loading protocol matters.\n\n**The evidence:** Most studies used 20g/day for 5-7 days (loading), then 3-5g/day maintenance. The one study showing strong cognitive benefits used this protocol. Standard dosing without loading may not achieve brain saturation fast enough.\n\n**So practically:** If you want acute effects for a specific event, do the loading phase. For general use, standard 5g/day is fine but effects build over weeks.";
    }
    
    if (lowerQuery.includes('timing') || lowerQuery.includes('when')) {
      return "**Short answer:** Take it before the sleep deprivation, not after.\n\n**The evidence:** Studies where participants loaded creatine *before* sleep restriction showed benefits. Taking it after (like the next morning) doesn't help acutely because brain creatine levels don't rise immediately.\n\n**So practically:** If you know you'll have a bad sleep night, start creatine beforehand. It's not a morning-after fix.";
    }
    
    return "**Short answer:** The evidence on this specific angle is limited.\n\n**What we know:** Current studies focus on athletic populations with acute sleep deprivation. Your question touches on areas not well-covered yet.\n\n**Options:** I can search for studies on chronic sleep deprivation, non-athletic populations, or compare to caffeine if helpful.";
  }, []);

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

  const handleSuggestedPath = useCallback((path: string) => {
    // Add user turn
    const userTurn: TurnV1 = {
      id: `turn-${Date.now()}-user`,
      timestamp: new Date().toISOString(),
      role: "user",
      synthesis: path,
      evidenceCount: 0,
      newEvidenceCount: 0,
      contradictionCount: 0,
      paperReferences: [],
      suggestedPaths: []
    };
    
    setTurns(prev => [...prev, userTurn]);
    setIsExploring(true);
    
    // Simulate exploration
    setTimeout(() => {
      const assistantTurn: TurnV1 = {
        id: `turn-${Date.now()}-assistant`,
        timestamp: new Date().toISOString(),
        role: "assistant",
        synthesis: generateShortAnswerResponse(path),
        evidenceCount: 8,
        newEvidenceCount: 3,
        contradictionCount: path.toLowerCase().includes('contradiction') ? 1 : 0,
        contradictions: path.toLowerCase().includes('contradiction') ? demoContradictions : undefined,
        paperReferences: ["smith-2023", "jones-2021", "chen-2022"],
        suggestedPaths: ["High-dose protocols", "How caffeine compares", "Long-term safety"]
      };
      
      setTurns(prev => [...prev, assistantTurn]);
      setIsExploring(false);
    }, 2000);
  }, [generateShortAnswerResponse]);

  const handleSubmit = useCallback((content: string) => {
    // Add user turn
    const userTurn: TurnV1 = {
      id: `turn-${Date.now()}-user`,
      timestamp: new Date().toISOString(),
      role: "user",
      synthesis: content,
      evidenceCount: 0,
      newEvidenceCount: 0,
      contradictionCount: 0,
      paperReferences: [],
      suggestedPaths: []
    };
    
    setTurns(prev => [...prev, userTurn]);
    setIsExploring(true);
    
    // Simulate exploration
    setTimeout(() => {
      const assistantTurn: TurnV1 = {
        id: `turn-${Date.now()}-assistant`,
        timestamp: new Date().toISOString(),
        role: "assistant",
        synthesis: generateShortAnswerResponse(content),
        evidenceCount: 8,
        newEvidenceCount: 3,
        contradictionCount: content.toLowerCase().includes('contradiction') ? 1 : 0,
        contradictions: content.toLowerCase().includes('contradiction') ? demoContradictions : undefined,
        paperReferences: ["smith-2023", "jones-2021", "chen-2022"],
        suggestedPaths: ["High-dose protocols", "How caffeine compares", "Long-term safety"]
      };
      
      setTurns(prev => [...prev, assistantTurn]);
      setIsExploring(false);
    }, 2000);
  }, [generateShortAnswerResponse]);

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
              <h1 className="text-[15px] font-medium text-deep-shadow">
                Creatine and sleep deprivation
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-muted-stone hover:text-deep-shadow hover:bg-pebble-gray/30 rounded-md transition-colors">
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
              isExploring={isExploring}
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
