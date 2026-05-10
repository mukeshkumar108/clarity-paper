import { describe, expect, it } from "vitest";
import { normalizeReadableText } from "@/lib/normalize-readable-text";

describe("normalizeReadableText", () => {
  it("joins wrapped PDF paragraphs into readable prose", () => {
    const raw = [
      "This is a long paragraph pulled from a PDF export that",
      "was wrapped at the edge of the page and should be",
      "joined back into one sentence.",
    ].join("\n");

    expect(normalizeReadableText(raw)).toBe(
      "This is a long paragraph pulled from a PDF export that was wrapped at the edge of the page and should be joined back into one sentence.",
    );
  });

  it("removes orphaned page-number lines", () => {
    const raw = [
      "Introduction",
      "",
      "12",
      "",
      "This paragraph should remain after the page number is removed.",
    ].join("\n");

    expect(normalizeReadableText(raw)).toBe(
      "Introduction\n\nThis paragraph should remain after the page number is removed.",
    );
  });

  it("preserves bullet and numbered lists", () => {
    const raw = [
      "- First finding",
      "- Second finding",
      "",
      "1. One step",
      "2. Two steps",
    ].join("\n");

    expect(normalizeReadableText(raw)).toBe(raw);
  });

  it("preserves fenced code blocks", () => {
    const raw = [
      "```ts",
      "const answer = 42;",
      "console.log(answer);",
      "```",
    ].join("\n");

    expect(normalizeReadableText(raw)).toBe(raw);
  });

  it("repairs obvious hyphenated line breaks", () => {
    const raw = [
      "This para talks about long-term inter-",
      "ventions and how they were evaluated.",
    ].join("\n");

    expect(normalizeReadableText(raw)).toBe(
      "This para talks about long-term interventions and how they were evaluated.",
    );
  });

  it("collapses excessive blank lines without flattening sections", () => {
    const raw = [
      "# Heading",
      "",
      "",
      "",
      "First paragraph.",
      "",
      "",
      "Second paragraph.",
    ].join("\n");

    expect(normalizeReadableText(raw)).toBe(
      "# Heading\n\nFirst paragraph.\n\nSecond paragraph.",
    );
  });
});
