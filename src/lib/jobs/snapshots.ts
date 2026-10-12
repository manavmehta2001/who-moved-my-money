import { getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { weeklySnapshots, type Benchmark, type Fund } from "@/db/schema";
import { activeFunds, allBenchmarks, benchmarkSeries, navSeries, peersFor, type JobContext } from "@/db/queries";
import { addDays, lastNFridays, type IsoDate } from "@/lib/dates";
import { buildFundSnapshots, type BenchSource, type SnapshotRow } from "@/lib/engine/snapshots";
import type { Point } from "@/lib/engine/returns";
import { peerHistoryCutoff, SNAPSHOT_WEEKS } from "./ingest";

function toBenchSource(b: Benchmark | undefined, series: Map<string, Point[]>): BenchSource | null {
  if (!b) return null;
  return {
    key: b.key,
    label: b.label,
    sourceType: b.sourceType,
    sourceRef: b.sourceRef,
    sourceName: b.sourceName,
    isTriApprox: b.isTriApprox,
    currency: b.currency,
    series: series.get(b.key) ?? [],
  };
}

const PK = new Set(["weekEnding", "schemeCode"]);
const UPSERT_SET = Object.fromEntries(
  Object.entries(getTableColumns(weeklySnapshots))
    .filter(([key]) => !PK.has(key))
    .map(([key, col]) => [key, sql.raw(`excluded."${col.name}"`)]),
);

export async function upsertSnapshots(rows: SnapshotRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200).map((r) => ({ ...r, computedAt: new Date() }));
    await db()
      .insert(weeklySnapshots)
      .values(part)
      .onConflictDoUpdate({ target: [weeklySnapshots.weekEnding, weeklySnapshots.schemeCode], set: UPSERT_SET });
  }
}

/** Builds and stores snapshots for the last `weeks` Fridays ending at `latestWeek`, for the given (default: all active) funds. */
export async function computeSnapshots(
  ctx: JobContext,
  latestWeek: IsoDate,
  opts: { weeks?: number; funds?: Fund[] } = {},
): Promise<{ weeks: IsoDate[]; rows: SnapshotRow[] }> {
  const weeks = lastNFridays(latestWeek, opts.weeks ?? SNAPSHOT_WEEKS);
  const fundList = opts.funds ?? (await activeFunds());
  const benches = new Map((await allBenchmarks()).map((b) => [b.key, b]));
  const from = addDays(peerHistoryCutoff(latestWeek, weeks.length), -5);

  const groups = [...new Set(fundList.map((f) => f.peerGroup))];
  const peerCodesByGroup = new Map<string, string[]>();
  for (const g of groups) peerCodesByGroup.set(g, (await peersFor(g)).map((p) => p.schemeCode));
  const allCodes = [...new Set([...fundList.map((f) => f.schemeCode), ...[...peerCodesByGroup.values()].flat()])];

  const navs = await navSeries(allCodes, from, latestWeek);
  const benchKeys = fundList.flatMap((f) => {
    const b = f.benchmarkKey ? benches.get(f.benchmarkKey) : undefined;
    return b ? [b.key, ...(b.fallbackKey ? [b.fallbackKey] : [])] : [];
  });
  const benchVals = await benchmarkSeries([...new Set(benchKeys)], from, latestWeek);

  const rows: SnapshotRow[] = [];
  for (const f of fundList) {
    const primary = f.benchmarkKey ? benches.get(f.benchmarkKey) : undefined;
    const peers = new Map((peerCodesByGroup.get(f.peerGroup) ?? []).map((c) => [c, navs.get(c) ?? []] as const));
    const fundRows = buildFundSnapshots(
      { schemeCode: f.schemeCode, name: f.name, assetClass: f.assetClass, peerGroup: f.peerGroup, benchmarkKey: f.benchmarkKey },
      weeks,
      {
        fundSeries: navs.get(f.schemeCode) ?? [],
        primary: toBenchSource(primary, benchVals),
        fallback: toBenchSource(primary?.fallbackKey ? benches.get(primary.fallbackKey) : undefined, benchVals),
        peers,
      },
    );
    if (fundRows.length < weeks.length) ctx.warn(`${f.name}: only ${fundRows.length} of ${weeks.length} weeks could be computed (missing NAVs).`);
    rows.push(...fundRows);
  }
  await upsertSnapshots(rows);
  ctx.details.snapshots = { weeks: weeks.length, rows: rows.length, latestWeek };
  return { weeks, rows };
}
