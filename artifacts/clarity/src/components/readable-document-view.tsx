import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { BookOpen, FileText, Hash, ScrollText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { normalizeReadableText } from "@/lib/normalize-readable-text";

type ReadableDocumentViewProps = {
  fallbackTitle: string;
  metadata?: {
    title?: string;
    authors?: string[];
    journal?: string;
    publicationYear?: string;
  };
  extractedText: string | null | undefined;
  className?: string;
  activeSnippet?: string | null;
  activeEvidenceLabel?: string | null;
};

function collapseSearchText(value: string): { normalized: string; map: number[] } {
  let normalized = "";
  const map: number[] = [];
  let previousWasWhitespace = true;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    if (/\s/.test(char)) {
      if (!previousWasWhitespace && normalized.length > 0) {
        normalized += " ";
        map.push(index);
      }
      previousWasWhitespace = true;
      continue;
    }

    normalized += char.toLowerCase();
    map.push(index);
    previousWasWhitespace = false;
  }

  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }

  return { normalized, map };
}

function unwrapHighlight(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
}

function clearHighlights(container: HTMLElement) {
  const marks = Array.from(container.querySelectorAll<HTMLElement>("[data-source-highlight='true']"));
  marks.forEach(unwrapHighlight);
  container.normalize();
}

function collectTextNodes(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let textNode = walker.nextNode();
  let offset = 0;

  while (textNode) {
    const node = textNode as Text;
    const value = node.nodeValue ?? "";
    nodes.push({ node, start: offset, end: offset + value.length });
    offset += value.length;
    textNode = walker.nextNode();
  }

  return nodes;
}

function locatePosition(
  nodes: Array<{ node: Text; start: number; end: number }>,
  target: number,
): { node: Text; offset: number } | null {
  for (const item of nodes) {
    if (target <= item.end) {
      return {
        node: item.node,
        offset: Math.max(0, Math.min(item.node.nodeValue?.length ?? 0, target - item.start)),
      };
    }
  }

  const last = nodes.at(-1);
  if (!last) return null;
  return {
    node: last.node,
    offset: last.node.nodeValue?.length ?? 0,
  };
}

function highlightSnippet(container: HTMLElement, snippet: string): boolean {
  clearHighlights(container);

  const combinedText = container.textContent ?? "";
  if (!combinedText.trim() || !snippet.trim()) return false;

  const haystack = collapseSearchText(combinedText);
  const needle = collapseSearchText(snippet);
  const matchIndex = haystack.normalized.indexOf(needle.normalized);
  if (matchIndex === -1) return false;

  const originalStart = haystack.map[matchIndex];
  const originalEnd = haystack.map[matchIndex + needle.normalized.length - 1];
  if (originalStart == null || originalEnd == null) return false;

  const textNodes = collectTextNodes(container);
  const start = locatePosition(textNodes, originalStart);
  const end = locatePosition(textNodes, originalEnd + 1);
  if (!start || !end) return false;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  const mark = document.createElement("mark");
  mark.dataset.sourceHighlight = "true";
  mark.className = "rounded-md bg-[#fff1c2] px-0.5 text-inherit shadow-[0_0_0_1px_rgba(192,133,50,0.2)]";

  try {
    const contents = range.extractContents();
    mark.appendChild(contents);
    range.insertNode(mark);
    mark.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    return true;
  } catch {
    return false;
  }
}

