import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLE_QUERIES = [
  "does creatine help with sleep deprivation?",
  "what does the evidence say about magnesium and sleep?",
  "is cold exposure useful or mostly hype?",
  "what do we actually know about fasting and cognition?",
  "tell me about meditation and anxiety",
];

interface SearchInputProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  initialQuery?: string;
}

export function SearchInput({ onSearch, isLoading, initialQuery }: SearchInputProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [query]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    onSearch(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleExample(example: string) {
    setQuery(example);
    textareaRef.current?.focus();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            "relative flex flex-col rounded-2xl border bg-white shadow-subtle transition-all",
            isLoading
              ? "border-onyx-outline/40"
              : "border-pebble-gray hover:border-onyx-outline/50 focus-within:border-onyx-outline",
          )}
        >
          <div className="flex items-start gap-3 p-4">
            <Search className="w-5 h-5 text-muted-stone mt-[3px] shrink-0" />
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Try a question, a claim you saw online, or a topic you want to understand..."
              disabled={isLoading}
              rows={2}
              className="flex-1 resize-none bg-transparent text-[16px] text-deep-shadow placeholder:text-muted-stone/60 focus:outline-none leading-relaxed disabled:opacity-60"
            />
          </div>
          <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-pebble-gray/50">
            <span className="text-[12px] text-muted-stone/70">
              Press Enter to explore, Shift+Enter for a new line
            </span>
            <Button
              type="submit"
              disabled={!query.trim() || isLoading}
              size="sm"
              className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92 h-8 px-4"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  Start exploring
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {!isLoading && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((example) => (
            <button
              key={example}
              onClick={() => handleExample(example)}
              className="text-[12px] text-muted-stone border border-pebble-gray rounded-lg px-3 py-1.5 hover:border-onyx-outline/50 hover:text-deep-shadow hover:bg-white transition-all text-left"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
