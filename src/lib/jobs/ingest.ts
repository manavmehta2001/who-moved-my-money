import { buildPeerGroups } from "@/lib/sources/amfi";
import { fetchScheme } from "@/lib/sources/mfapi";
import { fetchYahooDaily } from "@/lib/sources/yahoo";
import { BENCHMARKS } from "@/lib/sources/benchmarkCatalog";
import { amfiSnapshot } from "@/lib/funds/lookup";
import { settleLimit } from "@/lib/http";
import { addDays, addMonths, endOfPreviousYear, todayIST, type IsoDate } from "@/lib/dates";
import {
  activeFunds,
  lastNavDates,
  replacePeerGroup,
  upsertBenchmarkDefs,
  upsertBenchmarkValues,
  upsertNavRows,
  upsertNavs,
  peersFor,
  type JobContext,
} from "@/db/queries";

export const MF_CONCURRENCY = 5;
export const SNAPSHOT_WEEKS = 12;

/**
 * Earliest date peers need NAVs from: the YTD base (31 Dec of the previous year) and the 1M base of the
 * oldest snapshot week, minus a 10-day cushion for "last NAV on or before" across holidays.
 */
export function peerHistoryCutoff(latestWeekEnding: IsoDate, weeks = SNAPSHOT_WEEKS): IsoDate {
  const earliestWeek = addDays(latestWeekEnding, -7 * (weeks - 1));
  const ytdBase = endOfPreviousYear(earliestWeek);
  const monthBase = addMonths(earliestWeek, -1);
  const base = ytdBase < monthBase ? ytdBase : monthBase;
  return addDays(base, -10);
}

export async function syncBenchmarkDefs(): Promise<void> {
  await upsertBenchmarkDefs(BENCHMARKS);
}

/** Full history for index-fund proxies (mfapi) and ~2 years of index levels (Yahoo). Yahoo failures are warnings, never fatal. */
export async function syncBenchmarkHistory(ctx: JobContext, opts: { yahooRange?: "1mo" | "2y" } = {}): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const proxies = BENCHMARKS.filter((b) => b.sourceType === "mf_proxy");
  const proxyResults = await settleLimit(proxies, MF_CONCURRENCY, async (b) => {
    const s = await fetchScheme(b.sourceRef);
    return upsertBenchmarkValues(b.key, s.navs.map((p) => ({ date: p.date, value: p.nav })));
  });
  for (const r of proxyResults) {
    if (r.ok) counts[r.item.key] = r.value;
    else ctx.warn(`Benchmark proxy ${r.item.key} (${r.item.sourceRef}) failed: ${r.error}`);
  }
  const indices = BENCHMARKS.filter((b) => b.sourceType === "yahoo");
  const yahooResults = await settleLimit(indices, 3, async (b) => {
    const { points } = await fetchYahooDaily(b.sourceRef, opts.yahooRange ?? "2y");
    return upsertBenchmarkValues(b.key, points);
  });
  for (const r of yahooResults) {
    if (r.ok) counts[r.item.key] = r.value;
    else ctx.warn(`Yahoo ${r.item.sourceRef} unavailable (proxy funds will be used instead): ${r.error}`);
  }
  return counts;
}

/** Rebuilds peer membership for the given peer groups from AMFI's current list. */
export async function refreshPeerGroups(ctx: JobContext, groups: string[]): Promise<Record<string, number>> {
  const snapshot = await amfiSnapshot(true);
  const latestAmfiDate = snapshot.rows.reduce<IsoDate>((m, r) => (r.navDate && r.navDate > m ? r.navDate : m), "0000-00-00");
  const byGroup = buildPeerGroups(snapshot.rows, latestAmfiDate);
  const out: Record<string, number> = {};
  for (const group of new Set(groups)) {
    const members = (byGroup.get(group) ?? []).map((r) => ({ schemeCode: r.schemeCode, schemeName: r.schemeName }));
    if (members.length === 0) ctx.warn(`No similar funds found for peer group "${group}"; category comparison will be skipped.`);
    await replacePeerGroup(group, members);
    out[group] = members.length;
  }
  return out;
}

/** Full NAV history for one of Meera's funds. */
export async function backfillFundHistory(schemeCode: string): Promise<number> {
  const s = await fetchScheme(schemeCode);
  return upsertNavs(schemeCode, s.navs);
}

/** Peer NAVs from `cutoff`, skipping peers whose stored history already covers the window. */
export async function backfillPeerHistory(ctx: JobContext, peerCodes: string[], cutoff: IsoDate, opts: { deadline?: number } = {}): Promise<{ fetched: number; skipped: number; failed: number; remaining: number }> {
  const existing = await lastNavDates(peerCodes);
  const freshEnough = addDays(todayIST(), -6);
  const todo = peerCodes.filter((c) => {
    const e = existing.get(c);
    return !e || e.first > addDays(cutoff, 10) || e.last < freshEnough;
  });
  let fetched = 0;
  let failed = 0;
  let remaining = 0;
  await settleLimit(todo, MF_CONCURRENCY, async (code) => {
    if (opts.deadline && Date.now() > opts.deadline) {
      remaining++;
      return;
    }
    try {
      const s = await fetchScheme(code);
      const rows = s.navs.filter((p) => p.date >= cutoff).map((p) => ({ schemeCode: code, navDate: p.date, nav: p.nav }));
      await upsertNavRows(rows);
      fetched++;
    } catch (e) {
      failed++;
      ctx.warn(`Peer ${code} history failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  return { fetched, skipped: peerCodes.length - todo.length, failed, remaining };
}

export async function peerCodesForGroups(groups: string[]): Promise<string[]> {
  const codes = new Set<string>();
  for (const g of new Set(groups)) for (const p of await peersFor(g)) codes.add(p.schemeCode);
  return [...codes];
}

/** Latest NAV for every tracked scheme from one AMFI download (daily job). */
export async function upsertLatestNavsFromAmfi(schemeCodes: string[]): Promise<{ updated: number; missing: string[] }> {
  const snapshot = await amfiSnapshot(true);
  const rows: Array<{ schemeCode: string; navDate: IsoDate; nav: number }> = [];
  const missing: string[] = [];
  for (const code of new Set(schemeCodes)) {
    const r = snapshot.byCode.get(code);
    if (r?.nav && r.navDate) rows.push({ schemeCode: code, navDate: r.navDate, nav: r.nav });
    else missing.push(code);
  }
  await upsertNavRows(rows);
  return { updated: rows.length, missing };
}

export async function activeFundGroups() {
  const list = await activeFunds();
  return { list, groups: [...new Set(list.map((f) => f.peerGroup))] };
}
