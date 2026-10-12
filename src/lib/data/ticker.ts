import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { benchmarkHistory, benchmarks } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";

export type TickerItem = { key: string; label: string; level: number; change: number; changePct: number; asOf: IsoDate; currency: string; source: string };

/** Display order and short names for the strip; values come from stored Yahoo closes (refreshed nightly). */
const ORDER: Array<[string, string]> = [
  ["idx_nifty50", "NIFTY 50"],
  ["idx_nifty500", "NIFTY 500"],
  ["idx_midcap150", "NIFTY MIDCAP 150"],
  ["idx_smallcap250", "NIFTY SMALLCAP 250"],
  ["idx_nasdaq100", "NASDAQ 100"],
  ["idx_sp500", "S&P 500"],
];

/** Latest close and the change from the previous close, per index. */
export async function getTicker(): Promise<TickerItem[]> {
  const keys = ORDER.map(([k]) => k);
  const defs = await db().select().from(benchmarks).where(inArray(benchmarks.key, keys));
  const out: TickerItem[] = [];
  for (const [key, label] of ORDER) {
    const def = defs.find((d) => d.key === key);
    if (!def) continue;
    const last2 = await db().select().from(benchmarkHistory).where(eq(benchmarkHistory.key, key)).orderBy(desc(benchmarkHistory.valueDate)).limit(2);
    if (last2.length < 2) continue;
    const [now, prev] = last2;
    out.push({ key, label, level: now.value, change: now.value - prev.value, changePct: now.value / prev.value - 1, asOf: now.valueDate, currency: def.currency, source: def.sourceName ?? def.sourceRef });
  }
  return out;
}
