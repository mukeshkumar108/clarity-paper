import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "wouter";
import {
  useGetDocument,
  getGetDocumentQueryKey,
  useGetDocumentAnalysis,
  getGetDocumentAnalysisQueryKey,
  useAnalyseDocument,
  useListDocumentQuestions,
  getListDocumentQuestionsQueryKey,
  useAskDocumentQuestion,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ReadableDocumentView } from "@/components/readable-document-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  Zap,
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  ChevronLeft,
  Settings,
  Info,
  CheckCircle2,
  BookOpen,
  ShieldCheck,
  ScanSearch,
  Link2,
  Quote,
  FlaskConical,
  ArrowUpRight,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasText(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasItems<T>(value?: T[] | null): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

const EMPTY_SENTINELS = [
  /^not visible in the uploaded text\.?$/i,
  /^not clear from (the )?uploaded text\.?$/i,
  /^not clearly extractable from the uploaded text\.?$/i,
  /^not available\.?$/i,
  /^n\/a\.?$/i,
  /^—$/,
];

function hasMeaningfulText(value?: string | null): value is string {
  if (!hasText(value)) return false;
  const trimmed = value.trim();
  if (trimmed.length < 20) return false;
  return !EMPTY_SENTINELS.some((r) => r.test(trimmed));
}

function trustPillClasses(confidenceLevel?: string): string {
  const lvl = confidenceLevel?.toLowerCase() ?? "";
  if (lvl === "high") return "bg-forest-green-action/10 text-forest-green-action border-forest-green-action/30 border-l-forest-green-action";
  if (lvl === "medium") return "bg-goldenrod-accent/10 text-goldenrod-accent border-goldenrod-accent/30 border-l-goldenrod-accent";
  return "bg-pebble-gray/50 text-muted-stone border-pebble-gray border-l-muted-stone";
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CLAIM_TYPE_LABELS: Record<string, string> = {
  causal: "Causal — proves cause & effect",
  correlational: "Correlational — not causation",
  theoretical: "Theoretical / model-based",
  speculative: "Speculative / hypothesis",
};

function normaliseTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function deriveSupportType(strength?: string): EvidenceSupportType {
  const level = strength?.toLowerCase() ?? "";
  if (level.includes("strong") || level.includes("moderate")) return "direct";
  if (level.includes("limited")) return "indirect";
  if (level.includes("theoretical") || level.includes("speculative")) return "contextual";
  return "general";
}

function supportTypeClasses(supportType: EvidenceSupportType): string {
  if (supportType === "direct") {
    return "border-forest-green-action/20 bg-forest-green-action/6 text-forest-green-action";
  }
  if (supportType === "indirect") {
    return "border-goldenrod-accent/25 bg-goldenrod-accent/8 text-goldenrod-accent";
  }
  if (supportType === "contextual") {
    return "border-[#7a6d94]/20 bg-[#7a6d94]/7 text-[#68557d]";
  }
  return "border-pebble-gray bg-pebble-gray/65 text-muted-stone";
}

function supportTypeLabel(supportType: EvidenceSupportType): string {
  if (supportType === "direct") return "Direct support";
  if (supportType === "indirect") return "Indirect support";
  if (supportType === "contextual") return "Contextual";
  return "General context";
}

function classifyEvidenceType(studyType?: string): string {
  const value = studyType?.trim();
  if (!value) return "Study evidence";
  if (/meta/i.test(value)) return "Meta-analysis";
  if (/\brct\b|random/i.test(value)) return "RCT";
  if (/observ/i.test(value)) return "Observational";
  if (/mechan/i.test(value)) return "Mechanistic";
  if (/guideline/i.test(value)) return "Guideline";
  if (/review/i.test(value)) return "Review";
  return value;
}

function confidenceSummary(strength?: string, confidenceLevel?: string): string {
  const support = strength?.trim();
  const confidence = confidenceLevel?.trim();
  if (support && confidence) return `${support} grounding · ${capitalise(confidence)} confidence`;
  if (support) return `${support} grounding`;
  if (confidence) return `${capitalise(confidence)} confidence`;
  return "Grounding available";
}

function pickBestEvidence(
  finding: { heading: string; body: string },
  keyFindings: NonNullable<ViewAnalysis["keyFindings"]>,
  studyType?: string,
  confidenceLevel?: string,
): GroundedEvidence | null {
  const fallbackByIndex = keyFindings[0];
  if (!fallbackByIndex) return null;

  const findingTokens = new Set(normaliseTokens(`${finding.heading} ${finding.body}`));
  const scored = keyFindings
    .map((item, index) => {
      const itemText = `${item.finding} ${item.plainEnglishMeaning} ${item.sourceText ?? ""} ${item.sourceInPaper}`;
      const score = normaliseTokens(itemText).reduce((total, token) => total + (findingTokens.has(token) ? 1 : 0), 0);
      return { item, index, score };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = scored[0]?.score > 0 ? scored[0]?.item : fallbackByIndex;
  if (!chosen) return null;

  return {
    id: `${chosen.finding}-${chosen.sourceInPaper}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: finding.heading,
    claimText: finding.body,
    snippet: chosen.sourceText?.trim() || chosen.plainEnglishMeaning || chosen.finding,
    sourceLabel: chosen.sourceInPaper || chosen.populationOrSample || "Source passage from paper",
    supportType: deriveSupportType(chosen.strengthOfSupport),
    confidenceLabel: confidenceSummary(chosen.strengthOfSupport, confidenceLevel),
    evidenceType: classifyEvidenceType(studyType),
  };
}

function parseGroundedAnswer(answer: string): ParsedAnswerSegment[] {
  const matches = answer.matchAll(/\[(doc|general)\]\s*([\s\S]*?)(?=(?:\n?\[(?:doc|general)\])|$)/gi);
  const parsed = Array.from(matches)
    .map((match) => ({
      label: match[1]?.toLowerCase() === "general" ? "general" as const : "doc" as const,
      text: match[2]?.trim() ?? "",
    }))
    .filter((segment) => segment.text.length > 0);

  if (parsed.length > 0) return parsed;

  return [{ label: "doc", text: answer.trim() }];
}

function buildQuestionEvidence(
  question: string,
  answer: string,
  keyFindings: NonNullable<ViewAnalysis["keyFindings"]>,
  studyType?: string,
  confidenceLevel?: string,
): GroundedEvidence[] {
  const queryTokens = new Set(normaliseTokens(`${question} ${answer}`));

  return keyFindings
    .map((item) => {
      const itemText = `${item.finding} ${item.plainEnglishMeaning} ${item.sourceText ?? ""} ${item.populationOrSample} ${item.sourceInPaper}`;
      const score = normaliseTokens(itemText).reduce((total, token) => total + (queryTokens.has(token) ? 1 : 0), 0);
      return {
        item,
        score,
      };
    })
    .filter(({ score, item }) => score > 0 || hasText(item.sourceText))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ item }, index) => ({
      id: `question-${index}-${item.finding}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: question,
      claimText: answer,
      snippet: item.sourceText?.trim() || item.plainEnglishMeaning || item.finding,
      sourceLabel: item.sourceInPaper || item.populationOrSample || "Source passage from paper",
      supportType: deriveSupportType(item.strengthOfSupport),
      confidenceLabel: confidenceSummary(item.strengthOfSupport, confidenceLevel),
      evidenceType: classifyEvidenceType(studyType),
    }));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewAnalysis = {
  paperMetadata?: {
    title: string;
    authors: string[];
    journal: string;
    publicationYear: string;
  };
  bottomLine?: string;
  editorialView?: {
    openingHook: string;
    orientation: string;
    findings: Array<{ heading: string; body: string }>;
    trustNarrative: string;
    questionsWorthAsking: string[];
    deeperDive: {
      howDesignedTitle: string;
      howDesignedBody: string;
      cantTellUsTitle: string;
      cantTellUsBody: string;
      biggerPictureTitle: string;
      biggerPictureBody: string;
      technicallyCuriousTitle: string;
      technicallyCuriousBody: string;
    };
  };
  primarySummary?: {
    bottomLine: string;
    insightNarrative: string;
    whyThisMatters: string;
    trustSignal: { label: string; summary: string; confidenceLevel: string };
    mainTakeaways: string[];
    suggestedQuestions: string[];
  };
  suggestedQuestions?: string[];
  disclaimer?: string;
  confidenceLevel?: string;
  trustRating?: { rating: string; reason: string; confidenceLevel: string; citationUse: string };
  whatPaperActuallyShows?: {
    studyType: string;
    population: string;
    interventionOrExposure: string;
    outcomesMeasured: string;
    observedResult: string;
    claimType: string;
  };
  evidenceQuality?: {
    studyType: string;
    sampleSize: string;
    controlsOrComparisonGroups: string;
    statisticalDetail: string;
    effectSizes: string;
    replication: string;
    publicationBiasRisk: string;
    fundingConflictVisibility: string;
    generalisability: string;
  };
  practicalUse?: { recommendation: string; reasoning: string; caution: string };
  keyFindings?: Array<{
    finding: string;
    sourceInPaper: string;
    populationOrSample: string;
    effectDirection: string;
    strengthOfSupport: string;
    plainEnglishMeaning: string;
    sourceText?: string | null;
  }>;
};

type ViewQuestion = { id: number; question: string; answer: string };
type EvidenceSupportType = "direct" | "indirect" | "contextual" | "general";
type GroundedEvidence = {
  id: string;
  title: string;
  claimText: string;
  snippet: string;
  sourceLabel: string;
  supportType: EvidenceSupportType;
  confidenceLabel: string;
  evidenceType: string;
};
type ParsedAnswerSegment = {
  label: "doc" | "general";
  text: string;
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "have", "were",
  "what", "when", "where", "which", "their", "there", "about", "because", "could", "would",
  "should", "these", "those", "does", "than", "then", "them", "they", "been", "being", "also",
  "into", "over", "under", "after", "before", "while", "across", "between", "among", "more",
  "less", "most", "some", "such", "than", "very", "much", "many", "paper", "study", "document",
]);

// ─── Progress stages ──────────────────────────────────────────────────────────

const PROGRESS_STAGES = [
  { text: "Reading the paper...", delay: 0 },
  { text: "Extracting key findings...", delay: 10000 },
  { text: "Crafting your explanation...", delay: 20000 },
  { text: "Almost ready...", delay: 35000 },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AnalysisSkeleton() {
  return (
    <div className="space-y-12">
      <div className="space-y-4">
        <Skeleton className="h-7 w-full rounded-xl" />
        <Skeleton className="h-7 w-4/5 rounded-xl" />
        <Skeleton className="h-5 w-32 rounded-full mt-2" />
      </div>
      <div className="space-y-8">
        <Skeleton className="h-3 w-28 rounded" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-5 w-3/5 rounded-lg" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-[28px] border border-pebble-gray p-8 space-y-4">
        <Skeleton className="h-5 w-48 rounded-lg" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-4/5 rounded" />
      </div>
    </div>
  );
}

// ─── Paper citation (right pane header) ──────────────────────────────────────

function PaperCitation({ metadata }: { metadata?: ViewAnalysis["paperMetadata"] }) {
  if (!metadata) return null;
  const { title, authors, journal, publicationYear } = metadata;
  const trimmedTitle = title?.trim();
  const authorList = (authors ?? []).filter(Boolean);
  const trimmedJournal = journal?.trim();
  const trimmedYear = publicationYear?.trim();
  if (!trimmedTitle && authorList.length === 0 && !trimmedJournal && !trimmedYear) return null;

  const authorStr = authorList.length > 3
    ? `${authorList.slice(0, 3).join(", ")} et al.`
    : authorList.join(", ");
  const venueStr = [trimmedJournal, trimmedYear].filter(Boolean).join(", ");

  return (
    <div className="pb-6 mb-2 border-b border-pebble-gray/60 space-y-1">
      {trimmedTitle && (
        <p className="text-[13px] font-semibold text-deep-shadow/75 leading-snug">{trimmedTitle}</p>
      )}
      {authorStr && (
        <p className="text-[11.5px] text-muted-stone leading-relaxed">{authorStr}</p>
      )}
      {venueStr && (
        <p className="text-[11.5px] text-muted-stone/65 italic leading-relaxed">{venueStr}</p>
      )}
    </div>
  );
}

function EvidenceCard({
  evidence,
  isActive,
  compact = false,
  onActivate,
}: {
  evidence: GroundedEvidence;
  isActive: boolean;
  compact?: boolean;
  onActivate: (evidence: GroundedEvidence) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onActivate(evidence)}
      className={cn(
        "w-full rounded-[20px] border px-4 py-4 text-left transition-all duration-200",
        compact ? "bg-white/88" : "bg-white",
        isActive
          ? "border-goldenrod-accent/35 shadow-[0_24px_70px_-42px_rgba(20,20,20,0.42)] ring-1 ring-goldenrod-accent/20"
          : "border-pebble-gray/90 shadow-subtle hover:border-inkwell/20 hover:bg-canvas-parchment/55",
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", supportTypeClasses(evidence.supportType))}>
          {supportTypeLabel(evidence.supportType)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-pebble-gray bg-canvas-parchment/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          <FlaskConical className="h-3 w-3" />
          {evidence.evidenceType}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-stone">
          {evidence.confidenceLabel}
        </span>
      </div>

      <p className="mt-3 text-[14px] leading-[1.75] text-inkwell/82">
        <Quote className="mr-1 inline h-3.5 w-3.5 -translate-y-[1px] text-muted-stone/60" />
        {evidence.snippet}
      </p>

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-[11px] leading-[1.6] text-muted-stone">
          {evidence.sourceLabel}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-deep-shadow">
          <Link2 className="h-3.5 w-3.5" />
          Anchor in source
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}

function QuestionAnswerCard({
  question,
  answer,
  supportingEvidence,
  activeEvidenceId,
  onActivateEvidence,
}: {
  question: string;
  answer: string;
  supportingEvidence: GroundedEvidence[];
  activeEvidenceId: string | null;
  onActivateEvidence: (evidence: GroundedEvidence) => void;
}) {
  const segments = parseGroundedAnswer(answer);
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl bg-inkwell px-4 py-3 text-[14px] leading-[1.6] text-canvas-parchment shadow-subtle">
          {question}
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[95%] rounded-2xl border border-pebble-gray bg-white p-4 shadow-subtle">
          <div className="space-y-3">
            {segments.map((segment, index) => (
              <div key={`${segment.label}-${index}`} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    segment.label === "doc"
                      ? "border-forest-green-action/20 bg-forest-green-action/6 text-forest-green-action"
                      : "border-pebble-gray bg-pebble-gray/55 text-muted-stone",
                  )}>
                    [{segment.label}]
                  </span>
                </div>
                <div className="readable-prose prose prose-stone max-w-none text-[14px]">
                  <ReactMarkdown>{segment.text}</ReactMarkdown>
                </div>
              </div>
            ))}

            {supportingEvidence.length > 0 && (
              <div className="rounded-[18px] border border-pebble-gray/85 bg-canvas-parchment/65 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setShowEvidence((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-stone">Supporting evidence</p>
                    <p className="text-[13px] leading-[1.65] text-inkwell/74">
                      Inspect the exact passages this answer leans on.
                    </p>
                  </div>
                  <ScanSearch className={cn("h-4 w-4 text-muted-stone transition-transform", showEvidence && "rotate-45")} />
                </button>

                {showEvidence && (
                  <div className="mt-3 space-y-2.5">
                    {supportingEvidence.map((evidence) => (
                      <EvidenceCard
                        key={evidence.id}
                        evidence={evidence}
                        compact
                        isActive={activeEvidenceId === evidence.id}
                        onActivate={onActivateEvidence}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Source pane (left panel) ─────────────────────────────────────────────────

function SourcePane({
  fallbackTitle,
  metadata,
  extractedText,
  activeEvidence,
}: {
  fallbackTitle: string;
  metadata?: ViewAnalysis["paperMetadata"];
  extractedText: string | null | undefined;
  activeEvidence: GroundedEvidence | null;
}) {
  return (
    <ReadableDocumentView
      fallbackTitle={fallbackTitle}
      metadata={metadata}
      extractedText={extractedText}
      activeSnippet={activeEvidence?.snippet ?? null}
      activeEvidenceLabel={activeEvidence ? `${activeEvidence.title} · ${activeEvidence.sourceLabel}` : null}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentView({ id }: { id: string }) {
  const docId = parseInt(id, 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatQuestion, setChatQuestion] = useState("");
  const [progressStage, setProgressStage] = useState(0);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [sourcePanelSize, setSourcePanelSize] = useState<number>(() => {
    const saved = localStorage.getItem("clarity-source-panel-size");
    return saved ? parseFloat(saved) : 42;
  });

  const { data: document, isLoading: docLoading, refetch: refetchDoc, error: docError } = useGetDocument(docId, {
    query: { enabled: !!docId, queryKey: getGetDocumentQueryKey(docId) },
  });

  const { data: analysis, isLoading: analysisLoading, refetch: refetchAnalysis, error: analysisError } = useGetDocumentAnalysis(docId, {
    query: { enabled: !!docId && document?.status === "completed", queryKey: getGetDocumentAnalysisQueryKey(docId) },
  });

  const { data: questions, refetch: refetchQuestions } = useListDocumentQuestions(docId, {
    query: { enabled: !!docId, queryKey: getListDocumentQuestionsQueryKey(docId) },
  });

  const analyseDocMutation = useAnalyseDocument();
  const askMutation = useAskDocumentQuestion();

  const askedSet = new Set((questions as ViewQuestion[] | undefined)?.map((q) => q.question) ?? []);

  // Poll while analysing
  useEffect(() => {
    if (document?.status === "analysing") {
      pollCountRef.current = 0;
      pollRef.current = setInterval(() => {
        pollCountRef.current++;
        if (pollCountRef.current <= 60) {
          refetchDoc();
        } else {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 3000);
      const timers = PROGRESS_STAGES.map((stage, index) =>
        setTimeout(() => setProgressStage(index), stage.delay)
      );
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        timers.forEach((t) => clearTimeout(t));
      };
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
      if (document?.status === "completed") refetchAnalysis();
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [document?.status, refetchDoc, refetchAnalysis]);

  // Auto-scroll chat
  useEffect(() => {
    if (showChat) chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [(questions as ViewQuestion[] | undefined)?.length, askMutation.isPending, showChat]);

  const handleAnalyse = () => {
    setProgressStage(0);
    analyseDocMutation.mutate(
      { id: docId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(docId) });
          refetchDoc();
        },
        onError: (err: unknown) => {
          toast({
            title: "Analysis failed",
            description: (err as { error?: string })?.error ?? "Something went wrong. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    const q = chatQuestion.trim();
    if (!q) return;
    setChatQuestion("");
    setPendingQuestion(q);
    askMutation.mutate(
      { id: docId, data: { question: q } },
      {
        onSuccess: () => { setPendingQuestion(null); refetchQuestions(); },
        onError: (err: unknown) => {
          setPendingQuestion(null);
          toast({
            title: "Failed to ask question",
            description: (err as { error?: string })?.error ?? "Something went wrong.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const submitSuggestedQuestion = (question: string) => {
    setShowChat(true);
    setPendingQuestion(question);
    askMutation.mutate(
      { id: docId, data: { question } },
      {
        onSuccess: () => { setPendingQuestion(null); refetchQuestions(); },
        onError: (err: unknown) => {
          setPendingQuestion(null);
          toast({
            title: "Failed to ask question",
            description: (err as { error?: string })?.error ?? "Something went wrong.",
            variant: "destructive",
          });
        },
      }
    );
  };

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (docLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas-parchment">
        <Loader2 className="w-10 h-10 animate-spin text-inkwell/20" />
      </div>
    );
  }

  // ── Error / failed ───────────────────────────────────────────────────────────

  if (docError || (document && document.status === "failed") || analysisError) {
    const failedTwice = analyseDocMutation.failureCount >= 1;
    return (
      <DashboardLayout>
        <div className="h-[70vh] flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-[24px] font-semibold text-deep-shadow mb-3 leading-tight">
            We couldn't analyse this paper.
          </h2>
          <p className="text-muted-stone max-w-md mb-8 leading-[1.7] text-[15px]">
            {failedTwice
              ? "This paper may have complex formatting our reader struggles with. Try downloading the abstract text and pasting it instead — that usually works."
              : "This sometimes happens with complex formatting. Try uploading it again or paste the abstract text directly."}
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <Button asChild variant="outline">
              <Link href="/documents/new">Paste text instead</Link>
            </Button>
            {!failedTwice && (
              <Button
                className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92"
                onClick={handleAnalyse}
                disabled={analyseDocMutation.isPending}
              >
                {analyseDocMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Try again
              </Button>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Analysing ────────────────────────────────────────────────────────────────

  if (document?.status === "analysing") {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-canvas-parchment px-6 text-center">
        <div className="mb-10 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-inkwell"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3, ease: "easeInOut" }}
            />
          ))}
        </div>
        <div className="space-y-4 max-w-sm">
          <AnimatePresence mode="wait">
            <motion.h2
              key={progressStage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="text-[22px] font-semibold text-deep-shadow tracking-tight"
            >
              {PROGRESS_STAGES[progressStage].text}
            </motion.h2>
          </AnimatePresence>
          <p className="text-muted-stone text-[15px] leading-[1.7]">
            Clarity is reading through the paper and preparing a plain-English explanation for you.
          </p>
        </div>
        <div className="mt-12 flex items-center gap-1.5">
          {PROGRESS_STAGES.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === progressStage ? "w-8 bg-inkwell" : i < progressStage ? "w-4 bg-inkwell/40" : "w-4 bg-pebble-gray"
              )}
            />
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-10 text-muted-stone hover:text-inkwell" asChild>
          <Link href="/dashboard">← Cancel and go back</Link>
        </Button>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────

  if (!document) {
    return (
      <div className="h-screen p-8 flex flex-col items-center justify-center bg-canvas-parchment">
        <h1 className="text-2xl font-semibold mb-4 text-deep-shadow">Paper not found.</h1>
        <Button asChild variant="outline"><Link href="/dashboard">Back to Dashboard</Link></Button>
      </div>
    );
  }

  // ── Analysis missing ─────────────────────────────────────────────────────────

  if (!analysis && document?.status === "completed") {
    return (
      <DashboardLayout>
        <div className="h-[70vh] flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 bg-pebble-gray/30 text-muted-stone rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-[24px] font-semibold text-deep-shadow mb-3">Analysis not found.</h2>
          <p className="text-muted-stone max-w-md mb-8 leading-[1.7] text-[15px]">
            We couldn't find the results for this paper. Try running the analysis again.
          </p>
          <Button className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92" onClick={handleAnalyse} disabled={analyseDocMutation.isPending}>
            {analyseDocMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Run analysis
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // ── Uploaded / pending ───────────────────────────────────────────────────────

  if (document?.status === "uploaded") {
    return (
      <DashboardLayout>
        <div className="h-[70vh] flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-[24px] font-semibold text-deep-shadow mb-3">Ready to analyse.</h2>
          <p className="text-muted-stone max-w-md mb-8 leading-[1.7] text-[15px]">
            Your paper has been uploaded. Start the analysis to get a plain-English explanation.
          </p>
          <Button className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92" onClick={handleAnalyse}>
            Start analysis
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // ── Main workspace ───────────────────────────────────────────────────────────

  const viewAnalysis = (analysis ?? null) as ViewAnalysis | null;
  const editorialView = viewAnalysis?.editorialView;
  const primarySummary = viewAnalysis?.primarySummary;
  const suggestedQuestions =
    editorialView?.questionsWorthAsking ??
    primarySummary?.suggestedQuestions ??
    viewAnalysis?.suggestedQuestions ??
    [];
  const editorialFindings = editorialView?.findings ?? [];
  const trustNarrative = editorialView?.trustNarrative ?? primarySummary?.trustSignal?.summary ?? "";
  const deeperDive = editorialView?.deeperDive;

  const deeperDiveSections = [
    { title: deeperDive?.howDesignedTitle, body: deeperDive?.howDesignedBody },
    { title: deeperDive?.cantTellUsTitle, body: deeperDive?.cantTellUsBody },
    { title: deeperDive?.biggerPictureTitle, body: deeperDive?.biggerPictureBody },
    { title: deeperDive?.technicallyCuriousTitle, body: deeperDive?.technicallyCuriousBody },
  ].filter((item) => (item.title?.length ?? 0) > 8 && (item.body?.length ?? 0) > 30);

  const confLevel = viewAnalysis?.confidenceLevel;
  const confLabel = confLevel ? `${capitalise(confLevel)} confidence` : null;
  const claimType = viewAnalysis?.whatPaperActuallyShows?.claimType ?? "";
  const claimLabel = CLAIM_TYPE_LABELS[claimType] ?? claimType;
  const keyFindings = viewAnalysis?.keyFindings ?? [];
  const findingEvidence = useMemo(
    () =>
      editorialFindings
        .map((finding, index) => {
          const candidatePool = index < keyFindings.length ? [keyFindings[index], ...keyFindings.filter((_, itemIndex) => itemIndex !== index)] : keyFindings;
          return pickBestEvidence(
            finding,
            candidatePool.filter(Boolean) as NonNullable<ViewAnalysis["keyFindings"]>,
            viewAnalysis?.whatPaperActuallyShows?.studyType || viewAnalysis?.evidenceQuality?.studyType,
            confLevel,
          );
        }),
    [editorialFindings, keyFindings, viewAnalysis?.whatPaperActuallyShows?.studyType, viewAnalysis?.evidenceQuality?.studyType, confLevel],
  );
  const questionEvidence = useMemo(
    () =>
      ((questions as ViewQuestion[] | undefined) ?? []).map((question) => ({
        id: question.id,
        evidence: buildQuestionEvidence(
          question.question,
          question.answer,
          keyFindings,
          viewAnalysis?.whatPaperActuallyShows?.studyType || viewAnalysis?.evidenceQuality?.studyType,
          confLevel,
        ),
      })),
    [questions, keyFindings, viewAnalysis?.whatPaperActuallyShows?.studyType, viewAnalysis?.evidenceQuality?.studyType, confLevel],
  );
  const allEvidence = useMemo(
    () => [
      ...findingEvidence.filter(Boolean) as GroundedEvidence[],
      ...questionEvidence.flatMap((item) => item.evidence),
    ],
    [findingEvidence, questionEvidence],
  );
  const activeEvidence = allEvidence.find((item) => item.id === activeEvidenceId) ?? null;

  useEffect(() => {
    if (!activeEvidenceId && findingEvidence[0]) {
      setActiveEvidenceId(findingEvidence[0].id);
    }
  }, [activeEvidenceId, findingEvidence]);

  return (
    <DashboardLayout immersive>
      <div className="h-screen flex flex-col bg-canvas-parchment overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-pebble-gray flex items-center justify-between px-5 bg-white/60 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/dashboard" className="text-muted-stone hover:text-inkwell transition-colors shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <p className="text-[14px] text-muted-stone truncate max-w-[40ch]">{document.title}</p>
                <Badge variant="outline" className="bg-white/80 border-pebble-gray text-[10px] uppercase tracking-[0.12em] py-0.5 shrink-0 hidden sm:flex">
                  {document.documentType || "Research Paper"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {document.status === "completed" && (
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button
                  variant={showChat ? "default" : "secondary"}
                  size="sm"
                  className="gap-2.5 shadow-subtle border"
                  onClick={() => setShowChat(!showChat)}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">{showChat ? "Hide chat" : "Ask questions"}</span>
                </Button>
              </motion.div>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-stone" asChild>
              <Link href="/settings"><Settings className="w-4 h-4" /></Link>
            </Button>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1 min-h-0"
          onLayout={(sizes) => {
            localStorage.setItem("clarity-source-panel-size", String(sizes[0]));
            setSourcePanelSize(sizes[0]);
          }}
        >
          {/* Left: source pane */}
          <ResizablePanel defaultSize={sourcePanelSize} minSize={25} maxSize={60}>
            <SourcePane
              fallbackTitle={document.title}
              metadata={viewAnalysis?.paperMetadata}
              extractedText={document.extractedText}
              activeEvidence={activeEvidence}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: analysis column */}
          <ResizablePanel defaultSize={100 - sourcePanelSize} minSize={40}>
            <ScrollArea className="h-full bg-white">
            <div className="px-10 py-12">
              {analysisLoading ? (
                <AnalysisSkeleton />
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-10"
                  >
                    <PaperCitation metadata={viewAnalysis?.paperMetadata} />

                    {/* Hook + orientation */}
                    <motion.header
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="space-y-5"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="inline-flex items-center gap-2 text-muted-stone">
                          <Zap className="w-3.5 h-3.5 fill-current text-goldenrod-accent" />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em]">Clarity Analysis</span>
                        </div>
                        {confLabel && (
                          <div className={cn(
                            "flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full border-l-[3px] border",
                            trustPillClasses(confLevel)
                          )}>
                            {confLabel}
                          </div>
                        )}
                      </div>
                      <h2 className="text-[24px] md:text-[28px] font-semibold tracking-tight text-deep-shadow leading-[1.22] selection:bg-highlight-beige selection:text-inkwell">
                        {editorialView?.openingHook}
                      </h2>
                      <p className="text-[17px] leading-[1.75] text-muted-stone font-normal selection:bg-highlight-beige/30">
                        {editorialView?.orientation}
                      </p>
                    </motion.header>

                    {hasItems(allEvidence) && (
                      <section className="rounded-[24px] border border-pebble-gray bg-canvas-parchment/45 p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-muted-stone">
                              <ShieldCheck className="h-4 w-4 text-forest-green-action" />
                              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Visible grounding</span>
                            </div>
                            <p className="max-w-2xl text-[14px] leading-[1.75] text-inkwell/76">
                              Click any finding or supporting card and Clarity will anchor the exact passage in the source pane.
                            </p>
                          </div>
                          {activeEvidence && (
                            <div className="rounded-[18px] border border-goldenrod-accent/25 bg-white/80 px-4 py-3 shadow-subtle md:max-w-sm">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-goldenrod-accent">Current anchor</p>
                              <p className="mt-1 text-[13px] font-medium leading-[1.65] text-deep-shadow">{activeEvidence.title}</p>
                              <p className="mt-1 text-[12px] leading-[1.65] text-muted-stone">{activeEvidence.sourceLabel}</p>
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {/* Findings */}
                    {hasItems(editorialFindings) && (
                      <section className="space-y-8 pt-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-stone border-b border-pebble-gray pb-4">
                          What they found
                        </h3>
                        <div className="space-y-10">
                          {editorialFindings.map((finding, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.25, delay: idx * 0.08, ease: "easeOut" }}
                              className="space-y-3"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  const evidence = findingEvidence[idx];
                                  if (evidence) setActiveEvidenceId(evidence.id);
                                }}
                                className={cn(
                                  "w-full rounded-[22px] border px-5 py-5 text-left transition-all duration-200",
                                  findingEvidence[idx] && activeEvidenceId === findingEvidence[idx]?.id
                                    ? "border-goldenrod-accent/30 bg-[#fffaf0] shadow-[0_28px_80px_-48px_rgba(20,20,20,0.45)]"
                                    : "border-transparent hover:border-pebble-gray hover:bg-canvas-parchment/45",
                                )}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="space-y-2.5">
                                    <h4 className="text-[16px] font-semibold text-deep-shadow tracking-tight leading-snug">
                                      {finding.heading}
                                    </h4>
                                    <p className="text-[15px] leading-[1.8] text-inkwell/85">{finding.body}</p>
                                  </div>
                                  {findingEvidence[idx] && (
                                    <div className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", supportTypeClasses(findingEvidence[idx]!.supportType))}>
                                      {supportTypeLabel(findingEvidence[idx]!.supportType)}
                                    </div>
                                  )}
                                </div>
                              </button>

                              {findingEvidence[idx] && (
                                <EvidenceCard
                                  evidence={findingEvidence[idx]!}
                                  isActive={activeEvidenceId === findingEvidence[idx]!.id}
                                  onActivate={(evidence) => setActiveEvidenceId(evidence.id)}
                                />
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Trust */}
                    {hasMeaningfulText(trustNarrative) && (
                      <motion.section
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: 0.28, ease: "easeOut" }}
                        className="rounded-[24px] border border-pebble-gray bg-canvas-parchment/40 p-7 space-y-5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-inkwell text-canvas-parchment rounded-xl shrink-0">
                            <Info className="w-4 h-4" />
                          </div>
                          <h3 className="text-[17px] font-semibold tracking-tight text-deep-shadow">
                            How much should you trust this?
                          </h3>
                        </div>
                        <p className="text-[15px] leading-[1.8] text-inkwell/80 font-serif italic">
                          {trustNarrative}
                        </p>
                        <Separator className="bg-pebble-gray" />
                        <div className="grid sm:grid-cols-2 gap-5">
                          <div>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone block mb-1.5">
                              Study Quality
                            </span>
                            <p className="text-[14px] font-medium text-deep-shadow">
                              {viewAnalysis?.trustRating?.rating || "—"} Evidence
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-stone block mb-1.5">
                              Recommendation
                            </span>
                            <p className="text-[14px] font-medium text-deep-shadow">
                              {viewAnalysis?.practicalUse?.recommendation || "—"}
                            </p>
                          </div>
                        </div>
                      </motion.section>
                    )}

                    {/* Suggested questions */}
                    {hasItems(suggestedQuestions) && (
                      <motion.section
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: 0.34, ease: "easeOut" }}
                        className="space-y-5"
                      >
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-stone border-b border-pebble-gray pb-4">
                          Questions worth asking
                        </h3>
                        <div className="grid gap-2.5">
                          {suggestedQuestions.map((question, i) => {
                            const asked = askedSet.has(question);
                            return (
                              <motion.button
                                key={`${question}-${i}`}
                                type="button"
                                onClick={() => submitSuggestedQuestion(question)}
                                disabled={askMutation.isPending || asked}
                                whileHover={{ backgroundColor: "rgba(38,37,16,0.04)" }}
                                whileTap={{ scale: 0.98 }}
                                transition={{ duration: 0.15 }}
                                className={cn(
                                  "rounded-[16px] border bg-white p-4 text-left shadow-subtle transition-colors flex items-center justify-between gap-4 group",
                                  asked
                                    ? "border-forest-green-action/30 bg-forest-green-action/5"
                                    : "border-pebble-gray hover:border-inkwell/30 disabled:opacity-60"
                                )}
                              >
                                <span className="text-[14px] font-medium text-deep-shadow leading-[1.6]">{question}</span>
                                {asked ? (
                                  <CheckCircle2 className="w-4 h-4 text-forest-green-action shrink-0" />
                                ) : (
                                  <MessageSquare className="w-4 h-4 text-muted-stone group-hover:text-inkwell transition-colors shrink-0" />
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      </motion.section>
                    )}

                    {/* Deep dive */}
                    {deeperDiveSections.length > 0 && (
                      <motion.section
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: 0.4, ease: "easeOut" }}
                        className="space-y-5 pt-2"
                      >
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-stone border-b border-pebble-gray pb-4">
                          Want to go deeper?
                        </h3>
                        <Accordion type="single" collapsible className="w-full space-y-2.5">
                          {deeperDiveSections.map((item, idx) => (
                            <AccordionItem
                              key={idx}
                              value={`item-${idx}`}
                              className="border border-pebble-gray rounded-[18px] px-5 bg-pebble-gray/5 overflow-hidden shadow-sm"
                            >
                              <AccordionTrigger className="text-[15px] font-semibold text-deep-shadow hover:no-underline py-4">
                                {item.title}
                              </AccordionTrigger>
                              <AccordionContent className="text-[14px] leading-[1.8] text-inkwell/80 pb-5">
                                {item.body}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </motion.section>
                    )}

                    {/* Research profile */}
                    <section className="p-7 rounded-[24px] border border-pebble-gray bg-onyx-outline/5 space-y-5">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-muted-stone" />
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-stone">Research Profile</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-x-10 gap-y-5">
                        {viewAnalysis?.whatPaperActuallyShows?.studyType && (
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-stone/60 mb-1.5">Study Type</span>
                            <p className="text-[13px] font-semibold text-deep-shadow">{viewAnalysis.whatPaperActuallyShows.studyType}</p>
                          </div>
                        )}
                        {viewAnalysis?.evidenceQuality?.sampleSize && (
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-stone/60 mb-1.5">Sample Size</span>
                            <p className="text-[13px] font-semibold text-deep-shadow">{viewAnalysis.evidenceQuality.sampleSize}</p>
                          </div>
                        )}
                        {viewAnalysis?.whatPaperActuallyShows?.outcomesMeasured && (
                          <div className="col-span-2">
                            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-stone/60 mb-1.5">Main Outcome</span>
                            <p className="text-[13px] font-semibold text-deep-shadow leading-relaxed">{viewAnalysis.whatPaperActuallyShows.outcomesMeasured}</p>
                          </div>
                        )}
                        {claimLabel && (
                          <div className="col-span-2">
                            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-stone/60 mb-1.5">Claim Type</span>
                            <Badge variant="outline" className="mt-0.5 border-pebble-gray text-muted-stone font-medium text-[12px]">
                              {claimLabel}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Disclaimer */}
                    {hasText(viewAnalysis?.disclaimer) && (
                      <section className="pt-8 border-t border-pebble-gray opacity-55">
                        <p className="text-[12px] text-muted-stone leading-[1.8] text-center max-w-xl mx-auto">
                          {viewAnalysis!.disclaimer}
                        </p>
                      </section>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>

          {/* Chat panel — sits alongside the resizable group, slides in from the right */}
          <AnimatePresence>
            {showChat && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 380, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="shrink-0 border-l border-pebble-gray bg-canvas-parchment flex flex-col overflow-hidden"
                style={{ minWidth: 0 }}
              >
                <div className="px-5 py-3 border-b border-pebble-gray bg-pebble-gray/10 flex items-center justify-between shrink-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-deep-shadow">
                      <MessageSquare className="w-4 h-4" />
                      Research Q&A
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em]">
                      <span className="rounded-full border border-forest-green-action/20 bg-forest-green-action/6 px-2.5 py-1 font-semibold text-forest-green-action">[doc]</span>
                      <span className="text-muted-stone">grounded in this paper</span>
                      <span className="rounded-full border border-pebble-gray bg-pebble-gray/60 px-2.5 py-1 font-semibold text-muted-stone">[general]</span>
                      <span className="text-muted-stone">background context</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowChat(false)} className="h-8 w-8 rounded-lg hover:bg-pebble-gray/60">
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <ScrollArea className="flex-1 bg-pebble-gray/5">
                  <div className="space-y-6 p-5">
                    {questions?.length === 0 && (
                      <div className="text-center py-16 opacity-60">
                        <MessageSquare className="w-10 h-10 mx-auto mb-4 opacity-20" />
                        <p className="text-[15px] font-semibold mb-1.5 text-deep-shadow">Ask a question</p>
                        <p className="text-[13px] text-muted-stone max-w-[24ch] mx-auto leading-[1.65]">
                          Use the findings and methodology as context for targeted follow-ups.
                        </p>
                      </div>
                    )}
                    {(questions as ViewQuestion[] | undefined)?.map((q) => (
                      <QuestionAnswerCard
                        key={q.id}
                        question={q.question}
                        answer={q.answer}
                        supportingEvidence={questionEvidence.find((item) => item.id === q.id)?.evidence ?? []}
                        activeEvidenceId={activeEvidenceId}
                        onActivateEvidence={(evidence) => setActiveEvidenceId(evidence.id)}
                      />
                    ))}
                    {pendingQuestion && (
                      <div className="flex justify-end">
                        <div className="bg-inkwell text-canvas-parchment px-4 py-3 rounded-2xl max-w-[88%] text-[14px] leading-[1.6] shadow-subtle">
                          {pendingQuestion}
                        </div>
                      </div>
                    )}
                    {askMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="bg-pebble-gray/20 px-5 py-3.5 rounded-2xl border border-pebble-gray flex items-center gap-1.5">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="w-1.5 h-1.5 rounded-full bg-muted-stone"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                </ScrollArea>

                <div className="p-4 border-t border-pebble-gray bg-white shrink-0">
                  <form onSubmit={handleAsk} className="relative">
                    <input
                      type="text"
                      value={chatQuestion}
                      onChange={(e) => setChatQuestion(e.target.value)}
                      placeholder="Ask a question about this paper..."
                      className="w-full rounded-2xl border border-muted-stone bg-pebble-gray/10 py-3 pl-4 pr-12 outline-none focus:border-inkwell transition-all text-[14px] placeholder:text-muted-stone/50"
                      disabled={askMutation.isPending}
                    />
                    <motion.div className="absolute right-2 top-1.5" whileTap={{ scale: 0.93 }}>
                      <Button
                        type="submit"
                        size="icon"
                        variant="ghost"
                        disabled={askMutation.isPending || !chatQuestion.trim()}
                        className="h-9 w-9 rounded-xl hover:bg-pebble-gray/60 group"
                      >
                        <Send className="w-4 h-4 group-hover:text-onyx-outline group-hover:translate-x-0.5 transition-all" />
                      </Button>
                    </motion.div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>

  );
}
