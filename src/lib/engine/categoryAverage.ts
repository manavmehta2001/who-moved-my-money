import { DATA_CONFIG } from "@/config/verdict";
import type { IsoDate } from "@/lib/dates";
import { computeReturns, WINDOWS, type Point, type WindowKey } from "./returns";

export type CategoryAverage = Record<WindowKey, { value: number; count: number } | null>;

/**
 * Equal-weighted mean of peer returns per window. Leaves out the fund itself, peers with no data for the
 * window, peers launched this year (for YTD), and implausible returns that signal a data error.
 */
export function categoryAverage(peers: Map<string, Point[]>, excludeCode: string, weekEnding: IsoDate): CategoryAverage {
  const sums: Record<WindowKey, { total: number; count: number }> = { "1w": { total: 0, count: 0 }, "1m": { total: 0, count: 0 }, ytd: { total: 0, count: 0 } };
  for (const [code, series] of peers) {
    if (code === excludeCode) continue;
    const r = computeReturns(series, weekEnding);
    for (const w of WINDOWS) {
      const v = r[w]?.value;
      if (v === undefined || !Number.isFinite(v) || Math.abs(v) > DATA_CONFIG.peerSanityBounds[w]) continue;
      sums[w].total += v;
      sums[w].count += 1;
    }
  }
  const out = {} as CategoryAverage;
  for (const w of WINDOWS) out[w] = sums[w].count > 0 ? { value: sums[w].total / sums[w].count, count: sums[w].count } : null;
  return out;
}
