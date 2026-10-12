import { addMonths, daysBetween, isoFromParts, type IsoDate } from "@/lib/dates";

export type NavPoint = { date: IsoDate; value: number };
export type SipResult = { units: number; invested: number; instalments: number; firstDate: IsoDate | null; lastDate: IsoDate | null };

/** First NAV on or after `date` (a SIP due on a holiday is processed the next business day). */
function navOnOrAfter(series: NavPoint[], date: IsoDate): NavPoint | null {
  let lo = 0;
  let hi = series.length - 1;
  let found: NavPoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date >= date) {
      found = series[mid];
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return found;
}

/**
 * Replays a monthly SIP at real historical NAVs: `amount` invested on `dayOfMonth` of every month from
 * `start` up to `end`. Used to give Meera realistic sample holdings instead of made-up rupee figures.
 */
export function simulateSip(series: NavPoint[], amount: number, start: IsoDate, end: IsoDate, dayOfMonth = 5): SipResult {
  let units = 0;
  let invested = 0;
  let instalments = 0;
  let firstDate: IsoDate | null = null;
  let lastDate: IsoDate | null = null;
  const [y, m] = start.split("-").map(Number);
  for (let due = isoFromParts(y, m, dayOfMonth); due <= end; due = addMonths(due, 1)) {
    const p = navOnOrAfter(series, due);
    // A NAV weeks after the due date means the fund didn't exist yet (or wasn't publishing) that month.
    if (!p || p.date > end || p.value <= 0 || daysBetween(due, p.date) > 10) continue;
    units += amount / p.value;
    invested += amount;
    instalments++;
    firstDate ??= p.date;
    lastDate = p.date;
  }
  return { units: Math.round(units * 1000) / 1000, invested, instalments, firstDate, lastDate };
}
