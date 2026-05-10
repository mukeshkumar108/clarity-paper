const PAGE_NUMBER_LINE = /^(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?$/i;
const MARKDOWN_HEADING = /^(#{1,6})\s+\S/;
const BULLET_LINE = /^(\s*)([-*+])\s+\S/;
const ORDERED_LINE = /^(\s*)(\d+)[.)]\s+\S/;
const BLOCKQUOTE_LINE = /^>\s?/;
const TABLE_LINE = /^\s*\|.+\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;
const CODE_FENCE = /^\s*```/;
const SETEXT_HEADING = /^\s*(?:=+|-{3,})\s*$/;
const HORIZONTAL_RULE = /^\s*(?:---|\*\*\*|___)\s*$/;

function isStructuralLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  return (
    MARKDOWN_HEADING.test(trimmed) ||
    BULLET_LINE.test(line) ||
    ORDERED_LINE.test(line) ||
    BLOCKQUOTE_LINE.test(trimmed) ||
    TABLE_LINE.test(line) ||
    TABLE_DIVIDER.test(line) ||
    CODE_FENCE.test(line) ||
    SETEXT_HEADING.test(trimmed) ||
    HORIZONTAL_RULE.test(trimmed)
  );
}

function isLikelyContinuation(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isStructuralLine(line)) return false;
  if (/^[A-Z][A-Z\s\d,:;()/-]{3,}$/.test(trimmed)) return false;
  return true;
}

function isOrphanPageNumber(line: string, previous: string, next: string): boolean {
  const trimmed = line.trim();
  if (!PAGE_NUMBER_LINE.test(trimmed)) return false;
  return previous.trim() === "" || next.trim() === "";
}

function normalizeInlineSpacing(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function normalizeReadableText(raw: string): string {
  if (!raw.trim()) return "";

  const dehyphenated = raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/([A-Za-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n");

  const lines = dehyphenated.split("\n");
  const cleanedLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index] ?? "";
    const previous = index > 0 ? lines[index - 1] ?? "" : "";
    const next = index < lines.length - 1 ? lines[index + 1] ?? "" : "";

    if (isOrphanPageNumber(current, previous, next)) {
      continue;
    }

    cleanedLines.push(current);
  }

  const normalized: string[] = [];
  let inCodeFence = false;

  for (let index = 0; index < cleanedLines.length; index += 1) {
    const current = cleanedLines[index] ?? "";
    const next = index < cleanedLines.length - 1 ? cleanedLines[index + 1] ?? "" : "";
    const trimmed = current.trim();

    if (CODE_FENCE.test(current)) {
      inCodeFence = !inCodeFence;
      normalized.push(current.trimEnd());
      continue;
    }

    if (inCodeFence) {
      normalized.push(current.replace(/\s+$/, ""));
      continue;
    }

    if (!trimmed) {
      if (normalized.at(-1) !== "") {
        normalized.push("");
      }
      continue;
    }

    if (isStructuralLine(current)) {
      normalized.push(current.trimEnd());
      continue;
    }

    let paragraph = normalizeInlineSpacing(current);
    let lookaheadIndex = index + 1;

    while (lookaheadIndex < cleanedLines.length) {
      const candidate = cleanedLines[lookaheadIndex] ?? "";
      if (!candidate.trim() || !isLikelyContinuation(candidate) || isStructuralLine(candidate)) {
        break;
      }

      paragraph = `${paragraph} ${normalizeInlineSpacing(candidate)}`;
      index += 1;
      lookaheadIndex += 1;
    }

    normalized.push(paragraph);
  }

  return normalized
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
