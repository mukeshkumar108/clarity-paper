import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { logger } from "./logger";

function resolvePythonBin(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;

  const bundledVenvPython = path.join(process.cwd(), "python-env", "bin", "python3");
  if (existsSync(bundledVenvPython)) return bundledVenvPython;

  return "python3";
}

function resolvePdfScript(): string {
  if (process.env.PDF_SCRIPT_PATH) return process.env.PDF_SCRIPT_PATH;

  const localScript = path.join(process.cwd(), "scripts", "pdf_to_markdown.py");
  if (existsSync(localScript)) return localScript;

  return path.join(process.cwd(), "artifacts", "api-server", "scripts", "pdf_to_markdown.py");
}

async function pdfToMarkdown(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(resolvePythonBin(), [resolvePdfScript()]);
    const chunks: Buffer[] = [];
    const errLines: string[] = [];

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errLines.push(d.toString()));
    proc.on("error", (err) =>
      reject(new Error(`Failed to spawn Python PDF converter: ${err.message}`))
    );
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `PDF conversion exited ${code}: ${errLines.join("").trim()}`
          )
        );
      } else {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });

    proc.stdin.write(buffer);
    proc.stdin.end();
  });
}

export interface ExtractionResult {
  text: string;
  pageCountEstimate: number;
  wordCount: number;
  conversionMs?: number;
}

/**
 * Sanitises research paper text by removing noise that interferes with Pass 1 extraction.
 * - Removes everything from "References" or "Bibliography" onwards if found as a standalone heading.
 * - Strips common inline citation markers: [1], [2,3], (Smith, 2019), etc.
 * - Removes Figure and Table captions.
 * - Collapses excessive whitespace.
 */
export function sanitiseText(text: string): string {
  if (!text) return "";

  let cleaned = text;

  // 1. Remove References/Bibliography section
  const refHeadingRegex = /^\s*(?:References|REFERENCES|Bibliography|BIBLIOGRAPHY|Works Cited|WORKS CITED)\s*[:\d]*\s*$/im;
  const refMatch = cleaned.match(refHeadingRegex);
  if (refMatch && typeof refMatch.index === "number") {
    cleaned = cleaned.slice(0, refMatch.index);
  }

  // 2. Strip Figure and Table captions
  cleaned = cleaned.replace(/^\s*(?:Figure|Table|Fig\.)\s*\d+\s*[:.].*$/gim, "");

  // 3. Strip inline citation markers
  cleaned = cleaned.replace(/\[\d+(?:[,\-\s]+\d+)*\]/g, "");
  cleaned = cleaned.replace(/\([A-Z][a-z]+(?:\s+et\s+al\.?)?,?\s+\d{4}\)/g, "");

  // 4. Collapse excessive whitespace
  cleaned = cleaned
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

/**
 * Attempts to extract a title from PDF metadata or the first prominent line of text.
 */
export function extractMetadataTitle(rawText: string, metadataTitle?: string): string {
  if (metadataTitle && metadataTitle.trim().length > 5 && !/\.(pdf|docx|txt)$/i.test(metadataTitle)) {
    return metadataTitle.trim();
  }

  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.replace(/^#+\s*/, "").trim(); // strip markdown headings
    if (trimmed.length < 20) continue;
    if (/doi:\s*10\./i.test(trimmed)) continue;
    if (/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i.test(trimmed)) continue;
    if (/\b(?:journal|review|archives|nature|science|proceedings|volume|issue|page)\b/i.test(trimmed.toLowerCase())) continue;
    if (/^\d{4}$/.test(trimmed)) continue;
    return trimmed;
  }

  return "";
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractionResult & { suggestedTitle?: string }> {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "txt" || mimeType === "text/plain") {
    const rawText = buffer.toString("utf-8");
    const suggestedTitle = extractMetadataTitle(rawText);
    const text = sanitiseText(rawText);
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const pageCountEstimate = Math.max(1, Math.ceil(wordCount / 250));
    return { text, wordCount, pageCountEstimate, suggestedTitle };
  }

  if (ext === "pdf" || mimeType === "application/pdf") {
    const fileSizeKb = Math.round(buffer.length / 1024);
    const convStart = Date.now();
    logger.info({ filename, fileSizeKb }, "Converting PDF to markdown via pymupdf4llm");
    const markdown = await pdfToMarkdown(buffer);
    const conversionMs = Date.now() - convStart;
    const suggestedTitle = extractMetadataTitle(markdown);
    const text = sanitiseText(markdown);
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const pageCountEstimate = Math.max(1, Math.ceil(wordCount / 250));
    logger.info({ filename, fileSizeKb, conversionMs, wordCount, pageCountEstimate }, "PDF conversion complete");
    return { text, wordCount, pageCountEstimate, suggestedTitle, conversionMs };
  }

  if (
    ext === "docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const rawText = result.value ?? "";
      const suggestedTitle = extractMetadataTitle(rawText);
      const text = sanitiseText(rawText);
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      const pageCountEstimate = Math.max(1, Math.ceil(wordCount / 250));
      return { text, wordCount, pageCountEstimate, suggestedTitle };
    } catch (err) {
      logger.error({ err }, "DOCX extraction failed");
      throw new Error("Could not extract text from DOCX. Please try pasting the text manually.");
    }
  }

  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
}
