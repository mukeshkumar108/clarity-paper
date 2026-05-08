import { describe, expect, it } from "vitest";
import { sanitiseText } from "../src/lib/documentExtraction";

describe("sanitiseText", () => {
  it("should remove references section", () => {
    const text = "Main content.\nReferences\n1. Smith et al.";
    expect(sanitiseText(text)).toBe("Main content.");
  });

  it("should remove bibliography section case-insensitively", () => {
    const text = "Main content.\nBIBLIOGRAPHY\n- Item 1";
    expect(sanitiseText(text)).toBe("Main content.");
  });

  it("should remove Works Cited with colon", () => {
    const text = "Main content.\nWorks Cited: \n- Source";
    expect(sanitiseText(text)).toBe("Main content.");
  });

  it("should strip inline citations [1]", () => {
    const text = "This is a fact [1]. This is another [2, 3].";
    expect(sanitiseText(text)).toBe("This is a fact . This is another .");
  });

  it("should strip author-date citations (Smith, 2019)", () => {
    const text = "This is a fact (Smith, 2019). And this (Jones et al., 2020).";
    expect(sanitiseText(text)).toBe("This is a fact . And this .");
  });

  it("should remove figure captions", () => {
    const text = "Figure 1: This is a figure caption.\nMain text.";
    expect(sanitiseText(text)).toBe("Main text.");
  });

  it("should collapse excessive whitespace", () => {
    const text = "Word    word\n\n\n\nWord";
    expect(sanitiseText(text)).toBe("Word word\n\nWord");
  });

  it("should not remove mid-sentence references", () => {
    const text = "The references used in this study were extensive.";
    expect(sanitiseText(text)).toBe("The references used in this study were extensive.");
  });
});
