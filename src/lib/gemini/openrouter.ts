import { z } from "zod";

/**
 * Gemini Flash through the OpenRouter gateway (the only AI access this project has). Rules:
 * only `google/` models; served only by Google's own infrastructure (no fallback to other hosts);
 * retry 429/5xx up to 3 times with backoff; stop on 402 (out of credits).
 */
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const GOOGLE_ONLY = { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false, require_parameters: true } as const;

export class OutOfCreditsError extends Error {
  constructor() {
    super("OpenRouter account is out of credits (HTTP 402).");
    this.name = "OutOfCreditsError";
  }
}

const responseSchema = z.object({
  model: z.string().optional(),
  provider: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullish() })).min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

export type ChatResult = { text: string; tokensIn: number; tokensOut: number; cost: number; model: string; provider: string };

export function assertGoogleModel(model: string): void {
  if (!model.startsWith("google/")) throw new Error(`Only Google models may be used (got "${model}").`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chatJson(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  assertGoogleModel(opts.model);
  const body = JSON.stringify({
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } },
    // Writing from a fixed fact sheet needs little reasoning; low effort keeps reports fast and cheap.
    reasoning: { effort: "low" },
    max_tokens: opts.maxTokens ?? 8192,
    provider: GOOGLE_ONLY,
  });
  let lastError: unknown;
  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) await sleep(600 * 2 ** (attempt - 1) + Math.random() * 300);
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://who-moved-my-money.vercel.app",
          "X-Title": "Who Moved My Money?",
        },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      });
    } catch (e) {
      lastError = e;
      continue;
    }
    if (res.status === 402) throw new OutOfCreditsError();
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`OpenRouter HTTP ${res.status}`);
      continue;
    }
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`OpenRouter error: ${msg}`);
    }
    const parsed = responseSchema.parse(json);
    return {
      text: parsed.choices[0].message.content ?? "",
      tokensIn: parsed.usage?.prompt_tokens ?? 0,
      tokensOut: parsed.usage?.completion_tokens ?? 0,
      cost: parsed.usage?.cost ?? 0,
      model: parsed.model ?? opts.model,
      provider: parsed.provider ?? "unknown",
    };
  }
  throw lastError instanceof Error ? lastError : new Error("OpenRouter request failed");
}

/** Confirms the model still exists on OpenRouter (rule: check before use). */
export async function modelExists(model: string): Promise<boolean> {
  const res = await fetch(`${OPENROUTER_BASE}/models`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenRouter /models HTTP ${res.status}`);
  const j = (await res.json()) as { data?: Array<{ id: string }> };
  return !!j.data?.some((m) => m.id === model);
}
