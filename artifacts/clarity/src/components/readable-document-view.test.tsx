import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadableDocumentView } from "@/components/readable-document-view";

describe("ReadableDocumentView", () => {
  it("renders markdown structure instead of leaking markdown syntax", () => {
    const html = renderToStaticMarkup(
      <ReadableDocumentView
        fallbackTitle="Demo paper"
        extractedText={"# Main heading\n\nA paragraph with **strong** text.\n\n- Item one\n- Item two"}
      />,
    );

    expect(html).toContain("<h1");
    expect(html).toContain("Main heading</h1>");
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain("<ul>");
    expect(html).not.toContain("# Main heading");
  });

  it("renders code fences inside a styled pre block", () => {
    const html = renderToStaticMarkup(
      <ReadableDocumentView
        fallbackTitle="Code sample"
        extractedText={"```js\nconsole.log('hello');\n```"}
      />,
    );

    expect(html).toContain("<pre");
    expect(html).toContain("console.log");
  });

  it("keeps the readable typography shell and source metadata", () => {
    const html = renderToStaticMarkup(
      <ReadableDocumentView
        fallbackTitle="A study on sleep"
        metadata={{
          authors: ["Jane Doe", "John Smith"],
          journal: "Journal of Sleep Research",
          publicationYear: "2024",
        }}
        extractedText={"A calm readable paragraph."}
      />,
    );

    expect(html).toContain("Readable source");
    expect(html).toContain("Journal of Sleep Research");
    expect(html).toContain("readable-prose prose prose-stone max-w-none");
  });
});
