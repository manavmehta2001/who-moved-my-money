import { allBenchmarks, upsertBenchmarkValues, type JobContext } from "@/db/queries";
import { amfiSnapshot } from "@/lib/funds/lookup";
import { currentWeekEnding, type IsoDate } from "@/lib/dates";
import { settleLimit } from "@/lib/http";
import {
  activeFundGroups,
  backfillFundHistory,
  backfillPeerHistory,
  MF_CONCURRENCY,
  peerCodesForGroups,
  peerHistoryCutoff,
  refreshPeerGroups,
  syncBenchmarkDefs,
  syncBenchmarkHistory,
  upsertLatestNavsFromAmfi,
} from "./ingest";
import { computeSnapshots } from "./snapshots";
import { generateReport } from "./report";

/**
 * Daily (≈11:30 PM IST): one AMFI download gives today's NAV for Meera's funds, every peer and the
 * index-fund proxies; Yahoo refreshes the last month of index levels. Upserts only, so re-runs are harmless.
 */
export async function runDailyNav(ctx: JobContext) {
  await syncBenchmarkDefs();
  const { list, groups } = await activeFundGroups();
  const peerCodes = await peerCodesForGroups(groups);
  const navs = await upsertLatestNavsFromAmfi([...list.map((f) => f.schemeCode), ...peerCodes]);
  if (navs.missing.length) ctx.warn(`${navs.missing.length} tracked schemes had no NAV in today's AMFI file.`);

  const snapshot = await amfiSnapshot();
  const proxies = (await allBenchmarks()).filter((b) => b.sourceType === "mf_proxy");
  let proxiesUpdated = 0;
  for (const b of proxies) {
    const row = snapshot.byCode.get(b.sourceRef);
    if (row?.nav && row.navDate) {
      await upsertBenchmarkValues(b.key, [{ date: row.navDate, value: row.nav }]);
      proxiesUpdated++;
    } else ctx.warn(`Benchmark proxy ${b.key} (${b.sourceRef}) missing from AMFI today.`);
  }

  const yahooCtx: JobContext = { details: {}, warn: ctx.warn };
  const yahoo = await syncBenchmarkHistory(yahooCtx, { yahooRange: "1mo" });
  const latestAmfiDate = snapshot.rows.reduce<IsoDate>((m, r) => (r.navDate && r.navDate > m ? r.navDate : m), "0000-00-00");
  Object.assign(ctx.details, { navsUpdated: navs.updated, proxiesUpdated, yahooSeries: Object.keys(yahoo).length, latestAmfiDate });
  return { navsUpdated: navs.updated, proxiesUpdated, latestAmfiDate };
}

/**
 * Saturday (≈7:00 AM IST), and the "Generate this week's report now" button: refresh peers, repair any NAV
 * gaps, recompute 12 weeks of snapshots, fetch the week's news once, run the verdict engine and write the report.
 * Every step upserts, so running it twice for the same week updates rows and never duplicates them.
 */
export async function runWeeklyReport(ctx: JobContext, opts: { weekEnding?: IsoDate; refreshNews?: boolean; deadlineMs?: number } = {}) {
  const weekEnding = opts.weekEnding ?? currentWeekEnding();
  const started = Date.now();
  await syncBenchmarkDefs();
  const { list, groups } = await activeFundGroups();
  if (list.length === 0) throw new Error("There are no funds to report on. Add a fund first.");

  const fundResults = await settleLimit(list, MF_CONCURRENCY, (f) => backfillFundHistory(f.schemeCode));
  for (const r of fundResults) if (!r.ok) ctx.warn(`NAV refresh for ${r.item.name} failed: ${r.error}`);

  await syncBenchmarkHistory(ctx, { yahooRange: "1mo" });
  const peerGroups = await refreshPeerGroups(ctx, groups);
  const ownCodes = new Set(list.map((f) => f.schemeCode));
  const peerCodes = (await peerCodesForGroups(groups)).filter((c) => !ownCodes.has(c));
  // Leave time for snapshots, news and Gemini even if many peers need repair.
  const deadline = started + (opts.deadlineMs ?? 150_000);
  const peers = await backfillPeerHistory(ctx, peerCodes, peerHistoryCutoff(weekEnding), { deadline });
  if (peers.remaining > 0) ctx.warn(`${peers.remaining} similar funds weren't refreshed in time; averages use the data already stored.`);

  await computeSnapshots(ctx, weekEnding);
  const report = await generateReport(ctx, weekEnding, { forceNews: opts.refreshNews });
  Object.assign(ctx.details, { weekEnding, peerGroups, peers });
  return { weekEnding, verdict: report.report.verdict, writtenBy: report.report.writtenBy, worryScore: report.report.worryScore };
}
