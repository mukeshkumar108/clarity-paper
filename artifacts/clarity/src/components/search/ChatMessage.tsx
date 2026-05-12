import React from "react";
import type { SearchSessionMessage } from "@/lib/search-types";
import { User, Bot } from "lucide-react";

interface ChatMessageProps {
  message: SearchSessionMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser 
          ? "bg-pebble-gray/60" 
          : "bg-onyx-outline/10"
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-muted-stone" />
        ) : (
          <Bot className="w-4 h-4 text-onyx-outline" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px] font-medium text-deep-shadow">
            {isUser ? "You" : "Clarity"}
          </span>
          <span className="text-[11px] text-muted-stone/60">
            {message.kind === "answer" && "· Answer"}
            {message.kind === "clarification" && "· Question"}
            {message.kind === "canvas_update" && "· Updated"}
          </span>
        </div>
        <div className={`rounded-2xl px-4 py-3 ${
          isUser 
            ? "bg-pebble-gray/30 border border-pebble-gray/50" 
            : "bg-white/60 border border-pebble-gray/70"
        }`}>
          <p className="text-[14px] text-deep-shadow leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  );
}
