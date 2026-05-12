import React, { useState, useRef, useEffect } from "react";
import type { SearchResult, SearchSessionMessage, RankedPaper } from "@/lib/search-types";
import { SynthesisAnswer } from "./SynthesisAnswer";
import { SynthesisSkeleton } from "./SynthesisSkeleton";
import { CompactEvidence } from "./CompactEvidence";
import { PaperCard } from "./PaperCard";
import { FollowUpOptions } from "./FollowUpOptions";
import { MainRefineInput } from "./MainRefineInput";
import { User, Bot, FileText } from "lucide-react";

interface ChatCanvasProps {
  result: SearchResult;
  messages: SearchSessionMessage[];
  onFollowUp: (query: string) => void;
  onRefine?: (content: string) => Promise<void>;
  isRefining?: boolean;
  synthesisLoading?: boolean;
}

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
  isFirst = false 
}: { 
  result: SearchResult; 
  onFollowUp: (query: string) => void;
  isFirst?: boolean;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showPapers, setShowPapers] = useState(false);

  // Only show first 2 papers by default
  const displayPapers = showPapers ? result.papers : result.papers.slice(0, 2);

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
        </div>

        {/* Papers referenced inline */}
        {result.papers.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowPapers(!showPapers)}
              className="flex items-center gap-2 text-[12px] text-muted-stone hover:text-deep-shadow transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              {showPapers ? "Hide papers" : `Show ${result.papers.length} papers`}
            </button>
            
            {showPapers && (
              <div className="space-y-3 pl-4 border-l-2 border-pebble-gray/30">
                {displayPapers.map((paper, idx) => (
                  <PaperCard 
                    key={paper.externalId} 
                    paper={paper} 
                    index={idx}
                    displayGroup={paper.evidenceBucket === "strongest" ? "start" : "background"}
                    showFraming={idx < 2}
                  />
                ))}
                {result.papers.length > 2 && !showPapers && (
                  <button
                    onClick={() => setShowPapers(true)}
                    className="text-[12px] text-onyx-outline hover:text-deep-shadow"
                  >
                    + {result.papers.length - 2} more papers
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Follow-up suggestions */}
        {isFirst && result.followUpOptions.length > 0 && (
          <FollowUpOptions
            options={result.followUpOptions}
            onSelect={onFollowUp}
          />
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

export function ChatCanvas({ 
  result, 
  messages,
  onFollowUp, 
  onRefine,
  isRefining = false,
  synthesisLoading = false 
}: ChatCanvasProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, result.synthesisText]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* First assistant message - the main synthesis */}
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
            
            // Assistant messages - could be simple text or full canvas updates
            if (message.kind === "canvas_update") {
              // For canvas updates, show as new rich message
              return (
                <AssistantMessage 
                  key={message.id}
                  result={result}
                  onFollowUp={onFollowUp}
                  isFirst={false}
                />
              );
            }
            
            // Simple answer or clarification
            return <SimpleAssistantMessage key={message.id} content={message.content} />;
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
  );
}
