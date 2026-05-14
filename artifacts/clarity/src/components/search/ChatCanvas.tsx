import React, { useState, useRef, useEffect, useMemo } from "react";
import type { SearchResult, SearchSessionMessage, RankedPaper, EvidenceSpan } from "@/lib/search-types";
import { SynthesisAnswer } from "./SynthesisAnswer";
import { SynthesisSkeleton } from "./SynthesisSkeleton";
import { CompactEvidence } from "./CompactEvidence";
import { PaperCard } from "./PaperCard";
import { EvidencePanel } from "./EvidencePanel";
import { FollowUpOptions } from "./FollowUpOptions";
import { MainRefineInput } from "./MainRefineInput";
import { FilterChips, type EvidenceFilter } from "./FilterChips";
import { customFetch } from "@workspace/api-client-react";
import { User, Bot, Sparkles, ScrollText, Loader2, FileSearch } from "lucide-react";

interface DeepReadResult {
  title: string;
  briefSummary: string;
  plainEnglishSummary: string;
  keyFindings: Array<{ header: string; body: string }>;
  methodology: string;
  limitations: string;
  confidenceLevel: string;
}

interface ChatCanvasProps {
  result: SearchResult;
  messages: SearchSessionMessage[];
  onFollowUp: (query: string) => void;
  onRefine?: (content: string) => Promise<void>;
  isRefining?: boolean;
  synthesisLoading?: boolean;
}

// ─── Paper sidebar helpers ──────────────────────────────────────────────────────

interface TurnGroup {
  label: string;
  turnIndex: number; // 0 = original, 1+ = follow-up turns
  papers: RankedPaper[];
  isNew?: boolean; // true for the most recent turn
}

function computeTurnGroups(
  papers: RankedPaper[],
  messages: SearchSessionMessage[],
): TurnGroup[] {
  const groups: TurnGroup[] = [];

  // Turn 0: original papers (those not added by any follow-up)
  const addedInFollowUps = new Set<string>();
  const turnLabels: Array<{ turnIndex: number; label: string }> = [];

  messages.forEach((message, idx) => {
    if (message.metadata?.retrievalDelta?.newPaperIds) {
      const turnIndex = turnLabels.length + 1;
      message.metadata.retrievalDelta.newPaperIds.forEach((id) =>
        addedInFollowUps.add(id),
      );
      // Derive label from the preceding user message
      const prevUserMsg = messages
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === "user");
      const shortLabel = prevUserMsg
        ? prevUserMsg.content.slice(0, 60).trim()
        : `Turn ${turnIndex}`;
      turnLabels.push({ turnIndex, label: `Added: "${shortLabel}${prevUserMsg && prevUserMsg.content.length > 60 ? "…" : ""}"` });
    }
  });

  // Turn 0: original papers
  const originalPapers = papers.filter(
    (p) => !addedInFollowUps.has(p.externalId),
  );
  if (originalPapers.length > 0) {
    groups.push({
      label: "Original evidence",
      turnIndex: 0,
      papers: originalPapers,
    });
  }

  // Turns 1+: papers added by follow-ups
  // Re-collect per turn from messages to preserve order
  let currentTurnPapers: Map<number, RankedPaper[]> = new Map();
  messages.forEach((message) => {
    if (message.metadata?.retrievalDelta?.newPaperIds) {
      const ids = new Set(message.metadata.retrievalDelta.newPaperIds);
      const turnPapers = papers.filter((p) => ids.has(p.externalId));
      // Use the turn index from labels (offset by turn 0)
      const turnIdx = currentTurnPapers.size + 1;
      if (turnPapers.length > 0) {
        currentTurnPapers.set(turnIdx, turnPapers);
      }
    }
  });

  const labelIdx = 0;
  let labelCounter = 0;
  currentTurnPapers.forEach((turnPapers, turnIdx) => {
    const label =
      labelCounter < turnLabels.length
        ? turnLabels[labelCounter].label
        : `Turn ${turnIdx}`;
    groups.push({
      label,
      turnIndex: turnIdx,
      papers: turnPapers,
      isNew: turnIdx === currentTurnPapers.size, // last turn is newest
    });
    labelCounter++;
  });

  return groups;
}

