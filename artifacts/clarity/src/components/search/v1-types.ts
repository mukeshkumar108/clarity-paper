// Types for Phase 1 - Minimal coherent v1

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
  paperReferences: string[]; // Paper IDs
  suggestedPaths: string[];
}

export interface InvestigationV1 {
  id: string;
  query: string;
  turns: TurnV1[];
  papers: PaperV1[];
  contradictions: ContradictionV1[];
  createdAt: string;
  updatedAt: string;
}

export interface InspectorStateV1 {
  isOpen: boolean;
  mode: 'paper' | 'contradiction' | null;
  selectedPaperId: string | null;
  selectedContradictionId: string | null;
}
