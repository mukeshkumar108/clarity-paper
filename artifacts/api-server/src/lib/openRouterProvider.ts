import { zodToJsonSchema } from "zod-to-json-schema";
import { logger } from "./logger";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export const isDemoMode = !OPENROUTER_API_KEY;

export async function callLLM(
  systemPrompt: string,
  userMessage: string,
  responseSchema?: any,
  options?: {
    model?: string;
    temperature?: number;
    /** Base64-encoded PDF to pass as a native multimodal attachment alongside the text message. */
    pdfBase64?: string;
    /** Abort the request after this many milliseconds. Defaults to 45 000. */
    timeoutMs?: number;
  }
): Promise<string> {
  if (isDemoMode) {
    throw new Error("DEMO_MODE");
  }

  // When a PDF is provided, send the user turn as a multimodal content array
  // so the model can read the document natively (tables, figures, layout intact).
  const userContent: string | Array<Record<string, unknown>> =
    options?.pdfBase64
      ? [
          {
            type: "file",
            file: {
              filename: "paper.pdf",
              file_data: `data:application/pdf;base64,${options.pdfBase64}`,
            },
          },
          { type: "text", text: userMessage },
        ]
      : userMessage;

  const body: any = {
    model: options?.model ?? OPENROUTER_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: options?.temperature ?? 0.2,
  };

  if (responseSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "analysis_response",
        strict: true,
        schema: zodToJsonSchema(responseSchema as any),
      },
    };
  }

  const timeoutMs = options?.timeoutMs ?? 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.REPLIT_DOMAINS?.split(",")[0] ?? "http://localhost",
        "X-Title": "Clarity Document Analysis",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error(`LLM_TIMEOUT after ${timeoutMs}ms`);
    }
    throw err;
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    logger.error({ status: response.status, body: errorBody }, "OpenRouter API error");
    throw new Error(`LLM request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM response");
  return content;
}
