import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { marketContext, type MarketContext } from "@/db/schema";
import { allBenchmarks, benchmarkSeries, type JobContext } from "@/db/queries";
import type { IndexMove } from "@/db/types";
import { addDays, type IsoDate } from "@/lib/dates";
import { computeReturns } from "@/lib/engine/returns";
import { fetchWeekHeadlines } from "@/lib/sources/news";
import { STRIP_PROXY_FALLBACK } from "@/lib/sources/benchmarkCatalog";

/** Monday–Friday of the report week, in India time. */
export function newsWindow(weekEnding: IsoDate): { from: string; to: string } {
  return {
    from: new Date(`${addDays(weekEnding, -6)}T00:00:00+05:30`).toISOString(),
    to: new Date(`${weekEnding}T23:59:59+05:30`).toISOString(),
  };
}

export async function computeIndexMoves(weekEnding: IsoDate): Promise<IndexMove[]> {
  const benches = await allBenchmarks();
  const strip = benches.filter((b) => b.showInMarketStrip).sort((a, b) => (a.stripOrder ?? 0) - (b.stripOrder ?? 0));
  const keys = [...strip.map((b) => b.key), ...strip.map((b) => STRIP_PROXY_FALLBACK[b.key]).filter(Boolean)];
  const series = await benchmarkSeries(keys, addDays(weekEnding, -40), weekEnding);
  return strip.map((b) => {
    const r = computeReturns(series.get(b.key) ?? [], weekEnding)["1w"];
    if (r) return { key: b.key, label: b.label, weekReturn: r.value, level: r.end.value, asOf: r.end.date, source: "yahoo", sourceRef: b.sourceRef, note: null };
    const proxyKey = STRIP_PROXY_FALLBACK[b.key];
    const proxy = benches.find((x) => x.key === proxyKey);
    const pr = proxy ? computeReturns(series.get(proxy.key) ?? [], weekEnding)["1w"] : null;
    return {
      key: b.key,
      label: b.label,
      weekReturn: pr?.value ?? null,
      level: null,
      asOf: pr?.end.date ?? null,
      source: "mf_proxy",
      sourceRef: proxy?.sourceRef ?? "",
      note: pr ? `Yahoo Finance had no data, so this uses ${proxy?.sourceName} instead.` : "No data available this week.",
    };
  });
}

/** A past week's headlines are stored once and never re-fetched, unless `force` is set. */
export async function getOrFetchMarketContext(ctx: JobContext, weekEnding: IsoDate, opts: { force?: boolean } = {}): Promise<MarketContext> {
  const [existing] = await db().select().from(marketContext).where(eq(marketContext.weekEnding, weekEnding)).limit(1);
  const indexMoves = await computeIndexMoves(weekEnding);
  if (existing && existing.headlines.length > 0 && !opts.force) {
    await db().update(marketContext).set({ indexMoves }).where(eq(marketContext.weekEnding, weekEnding));
    return { ...existing, indexMoves };
  }
  const { from, to } = newsWindow(weekEnding);
  const news = await fetchWeekHeadlines(
    { NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY || undefined, GNEWS_API_KEY: process.env.GNEWS_API_KEY || undefined },
    from,
    to,
  );
  for (const e of news.errors) ctx.warn(`News: ${e}`);
  const row = { weekEnding, indexMoves, headlines: news.headlines, newsProvider: news.providerLabel, fetchedAt: new Date() };
  await db()
    .insert(marketContext)
    .values(row)
    .onConflictDoUpdate({
      target: marketContext.weekEnding,
      set: { indexMoves: sql`excluded.index_moves`, headlines: sql`excluded.headlines`, newsProvider: sql`excluded.news_provider`, fetchedAt: sql`excluded.fetched_at` },
    });
  ctx.details.news = { provider: news.providerLabel, headlines: news.headlines.length };
  return row;
}
