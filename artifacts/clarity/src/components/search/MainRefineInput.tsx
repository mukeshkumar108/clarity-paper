import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";

interface MainRefineInputProps {
  onSubmit: (content: string) => Promise<void>;
  isSubmitting?: boolean;
  placeholder?: string;
}

export function MainRefineInput({ 
  onSubmit, 
  isSubmitting = false,
  placeholder = "Ask a follow-up or refine this exploration..." 
}: MainRefineInputProps) {
  const [draft, setDraft] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSubmitting) return;
    try {
      await onSubmit(trimmed);
      setDraft("");
    } catch {
      // Keep draft for retry
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="w-full resize-none rounded-2xl border border-pebble-gray bg-white px-4 py-3 pr-12 text-[14px] text-deep-shadow placeholder:text-muted-stone/65 focus:outline-none focus:border-onyx-outline/40 leading-relaxed"
          disabled={isSubmitting}
        />
        <Button
          type="submit"
          disabled={!draft.trim() || isSubmitting}
          size="sm"
          className="absolute right-3 bottom-3 h-8 w-8 p-0 bg-onyx-outline hover:bg-onyx-outline/90"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
      <p className="text-[11px] text-muted-stone leading-relaxed">
        You can ask about the current evidence, narrow the scope, or explore a specific angle.
      </p>
    </form>
  );
}
