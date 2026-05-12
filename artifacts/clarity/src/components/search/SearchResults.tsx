import React, { useState, useRef, useEffect } from "react";
import type { SearchResult, SearchSessionMessage } from "@/lib/search-types";
import { SynthesisAnswer } from "./SynthesisAnswer";
import { SynthesisSkeleton } from "./SynthesisSkeleton";
import { EvidenceBehindRead } from "./EvidenceBehindRead";
import { FollowUpOptions } from "./FollowUpOptions";
import { MainRefineInput } from "./MainRefineInput";
import { ChatMessage } from "./ChatMessage";
import { User, Bot } from "lucide-react";

interface SearchResultsProps {
  result: SearchResult;
  messages: SearchSessionMessage[];
  onFollowUp: (query: string) => void;
  onRefine?: (content: string) => Promise<void>;
  isRefining?: boolean;
  synthesisLoading?: boolean;
}

export function SearchResults({ 
  result, 
  messages,
  onFollowUp, 
  onRefine,
  isRefining = false,
  synthesisLoading = false 
}: SearchResultsProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [localInput, setLocalInput] = useState("");

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, result.synthesisText]);

  return (
    <div className="space-y-6">
      {/* Initial First Read - always at top */}
      <section>
        {synthesisLoading ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-pebble-gray/70 bg-fog-white px-4 py-3">
              <p className="text-[13px] text-muted-stone leading-relaxed">
                We've found some promising papers. Your first read is still coming together.
              </p>
            </div>
            <SynthesisSkeleton />
          </div>
        ) : (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-onyx-outline/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-onyx-outline" />
            </div>
            <div className="flex-1 min-w-0 space-y-4">
              <div className="bg-white/60 border border-pebble-gray/70 rounded-2xl px-4 py-3">
                <SynthesisAnswer
                  synthesisText={result.synthesisText}
                  confidence={result.confidence}
                  noEvidence={result.noEvidence}
                  query={result.query}
                  coverageNote={result.coverageNote}
                />
              </div>
              
              {/* Evidence behind this read */}
              <EvidenceBehindRead 
                snapshot={result.evidenceSnapshot} 
                spans={result.evidenceSpans}
                coverageNote={result.coverageNote}
              />

              {/* Follow-up chips */}
              {result.followUpOptions.length > 0 && (
                <FollowUpOptions
                  options={result.followUpOptions}
                  onSelect={onFollowUp}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Chat thread - stacked turns */}
      {messages.length > 0 && (
        <section className="space-y-6 border-t border-pebble-gray/30 pt-6">
          {messages.map((message, index) => {
            // Skip system messages or render them specially
            if (message.kind === "system") return null;
            
            return (
              <ChatMessage 
                key={`${message.id}-${index}`} 
                message={message} 
              />
            );
          })}
          <div ref={messagesEndRef} />
        </section>
      )}

      {/* Input area */}
      {!synthesisLoading && onRefine && (
        <section className="border-t border-pebble-gray/30 pt-6">
          <MainRefineInput 
            onSubmit={onRefine}
            isSubmitting={isRefining}
          />
        </section>
      )}
    </div>
  );
}
