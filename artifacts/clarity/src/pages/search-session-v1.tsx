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
    synthesis: "Creatine appears to help with physical recovery during sleep deprivation, but the cognitive effects are genuinely mixed.\n\nHere's what the evidence shows:\n\n**Physical performance**: Two solid RCTs found creatine helped maintain power output and sleep efficiency during restriction. That's a real, measurable benefit for athletes.\n\n**Cognitive function**: This is where it gets interesting. Two studies disagree—one found +12% improvement in working memory, another found no effect at all. The discrepancy might be about when they tested (immediately vs after recovery sleep).\n\nThe bottom line: If you're an athlete facing sleep restriction, creatine is worth considering for physical recovery. For cognitive protection? The jury is still out.",
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
        synthesis: generateResponse(path),
        evidenceCount: 8,
        newEvidenceCount: 3,
        contradictionCount: 0,
        paperReferences: ["smith-2023", "jones-2021", "chen-2022"],
        suggestedPaths: ["Long-term effects?", "Population differences?", "Mechanism?"]
      };
      
      setTurns(prev => [...prev, assistantTurn]);
      setIsExploring(false);
    }, 2000);
  }, []);

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
        synthesis: generateResponse(content),
        evidenceCount: 8,
        newEvidenceCount: 3,
        contradictionCount: 0,
        paperReferences: ["smith-2023", "jones-2021", "chen-2022"],
        suggestedPaths: ["Long-term effects?", "Population differences?", "Mechanism?"]
      };
      
      setTurns(prev => [...prev, assistantTurn]);
      setIsExploring(false);
    }, 2000);
  }, []);

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
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-pebble-gray/30 bg-white/50 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/search')}
              className="p-2 hover:bg-pebble-gray/50 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-muted-stone" />
            </button>
            <div className="flex items-center gap-2">
              <Microscope className="w-5 h-5 text-onyx-outline" />
              <h1 className="text-[16px] font-semibold text-deep-shadow">
                Creatine and sleep deprivation
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-muted-stone hover:text-deep-shadow hover:bg-pebble-gray/50 rounded-lg transition-colors">
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Investigation Thread - Center */}
          <div className="flex-1 min-w-0">
            <InvestigationThread
              turns={turns}
              papers={papers}
              isExploring={isExploring}
              onPaperClick={handlePaperClick}
              onContradictionClick={handleContradictionClick}
              onSuggestedPath={handleSuggestedPath}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Inspector - Right */}
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
    </DashboardLayout>
  );
}

// Mock response generator for demo
function generateResponse(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('contradiction') || lowerQuery.includes('why')) {
    return "The contradiction likely stems from methodological differences. Smith tested cognitive function immediately after 48 hours of sleep deprivation, while Jones tested after participants had recovery sleep. This timing difference is crucial—creatine may help with acute sleep loss but not long-term cognitive recovery.\n\nAnother factor: Smith used a working memory test specific to athletic decision-making, while Jones used general cognitive assessments. The benefit may be domain-specific.";
  }
  
  if (lowerQuery.includes('dosage') || lowerQuery.includes('dose')) {
    return "Most studies used a loading phase of 20g/day for 5-7 days, followed by 3-5g/day maintenance. The Chen meta-analysis found effects were stronger with longer duration (>4 weeks).\n\nHowever, individual response varies significantly. Some people are 'responders' with noticeable effects, others see minimal benefit. Factors like muscle mass, diet (vegetarians see bigger effects), and baseline creatine levels all play a role.";
  }
  
  if (lowerQuery.includes('timing') || lowerQuery.includes('when')) {
    return "Timing appears to matter significantly. Studies where creatine was taken closer to sleep deprivation showed better effects than those with morning-only dosing.\n\nThis makes mechanistic sense: creatine helps maintain cellular energy (ATP) during metabolic stress. Taking it pre-deprivation means higher tissue levels when you need them most.";
  }
  
  return "That's an interesting angle to explore. Based on the current evidence, we'd need to look at more studies specifically addressing this question. The current set focuses primarily on acute sleep deprivation in athletic populations.\n\nWould you like me to search for studies on long-term effects, different populations, or mechanism of action?";
}