function inferSourceFormat(text: string): "markdown" | "pdf-text" | "plain-text" {
  if (
    /(^|\n)#{1,6}\s+\S/.test(text) ||
    /(^|\n)\|.+\|/.test(text) ||
    /(^|\n)\s*```/.test(text) ||
    /(^|\n)\s*[-*+]\s+\S/.test(text)
  ) {
    return "markdown";
  }

  if (/\n[A-Za-z].{15,}\n[A-Za-z].{15,}/.test(text)) {
    return "pdf-text";
  }

  return "plain-text";
}

function formatLabel(sourceFormat: "markdown" | "pdf-text" | "plain-text"): string {
  if (sourceFormat === "markdown") return "Markdown source";
  if (sourceFormat === "pdf-text") return "PDF text";
  return "Plain text";
}

function formatIcon(sourceFormat: "markdown" | "pdf-text" | "plain-text") {
  if (sourceFormat === "markdown") return Hash;
  if (sourceFormat === "pdf-text") return ScrollText;
  return FileText;
}

export function ReadableDocumentView({
  fallbackTitle,
  metadata,
  extractedText,
  className,
  activeSnippet,
  activeEvidenceLabel,
}: ReadableDocumentViewProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [didResolveHighlight, setDidResolveHighlight] = useState(false);
  const paperTitle = metadata?.title?.trim() || fallbackTitle;
  const authors = metadata?.authors?.filter(Boolean) ?? [];
  const journal = metadata?.journal?.trim() || "";
  const year = metadata?.publicationYear?.trim() || "";
  const normalizedText = useMemo(() => normalizeReadableText(extractedText ?? ""), [extractedText]);
  const citationLine = authors.length > 0
    ? [authors.join(", "), year, journal].filter(Boolean).join(" · ")
    : [year, journal].filter(Boolean).join(" · ");

  const sourceFormat = inferSourceFormat(normalizedText);
  const SourceIcon = formatIcon(sourceFormat);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    if (!activeSnippet?.trim()) {
      clearHighlights(container);
      setDidResolveHighlight(false);
      return;
    }

    setDidResolveHighlight(highlightSnippet(container, normalizeReadableText(activeSnippet)));
  }, [activeSnippet, normalizedText]);

  return (
    <div className={cn("h-full flex flex-col overflow-hidden bg-canvas-parchment/60", className)}>
      <div className="shrink-0 border-b border-pebble-gray bg-white/70 px-5 pb-5 pt-6 backdrop-blur-xl md:px-7 md:pb-6 md:pt-7">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-stone/65">
              <BookOpen className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Readable source</span>
            </div>
            <div className="space-y-2">
              <h2 className="max-w-3xl text-balance font-sans text-[15px] font-semibold leading-[1.45] tracking-tight text-deep-shadow md:text-[17px]">
                {paperTitle}
              </h2>
              {citationLine && (
                <p className="max-w-3xl text-[11.5px] leading-[1.75] text-muted-stone md:text-[12.5px]">
                  {citationLine}
                </p>
              )}
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-pebble-gray bg-canvas-parchment/80 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-stone">
            <SourceIcon className="h-3.5 w-3.5" />
            {formatLabel(sourceFormat)}
          </div>
        </div>
      </div>

      {!extractedText ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-sm space-y-3 text-center">
            <p className="text-sm font-medium text-deep-shadow">Source text not available</p>
            <p className="text-[12px] leading-[1.8] text-muted-stone">
              Upload text, markdown, or a PDF and Clarity will render it here in a readable document view.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-4 py-6 md:px-6 md:py-7">
            {activeSnippet && (
              <div className="mx-auto mb-4 w-full max-w-3xl rounded-[22px] border border-goldenrod-accent/25 bg-[#fffaf0] px-4 py-3 shadow-[0_16px_45px_-30px_rgba(20,20,20,0.35)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-goldenrod-accent">Evidence spotlight</p>
                    <p className="text-[13px] leading-[1.7] text-inkwell/80">
                      {activeEvidenceLabel ?? "Supporting passage"}
                    </p>
                  </div>
                  <div className="rounded-full border border-goldenrod-accent/25 bg-white/85 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-stone">
                    {didResolveHighlight ? "Anchored in source" : "Snippet not found verbatim"}
                  </div>
                </div>
              </div>
            )}
            <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-pebble-gray/80 bg-white/78 px-5 py-6 shadow-[0_24px_90px_-50px_rgba(20,20,20,0.28)] backdrop-blur-sm md:px-8 md:py-9">
              <div ref={contentRef} className="readable-prose prose prose-stone max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                  components={{
                    a: ({ className: linkClassName, ...props }) => (
                      <a
                        {...props}
                        className={cn("font-medium text-forest-green-action underline decoration-forest-green-action/35 underline-offset-4 transition hover:decoration-forest-green-action", linkClassName)}
                        target="_blank"
                        rel="noreferrer"
                      />
                    ),
                    blockquote: ({ className: blockquoteClassName, ...props }) => (
                      <blockquote
                        {...props}
                        className={cn("border-l-[3px] border-goldenrod-accent/55 bg-canvas-parchment/85 px-5 py-3 italic text-inkwell/78", blockquoteClassName)}
                      />
                    ),
                    code: ({ className: codeClassName, children, ...props }) => {
                      const codeValue = String(children ?? "");
                      const inline = !codeValue.includes("\n") && !String(codeClassName ?? "").includes("language-");
                      if (inline) {
                        return (
                          <code
                            {...props}
                            className={cn("rounded-md bg-pebble-gray/75 px-1.5 py-0.5 font-mono text-[0.88em] text-deep-shadow", codeClassName)}
                          >
                            {children}
                          </code>
                        );
                      }

                      return (
                        <code {...props} className={cn("font-mono text-[13px] leading-7 text-[#f4f4ef]", codeClassName)}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ className: preClassName, ...props }) => (
                      <pre
                        {...props}
                        className={cn("overflow-x-auto rounded-2xl border border-[#2f322d] bg-[#171916] px-4 py-4 text-sm shadow-inner", preClassName)}
                      />
                    ),
                    table: ({ className: tableClassName, ...props }) => (
                      <div className="my-8 overflow-x-auto">
                        <table {...props} className={cn("w-full min-w-[540px] border-collapse text-left text-[14px]", tableClassName)} />
                      </div>
                    ),
                    th: ({ className: thClassName, ...props }) => (
                      <th {...props} className={cn("border-b border-pebble-gray px-3 py-2 font-semibold text-deep-shadow", thClassName)} />
                    ),
                    td: ({ className: tdClassName, ...props }) => (
                      <td {...props} className={cn("border-b border-pebble-gray/70 px-3 py-2 align-top text-inkwell/78", tdClassName)} />
                    ),
                  }}
                >
                  {normalizedText}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export function ReadableDocumentSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-canvas-parchment/60">
      <div className="shrink-0 border-b border-pebble-gray bg-white/70 px-5 pb-5 pt-6 md:px-7 md:pb-6 md:pt-7">
        <div className="space-y-3">
          <Skeleton className="h-3.5 w-28 rounded-full" />
          <Skeleton className="h-5 w-4/5 rounded-xl" />
          <Skeleton className="h-4 w-3/5 rounded-xl" />
        </div>
      </div>
      <div className="flex-1 px-4 py-6 md:px-6 md:py-7">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-pebble-gray/80 bg-white/78 px-5 py-6 md:px-8 md:py-9">
          <div className="space-y-4">
            <Skeleton className="h-4 w-full rounded-lg" />
            <Skeleton className="h-4 w-[92%] rounded-lg" />
            <Skeleton className="h-4 w-[88%] rounded-lg" />
            <Skeleton className="h-4 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-[20px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
