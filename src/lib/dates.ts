/** All dates are ISO "YYYY-MM-DD" strings in Asia/Kolkata. Arithmetic is done on UTC midnight so DST/offsets never shift a day. */
export type IsoDate = string;

export const IST = "Asia/Kolkata";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function isoFromParts(y: number, m: number, d: number): IsoDate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function toUtc(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt: Date): IsoDate {
  return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function isValidIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return fromUtc(toUtc(iso)) === iso;
}

/** mfapi: "09-10-2026" */
export function parseDdMmYyyy(s: string): IsoDate | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = isoFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  return isValidIso(iso) ? iso : null;
}

/** AMFI: "09-Oct-2026" */
export function parseDdMonYyyy(s: string): IsoDate | null {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const iso = isoFromParts(Number(m[3]), month, Number(m[1]));
  return isValidIso(iso) ? iso : null;
}

export function todayIST(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const dt = toUtc(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

/** Same day-of-month `months` earlier/later, clamped to month end (31 Mar − 1M → 28/29 Feb). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return isoFromParts(ny, nm, Math.min(d, lastDay));
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso: IsoDate): number {
  return toUtc(iso).getUTCDay();
}

/** The most recent Friday on or before `iso`. */
export function fridayOnOrBefore(iso: IsoDate): IsoDate {
  const back = (dayOfWeek(iso) - 5 + 7) % 7;
  return addDays(iso, -back);
}

/** The week a report covers: on Saturday that's yesterday; on Friday before results are in, it's still last Friday. */
export function currentWeekEnding(now: Date = new Date()): IsoDate {
  const today = todayIST(now);
  if (dayOfWeek(today) === 5) return addDays(today, -7);
  return fridayOnOrBefore(today);
}

/** The last `n` Fridays ending with `latest`, oldest first. */
export function lastNFridays(latest: IsoDate, n: number): IsoDate[] {
  return Array.from({ length: n }, (_, i) => addDays(latest, -7 * (n - 1 - i)));
}

export function endOfPreviousYear(iso: IsoDate): IsoDate {
  return `${Number(iso.slice(0, 4)) - 1}-12-31`;
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function formatDisplayDate(iso: IsoDate): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(toUtc(iso));
}
