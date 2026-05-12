import React from "react";
import type { SearchSessionMessage } from "@/lib/search-types";
import { History, ChevronDown, ChevronUp } from "lucide-react";

interface ResearchTrailProps {
  messages: SearchSessionMessage[];
  originalQuery: string;
}

function formatActionLabel(message: SearchSessionMessage): string {
  if (message.role === "user") {
    return "You asked";
  }
  
  switch (message.kind) {
    case "answer":
      return "Clarity responded";
    case "clarification":
      return "Clarity asked";
    case "canvas_update":
      if (message.metadata?.retrievalMode === "focused_retrieval") {
        return "Focused retrieval";
      }
      return "Canvas updated";
    default:
      return "Note";
  }
}

export function ResearchTrail({ messages, originalQuery }: ResearchTrailProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  // Build trail items from messages
  const trailItems: Array<{ type: "start" | "message"; label: string; content: string; timestamp?: string }> = [
    { type: "start", label: "Started with", content: originalQuery }
  ];
  
  // Add relevant message pairs
  messages.forEach((message) => {
    if (message.role === "user") {
      trailItems.push({
        type: "message",
        label: formatActionLabel(message),
        content: message.content,
        timestamp: message.createdAt
      });
    } else if (message.role === "assistant" && message.kind === "canvas_update") {
      trailItems.push({
        type: "message",
        label: formatActionLabel(message),
        content: message.content,
        timestamp: message.createdAt
      });
    }
  });

  if (trailItems.length <= 1) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-pebble-gray/70 bg-white/40 p-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-stone" />
          <span className="text-[13px] font-medium text-deep-shadow">
            Exploration trail
          </span>
          <span className="text-[11px] text-muted-stone">
            ({trailItems.length} step{trailItems.length !== 1 ? "s" : ""})
          </span>
        </div>
        <span className="text-muted-stone">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-pebble-gray/50 space-y-3">
          {trailItems.map((item, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-pebble-gray/50 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] text-muted-stone font-medium">
                  {index + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-stone uppercase tracking-wide">
                  {item.label}
                </p>
                <p className="text-[13px] text-deep-shadow leading-relaxed mt-0.5">
                  {item.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
