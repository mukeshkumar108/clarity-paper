// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStreamingSearch } from "@/hooks/use-streaming-search";

const encoder = new TextEncoder();

function makeStream(events: unknown[]) {
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

describe("useStreamingSearch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an error instead of hanging when the stream ends without a valid session id", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          makeStream([
            {
              type: "papers",
              papers: [],
              evidenceSnapshot: {
                metaAnalyses: 0,
                rcts: 0,
                humanObservational: 0,
                mechanistic: 0,
                conflicting: 0,
                totalPapers: 0,
                overallConfidence: "preliminary",
              },
              noEvidence: true,
            },
            {
              type: "synthesis",
              synthesisText: "A short answer.",
              confidence: "preliminary",
              evidenceSpans: [],
              followUpOptions: [],
              pathways: [],
              coverageNote: "abstracts_only",
            },
            {
              type: "done",
              sessionId: 0,
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    let latest: ReturnType<typeof useStreamingSearch> | null = null;
    const container = document.createElement("div");
    const root = createRoot(container);

    function Harness() {
      latest = useStreamingSearch();
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    let result: Awaited<ReturnType<ReturnType<typeof useStreamingSearch>["startSearch"]>> = null;
    await act(async () => {
      result = await latest!.startSearch("ivermectin");
    });

    expect(result).toBeNull();
    expect(latest?.state).toEqual({
      kind: "error",
      message: "Search finished, but the result could not be saved. Please try again.",
    });

    await act(async () => {
      root.unmount();
    });
  });
});
