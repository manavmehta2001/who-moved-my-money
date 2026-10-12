import type { BenchmarkProvenance, FundFlag, Provenance } from "@/db/types";
import type { IsoDate } from "@/lib/dates";
import { categoryAverage } from "./categoryAverage";
import { decompose } from "./decomposition";
import { computeReturns, type Point, type ReturnSet } from "./returns";
import { fundFlags, type AssetClass, type WeekFacts } from "./verdict";

export type FundSpec = { schemeCode: string; name: string; assetClass: AssetClass; peerGroup: string; benchmarkKey: string | null };

export type BenchSource = {
  key: string;
  label: string;
  sourceType: "mf_proxy" | "yahoo";
  sourceRef: string;
  sourceName: string | null;
  isTriApprox: boolean;
  currency: string;
  series: Point[];
};

export type SnapshotInputs = {
  fundSeries: Point[];
  primary: BenchSource | null;
  fallback: BenchSource | null;
  peers: Map<string, Point[]>;
};

export type SnapshotRow = {
  weekEnding: IsoDate;
  schemeCode: string;
  nav: number;
  navDate: IsoDate;
  fundRet1w: number | null;
  fundRet1m: number | null;
  fundRetYtd: number | null;
  benchRet1w: number | null;
  benchRet1m: number | null;
  benchRetYtd: number | null;
  catRet1w: number | null;
  catRet1m: number | null;
  catRetYtd: number | null;
  market1w: number | null;
  similarFunds1w: number | null;
  fundChoices1w: number | null;
  market1m: number | null;
  similarFunds1m: number | null;
  fundChoices1m: number | null;
  peerCount: number;
  flags: FundFlag[];
  provenance: Provenance;
};

export const NO_BENCHMARK_NOTE = "Benchmark data isn't publicly available for this fund, so we compare it with similar funds instead.";

function pickBenchmark(inputs: SnapshotInputs, weekEnding: IsoDate): { source: BenchSource; returns: ReturnSet; usedFallback: boolean } | null {
  if (inputs.primary) {
    const r = computeReturns(inputs.primary.series, weekEnding);
    if (r["1w"]) return { source: inputs.primary, returns: r, usedFallback: false };
  }
  if (inputs.fallback) {
    const r = computeReturns(inputs.fallback.series, weekEnding);
    if (r["1w"]) return { source: inputs.fallback, returns: r, usedFallback: true };
  }
  return null;
}

function benchmarkNote(fund: FundSpec, picked: ReturnType<typeof pickBenchmark>): string | null {
  if (!fund.benchmarkKey) return NO_BENCHMARK_NOTE;
  if (!picked) return "Benchmark data was missing this week, so this fund is compared with similar funds only.";
  const notes: string[] = [];
  if (picked.usedFallback) notes.push("The index-fund proxy had no data this week, so the index level from Yahoo Finance was used (price only, dividends not included).");
  if (picked.source.currency !== "INR") notes.push(`The index is measured in ${picked.source.currency === "USD" ? "US dollars" : picked.source.currency}, so rupee moves aren't included.`);
  return notes.length ? notes.join(" ") : null;
}

/** One fund, one week. Flags are filled in by `buildFundSnapshots`, which knows the previous weeks. */
export function buildSnapshot(fund: FundSpec, weekEnding: IsoDate, inputs: SnapshotInputs): SnapshotRow | null {
  const fr = computeReturns(inputs.fundSeries, weekEnding, { allowYtdFromInception: true });
  const end = fr["1w"]?.end ?? fr["1m"]?.end ?? fr.ytd?.end;
  if (!end) return null;

  const picked = fund.benchmarkKey ? pickBenchmark(inputs, weekEnding) : null;
  const cat = categoryAverage(inputs.peers, fund.schemeCode, weekEnding);
  const bench = picked?.returns;

  const d1w = fr["1w"] ? decompose(fr["1w"].value, bench?.["1w"]?.value ?? null, cat["1w"]?.value ?? null) : null;
  const d1m = fr["1m"] ? decompose(fr["1m"].value, bench?.["1m"]?.value ?? null, cat["1m"]?.value ?? null) : null;
  // YTD-from-launch isn't comparable with peers' calendar-year returns, so its category comparison is dropped.
  const catYtd = fr.ytdFromInception ? null : (cat.ytd?.value ?? null);

  const benchProv: BenchmarkProvenance | null = picked
    ? {
        key: picked.source.key,
        label: picked.source.label,
        sourceType: picked.source.sourceType,
        sourceRef: picked.source.sourceRef,
        sourceName: picked.source.sourceName,
        isTriApprox: picked.source.isTriApprox,
        currency: picked.source.currency,
        usedFallback: picked.usedFallback,
        asOf: picked.returns["1w"]?.end.date ?? null,
      }
    : null;

  return {
    weekEnding,
    schemeCode: fund.schemeCode,
    nav: end.value,
    navDate: end.date,
    fundRet1w: fr["1w"]?.value ?? null,
    fundRet1m: fr["1m"]?.value ?? null,
    fundRetYtd: fr.ytd?.value ?? null,
    benchRet1w: bench?.["1w"]?.value ?? null,
    benchRet1m: bench?.["1m"]?.value ?? null,
    benchRetYtd: bench?.ytd?.value ?? null,
    catRet1w: cat["1w"]?.value ?? null,
    catRet1m: cat["1m"]?.value ?? null,
    catRetYtd: catYtd,
    market1w: d1w?.market ?? null,
    similarFunds1w: d1w?.similarFunds ?? null,
    fundChoices1w: d1w?.fundChoices ?? null,
    market1m: d1m?.market ?? null,
    similarFunds1m: d1m?.similarFunds ?? null,
    fundChoices1m: d1m?.fundChoices ?? null,
    peerCount: cat["1w"]?.count ?? 0,
    flags: [],
    provenance: {
      navSource: "mfapi.in (history) + AMFI NAVAll (daily)",
      navAsOf: end.date,
      benchmark: benchProv,
      benchmarkNote: benchmarkNote(fund, picked),
      peerGroup: fund.peerGroup,
      peerCount1w: cat["1w"]?.count ?? 0,
      peerCount1m: cat["1m"]?.count ?? 0,
      peerCountYtd: fr.ytdFromInception ? 0 : (cat.ytd?.count ?? 0),
      ytdFromInception: fr.ytdFromInception,
      ytdStartDate: fr.ytd?.start.date ?? null,
    },
  };
}

export function toWeekFacts(r: SnapshotRow): WeekFacts {
  return {
    weekEnding: r.weekEnding,
    fundRet1w: r.fundRet1w,
    fundRet1m: r.fundRet1m,
    fundRetYtd: r.fundRetYtd,
    catRet1w: r.catRet1w,
    catRet1m: r.catRet1m,
    catRetYtd: r.catRetYtd,
    fundChoices1w: r.fundChoices1w,
    ytdFromInception: r.provenance.ytdFromInception,
  };
}

/** All weeks for one fund, oldest first, each with flags computed from that week and the weeks before it. */
export function buildFundSnapshots(fund: FundSpec, weeks: IsoDate[], inputs: SnapshotInputs): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  for (const week of [...weeks].sort()) {
    const row = buildSnapshot(fund, week, inputs);
    if (!row) continue;
    row.flags = fundFlags(fund.assetClass, [...rows, row].map(toWeekFacts));
    rows.push(row);
  }
  return rows;
}
