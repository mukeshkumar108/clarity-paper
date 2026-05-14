import React, { useState, useRef, useEffect } from "react";
import type { SearchResult, SearchSessionMessage, RankedPaper } from "@/lib/search-types";
import { SynthesisAnswer } from "./SynthesisAnswer";
import { SynthesisSkeleton } from "./SynthesisSkeleton";
import { CompactEvidence } from "./CompactEvidence";
import { PaperCard } from "./PaperCard";
import { FollowUpOptions } from "./FollowUpOptions";
import { MainRefineInput } from "./MainRefineInput";
import { User, Bot, Sparkles, ScrollText } from "lucide-react";

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
}: {
  result: SearchResult;
  onFollowUp: (query: string) => void;
  isFirst?: boolean;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const recs = getRecommendedPapers(isFirst ? result.papers : []);

  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-canvas-parchment border border-pebble-gray flex items-center justify-center">
        <Bot className="w-4 h-4 text-onyx-outline" />
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {/* Main synthesis */}
        <div className="bg-white/60 border border-pebble-gray/70 rounded-2xl rounded-tl-sm px-4 py-3">
          <SynthesisAnswer
            synthesisText={result.synthesisText}
            confidence={result.confidence}
            noEvidence={result.noEvidence}
            query={result.query}
            coverageNote={result.coverageNote}
          />

          {/* Evidence inline */}
          <CompactEvidence
            snapshot={result.evidenceSnapshot}
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

        {/* Follow-up suggestions */}
        {isFirst && result.followUpOptions.length > 0 && (
          <FollowUpOptions options={result.followUpOptions} onSelect={onFollowUp} />
        )}
      </div>
    </div>
  );
}

function SimpleAssistantMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-canvas-parchment border border-pebble-gray flex items-center justify-center">
        <Bot className="w-4 h-4 text-onyx-outline" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-white/60 border border-pebble-gray/70 rounded-2xl rounded-tl-sm px-4 py-3">
          <p className="text-[14px] text-deep-shadow leading-relaxed">{content}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Paper sidebar ──────────────────────────────────────────────────────────────

function PapersSidebar({
  papers,
  messages,
  isFirstLoad,
}: {
  papers: RankedPaper[];
  messages: SearchSessionMessage[];
  isFirstLoad: boolean;
}) {
  const groups = computeTurnGroups(papers, messages);
  const recs = getRecommendedPapers(papers);

  if (papers.length === 0) return null;

  return (
    <div className="space-y-5 sticky top-4">
      {/* Recommended papers */}
      {recs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3 h-3 text-onyx-outline" />
            <span className="text-[12px] font-medium uppercase tracking-wider text-muted-stone">
              Start here
            </span>
          </div>
          <div className="space-y-2.5">
            {recs.map((paper, idx) => (
              <PaperCard
                key={paper.externalId}
                paper={paper}
                index={idx}
                displayGroup="start"
                showFraming={false}
              />
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
              <PaperCard
                key={paper.externalId}
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
            ))}
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <div className="space-y-2.5">
          {papers.map((paper, idx) => (
            <PaperCard
              key={paper.externalId}
              paper={paper}
              index={idx}
              displayGroup={paper.evidenceBucket === "strongest" ? "start" : "background"}
              showFraming={false}
            />
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 max-w-5xl mx-auto">
      {/* Left column: chat */}
      <div className="min-w-0 space-y-6">
        {/* First assistant message — the main synthesis */}
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
          <AssistantMessage
            result={result}
            onFollowUp={onFollowUp}
            isFirst={true}
          />
        )}

        {/* Subsequent conversation turns */}
        {messages.length > 0 && (
          <div className="space-y-6 pt-4 border-t border-pebble-gray/20">
            {messages.map((message) => {
              if (message.role === "user") {
                return <UserMessage key={message.id} content={message.content} />;
              }

              if (message.kind === "canvas_update") {
                return (
                  <AssistantMessage
                    key={message.id}
                    result={result}
                    onFollowUp={onFollowUp}
                    isFirst={false}
                  />
                );
              }

              return (
                <SimpleAssistantMessage key={message.id} content={message.content} />
              );
            })}
          </div>
        )}

        <div ref={messagesEndRef} />

        {/* Input */}
        {!synthesisLoading && onRefine && (
          <div className="pt-4">
            <MainRefineInput
              onSubmit={onRefine}
              isSubmitting={isRefining}
              placeholder="Ask a follow-up question..."
            />
          </div>
        )}
      </div>

      {/* Right column: persistent paper sidebar */}
      <div className="hidden lg:block">
        <PapersSidebar
          papers={result.papers}
          messages={messages}
          isFirstLoad={messages.length === 0}
        />
      </div>
    </div>
  );
}