function getRecommendedPapers(papers: RankedPaper[]): RankedPaper[] {
  return papers
    .filter(
      (p) =>
        p.evidenceFit?.overall === "direct" &&
        (p.studyDesign === "meta_analysis" ||
          p.studyDesign === "systematic_review" ||
          p.studyDesign === "rct"),
    )
    .slice(0, 2);
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3 justify-end">
      <div className="flex-1 max-w-[85%]">
        <div className="bg-onyx-outline text-white rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-[14px] leading-relaxed">{content}</p>
        </div>
      </div>
      <div className="shrink-0 w-8 h-8 rounded-full bg-onyx-outline flex items-center justify-center">
        <User className="w-4 h-4 text-white" />
      </div>
    </div>
  );
}

function AssistantMessage({
  result,
  onFollowUp,
  isFirst = false,
  overrideText,
  followUpOptions,
  evidenceSnapshot,
}: {
  result: SearchResult;
  onFollowUp: (query: string) => void;
  isFirst?: boolean;
  overrideText?: string;
  followUpOptions?: string[];
  evidenceSnapshot?: SearchResult["evidenceSnapshot"];
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const recs = getRecommendedPapers(isFirst ? result.papers : []);
  const text = overrideText ?? result.synthesisText;
  const options = followUpOptions ?? (isFirst ? result.followUpOptions : []);
  const snapshot = evidenceSnapshot ?? result.evidenceSnapshot;

  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-canvas-parchment border border-pebble-gray flex items-center justify-center">
        <Bot className="w-4 h-4 text-onyx-outline" />
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {/* Main synthesis */}
        <div className="bg-white/60 border border-pebble-gray/70 rounded-2xl rounded-tl-sm px-4 py-3">
          <SynthesisAnswer
            synthesisText={text}
            confidence={result.confidence}
            noEvidence={result.noEvidence}
            query={result.query}
            coverageNote={result.coverageNote}
            label={isFirst ? "First read" : "Response"}
          />

          {/* Evidence inline */}
          <CompactEvidence
            snapshot={snapshot}
            spans={result.evidenceSpans}
            coverageNote={result.coverageNote}
            isExpanded={showEvidence}
            onToggle={() => setShowEvidence(!showEvidence)}
          />

          {/* Recommended papers — shown inline for first message only */}
          {isFirst && recs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-pebble-gray/20">
              <div className="flex items-center gap-1.5 text-[12px] text-muted-stone mb-2">
                <Sparkles className="w-3 h-3" />
                <span>Papers I'd start with</span>
              </div>
              <div className="space-y-2">
                {recs.map((paper, idx) => (
                  <div
                    key={paper.externalId}
                    className="text-[13px] text-deep-shadow leading-relaxed"
                  >
                    <span className="font-medium">{paper.title}</span>
                    {paper.plainSummary && (
                      <span className="text-muted-stone">
                        {" "}
                        — {paper.plainSummary}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Follow-up suggestions — shown on every turn that has options */}
        {options.length > 0 && (
          <FollowUpOptions options={options} onSelect={onFollowUp} />
        )}
      </div>
    </div>
  );
}

// ─── Paper sidebar ──────────────────────────────────────────────────────────────

function PapersSidebar({
  papers,
  messages,
  evidenceSpans,
}: {
  papers: RankedPaper[];
  messages: SearchSessionMessage[];
  evidenceSpans: EvidenceSpan[];
}) {
  const groups = computeTurnGroups(papers, messages);
  const recs = getRecommendedPapers(papers);
  const [showEvidence, setShowEvidence] = useState(false);
  const [expandedPaper, setExpandedPaper] = useState<RankedPaper | null>(null);
  const [deepReadResult, setDeepReadResult] = useState<DeepReadResult | null>(null);
  const [deepReadLoading, setDeepReadLoading] = useState(false);

  // Expanded paper detail view
  if (expandedPaper) {
    return (
      <div className="space-y-4 sticky top-4">
        <button
          onClick={() => setExpandedPaper(null)}
          className="text-[11px] font-medium text-muted-stone hover:text-deep-shadow flex items-center gap-1"
        >
          ← Back to papers
        </button>
        <div className="bg-white/60 border border-pebble-gray/70 rounded-xl p-4 space-y-3">
          <div>
            <h3 className="text-[14px] font-semibold text-deep-shadow leading-snug">
              {expandedPaper.title}
            </h3>
            <p className="text-[12px] text-muted-stone mt-1">
              {expandedPaper.authors.slice(0, 3).join(", ")}
              {expandedPaper.authors.length > 3 ? " et al." : ""}
              {expandedPaper.year ? ` (${expandedPaper.year})` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              expandedPaper.evidenceBucket === "strongest"
                ? "bg-forest-green-action/10 text-forest-green-action"
                : expandedPaper.evidenceBucket === "mechanistic"
                  ? "bg-goldenrod-accent/10 text-goldenrod-accent"
                  : "bg-pebble-gray/40 text-muted-stone"
            }`}>
              {expandedPaper.evidenceBucket === "strongest" ? "Strong evidence" :
               expandedPaper.evidenceBucket === "human_observational" ? "Observational" :
               expandedPaper.evidenceBucket === "mechanistic" ? "Mechanistic" :
               expandedPaper.evidenceBucket === "conflicting" ? "Conflicting" : "Background"}
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-pebble-gray/40 text-muted-stone">
              {expandedPaper.studyDesign === "meta_analysis" ? "Meta-analysis" :
               expandedPaper.studyDesign === "systematic_review" ? "Systematic review" :
               expandedPaper.studyDesign === "rct" ? "RCT" :
               expandedPaper.studyDesign === "cohort" ? "Cohort" :
               expandedPaper.studyDesign === "cross_sectional" ? "Cross-sectional" :
               expandedPaper.studyDesign}
            </span>
            {expandedPaper.evidenceFit && (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                expandedPaper.evidenceFit.overall === "direct" ? "bg-forest-green-action/10 text-forest-green-action" :
                expandedPaper.evidenceFit.overall === "adjacent" ? "bg-goldenrod-accent/10 text-goldenrod-accent" :
                "bg-pebble-gray/40 text-muted-stone"
              }`}>
                {expandedPaper.evidenceFit.overall === "direct" ? "Direct fit" :
                 expandedPaper.evidenceFit.overall === "adjacent" ? "Adjacent" :
                 expandedPaper.evidenceFit.overall === "weak" ? "Weak fit" : "Mismatch"}
              </span>
            )}
          </div>

          {expandedPaper.plainSummary && (
            <p className="text-[13px] text-deep-shadow leading-relaxed">
              {expandedPaper.plainSummary}
            </p>
          )}

          <div className="text-[13px] text-deep-shadow leading-relaxed max-h-[300px] overflow-y-auto border-t border-pebble-gray/20 pt-3">
            {expandedPaper.abstract}
          </div>

          {/* Deep read: editorial review */}
          <div className="border-t border-pebble-gray/20 pt-3">
            {!deepReadResult && !deepReadLoading && (
              <button
                onClick={async () => {
                  setDeepReadLoading(true);
                  try {
                    const result = await customFetch<DeepReadResult>("/api/search/deep-read", {
                      method: "POST",
                      body: JSON.stringify({ abstract: expandedPaper.abstract, title: expandedPaper.title }),
                    });
                    setDeepReadResult(result);
                  } catch {
                    setDeepReadResult({ title: "", briefSummary: "Could not load deep read. Please try again.", plainEnglishSummary: "", keyFindings: [], methodology: "", limitations: "", confidenceLevel: "" });
                  } finally {
                    setDeepReadLoading(false);
                  }
                }}
                className="flex items-center gap-1.5 text-[12px] font-medium text-onyx-outline hover:text-deep-shadow transition-colors"
              >
                <FileSearch className="w-3.5 h-3.5" />
                Deep read — Clarity editorial review
              </button>
            )}
            {deepReadLoading && (
              <div className="flex items-center gap-2 text-[12px] text-muted-stone">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analysing paper...
              </div>
            )}
            {deepReadResult && (
              <div className="space-y-3">
                <p className="text-[13px] text-deep-shadow leading-relaxed font-medium">
                  {deepReadResult.plainEnglishSummary || deepReadResult.briefSummary}
                </p>
                {deepReadResult.keyFindings?.length > 0 && (
                  <div className="space-y-2">
                    {deepReadResult.keyFindings.slice(0, 3).map((f, i) => (
                      <div key={i}>
                        <p className="text-[12px] font-medium text-deep-shadow">{f.header}</p>
                        <p className="text-[12px] text-muted-stone leading-relaxed">{f.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                {deepReadResult.limitations && (
                  <p className="text-[12px] text-muted-stone leading-relaxed border-t border-pebble-gray/20 pt-2">
                    {deepReadResult.limitations}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-pebble-gray/20 text-[11px] text-muted-stone">
            {expandedPaper.doi && (
              <a
                href={`https://doi.org/${expandedPaper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-onyx-outline underline"
              >
                View source
              </a>
            )}
            {expandedPaper.openAccessPdfUrl && (
              <a
                href={expandedPaper.openAccessPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-onyx-outline underline"
              >
                Open access PDF
              </a>
            )}
            {expandedPaper.citationCount != null && (
              <span>{expandedPaper.citationCount} citations</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (papers.length === 0) return null;

  return (
    <div className="space-y-5 sticky top-4">
      {/* Evidence claims */}
      {evidenceSpans.length > 0 && (
        <div>
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-stone hover:text-deep-shadow w-full text-left"
          >
            <span>Claims &amp; evidence</span>
            <span className="text-muted-stone/50">({evidenceSpans.length})</span>
          </button>
          {showEvidence && (
            <div className="mt-2">
              <EvidencePanel spans={evidenceSpans} />
            </div>
          )}
        </div>
      )}

      {/* Recommended papers */}
      {recs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3 h-3 text-onyx-outline" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-stone">
              Start here
            </span>
          </div>
          <div className="space-y-2.5">
            {recs.map((paper, idx) => (
              <div
                key={paper.externalId}
                onClick={() => setExpandedPaper(paper)}
                className="cursor-pointer hover:ring-1 hover:ring-pebble-gray/50 rounded-lg transition-all"
              >
                <PaperCard
                  paper={paper}
                  index={idx}
                  displayGroup="start"
                  showFraming={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Turn groups */}
      {groups.map((group) => (
        <div key={`${group.turnIndex}-${group.label}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-stone">
              {group.label}
            </span>
            {group.isNew && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                NEW
              </span>
            )}
            <span className="text-[11px] text-muted-stone/60">
              ({group.papers.length})
            </span>
          </div>
          <div className="space-y-2.5">
            {group.papers.map((paper, idx) => (
              <div
                key={paper.externalId}
                onClick={() => setExpandedPaper(paper)}
                className="cursor-pointer hover:ring-1 hover:ring-pebble-gray/50 rounded-lg transition-all"
              >
                <PaperCard
                  paper={paper}
                  index={idx}
                  displayGroup={
                    paper.evidenceBucket === "strongest"
                      ? "start"
                      : paper.evidenceBucket === "mechanistic"
                        ? "early"
                        : "background"
                  }
                  showFraming={false}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <div className="space-y-2.5">
          {papers.map((paper, idx) => (
            <div
              key={paper.externalId}
              onClick={() => setExpandedPaper(paper)}
              className="cursor-pointer hover:ring-1 hover:ring-pebble-gray/50 rounded-lg transition-all"
            >
              <PaperCard
                paper={paper}
                index={idx}
                displayGroup={paper.evidenceBucket === "strongest" ? "start" : "background"}
                showFraming={false}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <ScrollText className="w-3 h-3 text-muted-stone/50" />
        <span className="text-[11px] text-muted-stone/50">
          {papers.length} papers total · abstracts only
        </span>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function ChatCanvas({
  result,
  messages,
  onFollowUp,
  onRefine,
  isRefining = false,
  synthesisLoading = false,
}: ChatCanvasProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, result.synthesisText]);

  // Filter state: client-side evidence-grade filter
  const [activeFilter, setActiveFilter] = useState<EvidenceFilter>("all");

  const { filteredPapers, filteredSnapshot } = useMemo(() => {
    if (activeFilter === "all") {
      return { filteredPapers: result.papers, filteredSnapshot: result.evidenceSnapshot };
    }

    let papers = result.papers;

    if (activeFilter === "rct_meta") {
      papers = papers.filter(
        (p) =>
          p.studyDesign === "meta_analysis" ||
          p.studyDesign === "systematic_review" ||
          p.studyDesign === "rct",
      );
    } else if (activeFilter === "human_only") {
      papers = papers.filter(
        (p) =>
          p.populationType === "human" || p.populationType === "unknown",
      );
    }

    // Recalculate snapshot from filtered papers
    const snapshot = {
      metaAnalyses: papers.filter((p) => p.studyDesign === "meta_analysis" || p.studyDesign === "systematic_review").length,
      rcts: papers.filter((p) => p.studyDesign === "rct").length,
      humanObservational: papers.filter((p) => p.evidenceBucket === "human_observational").length,
      mechanistic: papers.filter((p) => p.evidenceBucket === "mechanistic").length,
      conflicting: papers.filter((p) => p.evidenceBucket === "conflicting").length,
      totalPapers: papers.length,
      overallConfidence: result.evidenceSnapshot.overallConfidence,
    };

    return { filteredPapers: papers, filteredSnapshot: snapshot };
  }, [result.papers, activeFilter, result.evidenceSnapshot]);

  // Build a uniform message list: initial synthesis + subsequent turns
  const allMessages: Array<{
    role: "user" | "assistant";
    content: string;
    kind?: string;
    isFirst?: boolean;
    followUpOptions?: string[];
  }> = [];

  // Add initial synthesis as message[0] if we have it
  const initialSynthesisMsg = messages.find(m => m.kind === "synthesis");
  if (!synthesisLoading) {
    allMessages.push({
      role: "assistant",
      content: initialSynthesisMsg?.content ?? result.synthesisText,
      kind: "synthesis",
      isFirst: true,
      followUpOptions: result.followUpOptions,
    });
  }

  // Add subsequent messages (skip the synthesis message we already handled)
  for (const message of messages) {
    if (message.role === "user") {
      allMessages.push({ role: "user", content: message.content });
    } else if (message.kind !== "synthesis") {
      const msgMeta = message.metadata as any;
      allMessages.push({
        role: "assistant",
        content: message.content,
        kind: message.kind,
        followUpOptions: msgMeta?.followUpOptions,
      });
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8 max-w-5xl mx-auto">
      {/* Left column: chat */}
      <div className="min-w-0 space-y-6">
        {synthesisLoading ? (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-canvas-parchment border border-pebble-gray flex items-center justify-center">
              <Bot className="w-4 h-4 text-onyx-outline" />
            </div>
            <div className="flex-1">
              <div className="bg-white/60 border border-pebble-gray/70 rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-[13px] text-muted-stone mb-3">
                  Looking through the papers...
                </p>
                <SynthesisSkeleton />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {allMessages.map((message, idx) => {
              if (message.role === "user") {
                return <UserMessage key={`user-${idx}`} content={message.content} />;
              }

              const isFirst = message.isFirst === true;
              return (
                <AssistantMessage
                  key={`asst-${idx}`}
                  result={result}
                  onFollowUp={onFollowUp}
                  isFirst={isFirst}
                  overrideText={isFirst ? undefined : message.content}
                  followUpOptions={message.followUpOptions}
                  evidenceSnapshot={isFirst ? filteredSnapshot : undefined}
                />
              );
            })}
          </div>
        )}

        <div ref={messagesEndRef} />

        {/* Input */}
        {!synthesisLoading && onRefine && (
          <div className="pt-4 space-y-3">
            <FilterChips active={activeFilter} onChange={setActiveFilter} />
            <MainRefineInput
              onSubmit={onRefine}
              isSubmitting={isRefining}
              placeholder="Ask a follow-up question..."
            />
          </div>
        )}
      </div>

      {/* Right column: persistent paper sidebar */}
      <div className="hidden md:block">
        <PapersSidebar
          papers={filteredPapers}
          messages={messages}
          evidenceSpans={result.evidenceSpans}
        />
      </div>
    </div>
  );
}
