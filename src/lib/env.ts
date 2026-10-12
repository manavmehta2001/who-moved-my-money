import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const serverEnvSchema = z.object({
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string({ error: "DATABASE_URL is missing (Neon pooled connection string)" }).startsWith("postgres", "DATABASE_URL must be a postgres:// connection string")),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string({ error: "GEMINI_API_KEY is missing" })),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().default("gemini-3.8-flash")),
  NEWSDATA_API_KEY: optionalString,
  GNEWS_API_KEY: optionalString,
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string({ error: "CRON_SECRET is missing" }).min(16, "CRON_SECRET should be at least 16 characters")),
  ADMIN_PASSCODE: z.preprocess(emptyToUndefined, z.string({ error: "ADMIN_PASSCODE is missing" }).min(4, "ADMIN_PASSCODE should be at least 4 characters")),
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.url().optional()),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function formatEnvError(error: z.ZodError): string {
  return `Environment is not configured correctly:\n${z.prettifyError(error)}\nSee .env.example for the full list.`;
}

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
  cached = parsed.data;
  return cached;
}

export function databaseUrl(): string {
  const parsed = serverEnvSchema.shape.DATABASE_URL.safeParse(process.env.DATABASE_URL);
  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
  return parsed.data;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
}

export function validateEnvOnBoot(): void {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(formatEnvError(parsed.error));
}
