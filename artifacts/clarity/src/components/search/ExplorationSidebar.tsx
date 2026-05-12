import React, { useState } from "react";
import type { SearchSessionMessage } from "@/lib/search-types";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X } from "lucide-react";

interface ExplorationSidebarProps {
  messages: SearchSessionMessage[];
  onSubmit: (content: string) => Promise<void>;
  isSubmitting?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

function kindLabel(message: SearchSessionMessage): string {
  switch (message.kind) {
    case "answer":
      return "Current results";
    case "clarification":
      return "Narrowing prompt";
    case "canvas_update":
      return message.metadata?.retrievalMode === "focused_retrieval"
        ? "Focused retrieval"
        : "Canvas update";
    case "system":
      return "Session note";
    default:
      return "Refinement";
  }
}

export function ExplorationSidebar({
  messages,
  onSubmit,
  isSubmitting = false,
  isOpen = false,
  onClose,
}: ExplorationSidebarProps) {
  const [draft, setDraft] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSubmitting) return;

    try {
      await onSubmit(trimmed);
      setDraft("");
    } catch {
      // Keep the draft in place so the user can retry or edit it.
    }
  }

  // If not in drawer mode (no onClose), render as regular aside
  if (!onClose) {
    return (
      <aside className="rounded-[28px] border border-pebble-gray/80 bg-white/75 backdrop-blur-sm shadow-subtle h-full min-h-[540px] flex flex-col overflow-hidden">
        <div className="border-b border-pebble-gray/70 px-5 py-4 space-y-1">
          <div className="flex items-center gap-2 text-deep-shadow">
            <Sparkles className="w-4 h-4 text-onyx-outline" />
            <h2 className="text-[15px] font-semibold">Refinement guide</h2>
          </div>
          <p className="text-[13px] text-muted-stone leading-relaxed">
            Clarify what you mean, narrow the evidence, or push this exploration
            toward a more specific scientific question.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-pebble-gray/70 bg-canvas-parchment/70 px-4 py-3">
              <p className="text-[13px] text-muted-stone leading-relaxed">
                Ask about the current evidence, narrow the scope, or introduce a
                specific angle like sleep outcomes, stronger study designs, or a
                comparison you want the canvas to explore.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className="rounded-2xl border border-pebble-gray/70 bg-canvas-parchment/65 px-4 py-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-stone">
                    {message.role === "user" ? "You" : "Clarity"}
                  </span>
                  <span className="text-[10px] text-muted-stone/70 uppercase tracking-[0.14em]">
                    {kindLabel(message)}
                  </span>
                </div>
                <p className="text-[13px] text-deep-shadow leading-relaxed">
                  {message.content}
                </p>
                {message.metadata?.canvasChanged && (
                  <p className="text-[11px] text-muted-stone leading-relaxed">
                    {message.metadata.retrievalMode === "focused_retrieval"
                      ? "Updated the canvas with a more targeted retrieval."
                      : "Updated the canvas by narrowing the current evidence."}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-pebble-gray/70 px-5 py-4 space-y-3"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="Try: only human RCTs, what about sleep, show me stronger evidence, or why is CBT stronger here?"
            className="w-full resize-none rounded-2xl border border-pebble-gray bg-white px-4 py-3 text-[14px] text-deep-shadow placeholder:text-muted-stone/65 focus:outline-none focus:border-onyx-outline leading-relaxed"
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-stone leading-relaxed">
              This rail stays tied to the current scientific canvas.
            </p>
            <Button
              type="submit"
              disabled={!draft.trim() || isSubmitting}
              className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Updating…
                </>
              ) : (
                "Refine exploration"
              )}
            </Button>
          </div>
        </form>
      </aside>
    );
  }

  // Drawer mode
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
      
      {/* Drawer */}
      <aside 
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="border-b border-pebble-gray/70 px-5 py-4 space-y-1 flex items-start justify-between">
          <div className="flex items-center gap-2 text-deep-shadow">
            <Sparkles className="w-4 h-4 text-onyx-outline" />
            <h2 className="text-[15px] font-semibold">Exploration history</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-pebble-gray/50 rounded-lg transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4 text-muted-stone" />
          </button>
        </div>
        <p className="px-5 pb-4 text-[13px] text-muted-stone leading-relaxed border-b border-pebble-gray/70">
          Your exploration steps and refinements are preserved here.
        </p>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-pebble-gray/70 bg-canvas-parchment/70 px-4 py-3">
              <p className="text-[13px] text-muted-stone leading-relaxed">
                No refinements yet. Use the main input to ask about the current evidence or narrow your exploration.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className="rounded-2xl border border-pebble-gray/70 bg-canvas-parchment/65 px-4 py-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-stone">
                    {message.role === "user" ? "You" : "Clarity"}
                  </span>
                  <span className="text-[10px] text-muted-stone/70 uppercase tracking-[0.14em]">
                    {kindLabel(message)}
                  </span>
                </div>
                <p className="text-[13px] text-deep-shadow leading-relaxed">
                  {message.content}
                </p>
                {message.metadata?.canvasChanged && (
                  <p className="text-[11px] text-muted-stone leading-relaxed">
                    {message.metadata.retrievalMode === "focused_retrieval"
                      ? "Updated the canvas with a more targeted retrieval."
                      : "Updated the canvas by narrowing the current evidence."}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-pebble-gray/70 px-5 py-4 space-y-3"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Try: only human RCTs, what about sleep, show me stronger evidence..."
            className="w-full resize-none rounded-2xl border border-pebble-gray bg-white px-4 py-3 text-[14px] text-deep-shadow placeholder:text-muted-stone/65 focus:outline-none focus:border-onyx-outline leading-relaxed"
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-stone leading-relaxed">
              Refine your exploration
            </p>
            <Button
              type="submit"
              disabled={!draft.trim() || isSubmitting}
              className="bg-onyx-outline border-onyx-outline hover:bg-onyx-outline/92"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Updating…
                </>
              ) : (
                "Send"
              )}
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}
