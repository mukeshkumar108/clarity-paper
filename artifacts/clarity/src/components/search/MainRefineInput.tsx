import React, { useState } from "react";
import { Loader2, ArrowUp } from "lucide-react";

interface MainRefineInputProps {
  onSubmit: (content: string) => void;
  isSubmitting?: boolean;
  placeholder?: string;
}

export function MainRefineInput({ 
  onSubmit, 
  isSubmitting = false,
  placeholder = "Ask about dosage, timing, or contradictions..." 
}: MainRefineInputProps) {
  const [draft, setDraft] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSubmitting) return;
    onSubmit(trimmed);
    setDraft("");
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-pebble-gray/60 bg-white/80 px-4 py-3 pr-12 text-[14px] text-deep-shadow placeholder:text-muted-stone/50 focus:outline-none focus:border-onyx-outline/30 focus:bg-white transition-all leading-relaxed"
        disabled={isSubmitting}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
      />
      <button
        type="submit"
        disabled={!draft.trim() || isSubmitting}
        className="absolute right-3 bottom-3 h-7 w-7 flex items-center justify-center rounded-md bg-onyx-outline/90 hover:bg-onyx-outline disabled:bg-pebble-gray/50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? (
          <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
        ) : (
          <ArrowUp className="w-3.5 h-3.5 text-white" />
        )}
      </button>
    </form>
  );
}
