import { currentWeekEnding } from "@/lib/dates";
import { settleLimit } from "@/lib/http";
import type { JobContext } from "@/db/queries";
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
} from "./ingest";

export type BackfillResult = {
  weekEnding: string;
  funds: Record<string, number | string>;
  benchmarks: Record<string, number>;
  peerGroups: Record<string, number>;
  peers: { fetched: number; skipped: number; failed: number; remaining: number };
  done: boolean;
};

/**
 * Pulls everything the engine needs. Re-runnable: every write is an upsert, and peers that already have
 * the needed window are skipped. With a `deadline` it stops early and reports `done: false` so the
 * caller (the admin route) can call again.
 */
export async function runDataBackfill(ctx: JobContext, opts: { deadline?: number; onlyFund?: string } = {}): Promise<BackfillResult> {
  const weekEnding = currentWeekEnding();
  await syncBenchmarkDefs();
  const { list, groups } = await activeFundGroups();
  const targets = opts.onlyFund ? list.filter((f) => f.schemeCode === opts.onlyFund) : list;
  const targetGroups = opts.onlyFund ? [...new Set(targets.map((f) => f.peerGroup))] : groups;

  const fundResults = await settleLimit(targets, MF_CONCURRENCY, (f) => backfillFundHistory(f.schemeCode));
  const fundsOut: Record<string, number | string> = {};
  for (const r of fundResults) {
    fundsOut[r.item.schemeCode] = r.ok ? r.value : `failed: ${r.error}`;
    if (!r.ok) ctx.warn(`NAV history for ${r.item.schemeCode} failed: ${r.error}`);
  }

  const benchmarksOut = await syncBenchmarkHistory(ctx);
  const peerGroups = await refreshPeerGroups(ctx, targetGroups);
  const peerCodes = (await peerCodesForGroups(targetGroups)).filter((c) => !list.some((f) => f.schemeCode === c));
  const peers = await backfillPeerHistory(ctx, peerCodes, peerHistoryCutoff(weekEnding), { deadline: opts.deadline });

  Object.assign(ctx.details, { weekEnding, funds: fundsOut, peerGroups, peers });
  return { weekEnding, funds: fundsOut, benchmarks: benchmarksOut, peerGroups, peers, done: peers.remaining === 0 };
}
