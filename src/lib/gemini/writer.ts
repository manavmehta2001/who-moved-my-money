import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { geminiModel } from "@/lib/env";
import type { ReportContent } from "@/db/types";
import type { FactSheet } from "./factSheet";
import { checkReport } from "./hallucinationGuard";
import { retryPrompt, SYSTEM_INSTRUCTION, userPrompt } from "./prompt";
import { geminiResponseSchema, type ReportOutput } from "./schema";
import { templateReport } from "./templateFallback";

export type WrittenReport = {
  content: ReportContent;
  writtenBy: "gemini" | "template";
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  retries: number;
  attempts: Array<{ ok: boolean; errors: string[] }>;
};

export type GenerateFn = (prompt: string) => Promise<{ text: string; tokensIn: number; tokensOut: number }>;

export function geminiGenerate(apiKey: string, model: string): GenerateFn {
  const ai = new GoogleGenAI({ apiKey });
  return async (prompt) => {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema,
        maxOutputTokens: 8192,
        // Writing from a fixed fact sheet needs little reasoning; low thinking keeps the report fast and cheap.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: AbortSignal.timeout(90_000),
      },
    });
    const u = res.usageMetadata;
    return {
      text: res.text ?? "",
      tokensIn: u?.promptTokenCount ?? 0,
      tokensOut: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    };
  };
}

function toContent(out: ReportOutput, guardErrors?: string[]): ReportContent {
  return { ...out, ...(guardErrors?.length ? { guardErrors } : {}) };
}

/**
 * Gemini writes, the guard checks. One retry with the specific errors fed back; if that fails too (or there's
 * no API key, or the API is down), the deterministic template writes the report and it's marked as such.
 */
export async function writeReport(sheet: FactSheet, opts: { apiKey?: string; model?: string; generate?: GenerateFn } = {}): Promise<WrittenReport> {
  const model = opts.model ?? geminiModel();
  const generate = opts.generate ?? (opts.apiKey ? geminiGenerate(opts.apiKey, model) : null);
  const attempts: WrittenReport["attempts"] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let latencyMs = 0;

  if (generate) {
    let errors: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      let text: string;
      try {
        const res = await generate(attempt === 0 ? userPrompt(sheet) : retryPrompt(sheet, errors));
        tokensIn += res.tokensIn;
        tokensOut += res.tokensOut;
        text = res.text;
      } catch (e) {
        latencyMs += Date.now() - started;
        errors = [`Gemini call failed: ${e instanceof Error ? e.message : String(e)}`];
        attempts.push({ ok: false, errors });
        continue;
      }
      latencyMs += Date.now() - started;
      let raw: unknown = null;
      try {
        raw = JSON.parse(text);
      } catch {
        raw = null;
      }
      const check = raw === null ? { ok: false as const, output: null, errors: ["The answer was not valid JSON."] } : checkReport(raw, sheet);
      attempts.push({ ok: check.ok, errors: check.errors });
      if (check.ok) {
        return { content: toContent(check.output), writtenBy: "gemini", model, tokensIn, tokensOut, latencyMs, retries: attempt, attempts };
      }
      errors = check.errors;
    }
  }

  const fallback = templateReport(sheet);
  const guardErrors = attempts.flatMap((a) => a.errors);
  return {
    content: toContent(fallback, generate ? guardErrors : ["No GEMINI_API_KEY configured."]),
    writtenBy: "template",
    model: generate ? model : null,
    tokensIn,
    tokensOut,
    latencyMs,
    retries: Math.max(0, attempts.length - 1),
    attempts,
  };
}
