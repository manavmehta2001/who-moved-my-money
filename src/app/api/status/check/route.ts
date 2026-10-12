import { GoogleGenAI } from "@google/genai";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { clientIp, json, rateLimit, tooMany } from "@/lib/api";
import { geminiModel } from "@/lib/env";
import { amfiSnapshot } from "@/lib/funds/lookup";
import { fetchScheme } from "@/lib/sources/mfapi";
import { fetchYahooDaily } from "@/lib/sources/yahoo";
import { configuredNewsProvider, googleNewsRssProvider } from "@/lib/sources/news";

export const maxDuration = 60;

type Check = { source: string; ok: boolean; ms: number; detail: string };

async function timed(source: string, fn: () => Promise<string>): Promise<Check> {
  const t = Date.now();
  try {
    const detail = await fn();
    return { source, ok: true, ms: Date.now() - t, detail };
  } catch (e) {
    return { source, ok: false, ms: Date.now() - t, detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Live health check of every external source, for the status page. No secrets in the output. */
export async function GET(request: Request) {
  const limit = rateLimit(`status:${clientIp(request)}`, 3, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const news = configuredNewsProvider({ NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY || undefined, GNEWS_API_KEY: process.env.GNEWS_API_KEY || undefined });

  const checks = await Promise.all([
    timed("Neon Postgres", async () => {
      await db().execute(sql`select 1`);
      return "Connected";
    }),
    timed("mfapi.in (NAV history)", async () => {
      const s = await fetchScheme("120716");
      return `Latest NAV ${s.navs.at(-1)?.date}`;
    }),
    timed("AMFI NAVAll.txt (daily NAVs, categories)", async () => {
      const a = await amfiSnapshot();
      return `${a.rows.length.toLocaleString("en-IN")} schemes`;
    }),
    timed("Yahoo Finance (index levels)", async () => {
      const y = await fetchYahooDaily("^NSEI", "1mo");
      return `Nifty 50 latest ${y.points.at(-1)?.date}`;
    }),
    timed(news ? `${news.name} (news)` : "News API key", async () => {
      if (!news) return "Not configured; Google News RSS is used";
      const items = await news.fetch(weekAgo.toISOString(), now.toISOString());
      return `${items.length} articles this week`;
    }),
    timed("Google News RSS (news fallback)", async () => `${(await googleNewsRssProvider.fetch(weekAgo.toISOString(), now.toISOString())).length} articles`),
    timed(`Gemini (${geminiModel()})`, async () => {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
      const m = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.get({ model: geminiModel() });
      return `Model available: ${m.displayName ?? m.name}`;
    }),
  ]);
  return json({ checkedAt: now.toISOString(), checks });
}
