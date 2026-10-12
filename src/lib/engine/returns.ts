import { addDays, addMonths, daysBetween, endOfPreviousYear, type IsoDate } from "@/lib/dates";
import { DATA_CONFIG } from "@/config/verdict";

export type Point = { date: IsoDate; value: number };
export type WindowKey = "1w" | "1m" | "ytd";
export const WINDOWS: WindowKey[] = ["1w", "1m", "ytd"];

export type WindowReturn = { value: number; start: Point; end: Point };
export type ReturnSet = Record<WindowKey, WindowReturn | null> & { ytdFromInception: boolean };

/** Latest point on or before `date`, if it is no more than `maxStaleDays` older. `series` must be sorted oldest first. */
export function pointOnOrBefore(series: Point[], date: IsoDate, maxStaleDays: number): Point | null {
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  const p = series[found];
  return daysBetween(p.date, date) <= maxStaleDays ? p : null;
}

/**
 * Week = last value on/before Friday vs last value on/before the previous Friday.
 * 1M   = vs last value on/before the same date one month earlier (clamped to month end).
 * YTD  = vs last value of the previous calendar year; for a fund launched this year, vs its first value (flagged).
 */
export function windowBaseDates(weekEnding: IsoDate): Record<WindowKey, IsoDate> {
  return { "1w": addDays(weekEnding, -7), "1m": addMonths(weekEnding, -1), ytd: endOfPreviousYear(weekEnding) };
}

export function computeReturns(series: Point[], weekEnding: IsoDate, opts: { allowYtdFromInception?: boolean } = {}): ReturnSet {
  const empty: ReturnSet = { "1w": null, "1m": null, ytd: null, ytdFromInception: false };
  const end = pointOnOrBefore(series, weekEnding, DATA_CONFIG.endMaxStaleDays);
  if (!end) return empty;
  const bases = windowBaseDates(weekEnding);
  const out: ReturnSet = { ...empty };
  for (const w of WINDOWS) {
    let start = pointOnOrBefore(series, bases[w], DATA_CONFIG.baseMaxStaleDays);
    if (!start && w === "ytd" && opts.allowYtdFromInception && series.length > 0 && series[0].date > bases.ytd) {
      start = series[0];
      out.ytdFromInception = true;
    }
    if (!start || start.date >= end.date || start.value <= 0) continue;
    out[w] = { value: end.value / start.value - 1, start, end };
  }
  return out;
}
