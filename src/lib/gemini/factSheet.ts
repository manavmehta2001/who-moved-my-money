import type { Headline, IndexMove, Verdict } from "@/db/types";
import type { SnapshotRow } from "@/lib/engine/snapshots";
import { dominantDriver, DRIVER_LABEL } from "@/lib/engine/decomposition";
import { isLagging, type PortfolioVerdict } from "@/lib/engine/verdict";
import { VERDICT_CONFIG } from "@/config/verdict";
import { formatDisplayDate } from "@/lib/dates";

/** Percent with 2 decimals as a number: 0.018234 → 1.82. Everything Gemini sees is already rounded like this. */
const p2 = (x: number | null | undefined): number | null => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10_000) / 100);

export type FactSheetFund = {
  schemeCode: string;
  name: string;
  kind: string;
  isDebt: boolean;
  /** All returns in percent, 2 decimals. */
  thisWeek: { fund: number | null; market: number | null; similarFunds: number | null };
  pastMonth: { fund: number | null; market: number | null; similarFunds: number | null };
  thisYear: { fund: number | null; market: number | null; similarFunds: number | null; sinceLaunch: boolean };
  /** Gaps in percentage points, 2 decimals. Positive = fund ahead. */
  gaps: { weekVsSimilar: number | null; weekVsMarket: number | null; monthVsSimilar: number | null; monthVsMarket: number | null; yearVsSimilar: number | null; yearVsMarket: number | null };
  whoMovedItThisWeek: {
    theMarket: number | null;
    fundsLikeYours: number | null;
    yourFundsChoices: number | null;
    biggestPart: string | null;
    note: string | null;
  };
  marketYardstick: string | null;
  similarFundsCompared: number;
  weeksBehindSimilarFundsOfLast4: number;
  warnings: string[];
};

export type FactSheet = {
  weekEnding: string;
  weekLabel: string;
  verdict: Verdict;
  verdictFacts: string;
  worryScoreOutOf100: number;
  funds: FactSheetFund[];
  marketThisWeek: Array<{ index: string; weekChangePercent: number | null }>;
  headlines: Array<{ id: string; title: string; source: string; date: string }>;
};

/** "HDFC Mid Cap Fund - Direct Plan - Growth Option" → "HDFC Mid Cap Fund". */
export function shortFundName(name: string): string {
  return name
    .replace(/\s*[-–(]\s*(direct|regular)\b.*$/i, "")
    .replace(/\s*-\s*growth.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitNote(r: SnapshotRow): string | null {
  if (r.market1w === null && r.similarFunds1w !== null) return "No public benchmark exists for this fund, so 'funds like yours' here is the whole average of similar funds, not the part beyond the market.";
  if (r.similarFunds1w === null && r.market1w !== null) return "No similar funds were available, so the split is only market vs the fund's own choices.";
  return null;
}

export function buildFactSheet(input: {
  weekEnding: string;
  verdict: PortfolioVerdict;
  latest: Array<{ name: string; categoryLabel: string; assetClass: string; row: SnapshotRow; history: SnapshotRow[] }>;
  indexMoves: IndexMove[];
  headlines: Headline[];
}): FactSheet {
  const window = VERDICT_CONFIG.equity.persistenceWindowWeeks;
  return {
    weekEnding: input.weekEnding,
    weekLabel: `the week ending ${formatDisplayDate(input.weekEnding)}`,
    verdict: input.verdict.verdict,
    verdictFacts: input.verdict.reason,
    worryScoreOutOf100: input.verdict.worry.score,
    funds: input.latest.map(({ name, categoryLabel, assetClass, row: r, history }) => {
      const gap = (a: number | null, b: number | null) => (a === null || b === null ? null : p2(a - b));
      const driver = dominantDriver({ market: r.market1w, similarFunds: r.similarFunds1w, fundChoices: r.fundChoices1w });
      return {
        schemeCode: r.schemeCode,
        name: shortFundName(name),
        kind: categoryLabel,
        isDebt: assetClass === "debt",
        thisWeek: { fund: p2(r.fundRet1w), market: p2(r.benchRet1w), similarFunds: p2(r.catRet1w) },
        pastMonth: { fund: p2(r.fundRet1m), market: p2(r.benchRet1m), similarFunds: p2(r.catRet1m) },
        thisYear: { fund: p2(r.fundRetYtd), market: p2(r.benchRetYtd), similarFunds: p2(r.catRetYtd), sinceLaunch: r.provenance.ytdFromInception },
        gaps: {
          weekVsSimilar: gap(r.fundRet1w, r.catRet1w),
          weekVsMarket: gap(r.fundRet1w, r.benchRet1w),
          monthVsSimilar: gap(r.fundRet1m, r.catRet1m),
          monthVsMarket: gap(r.fundRet1m, r.benchRet1m),
          yearVsSimilar: r.provenance.ytdFromInception ? null : gap(r.fundRetYtd, r.catRetYtd),
          yearVsMarket: gap(r.fundRetYtd, r.benchRetYtd),
        },
        whoMovedItThisWeek: {
          theMarket: p2(r.market1w),
          fundsLikeYours: p2(r.similarFunds1w),
          yourFundsChoices: p2(r.fundChoices1w),
          biggestPart: driver ? DRIVER_LABEL[driver] : null,
          note: splitNote(r),
        },
        marketYardstick: r.provenance.benchmark?.label ?? null,
        similarFundsCompared: r.peerCount,
        weeksBehindSimilarFundsOfLast4: history.slice(-window).filter((h) => isLagging(h.fundChoices1w)).length,
        warnings: r.flags.map((f) => f.reason),
      };
    }),
    marketThisWeek: input.indexMoves.map((m) => ({ index: m.label, weekChangePercent: p2(m.weekReturn) })),
    headlines: input.headlines.map((h) => ({ id: h.id, title: h.title, source: h.source, date: h.publishedAt.slice(0, 10) })),
  };
}

/**
 * Every number a writer may quote as a percentage, in absolute value (so "fell 1.82%" matches −1.82).
 * With `schemeCode`, only that fund's numbers count (plus market moves and the verdict facts), so one fund's
 * summary can't borrow a near-miss number from another fund.
 */
export function allowedPercentages(sheet: FactSheet, schemeCode?: string): number[] {
  const out = new Set<number>();
  const add = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(Math.abs(v));
  };
  for (const f of sheet.funds) {
    if (schemeCode && f.schemeCode !== schemeCode) continue;
    for (const block of [f.thisWeek, f.pastMonth, f.thisYear, f.gaps, f.whoMovedItThisWeek]) Object.values(block).forEach(add);
    for (const w of f.warnings) for (const m of w.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percentage points?)/g)) out.add(Number(m[1]));
  }
  sheet.marketThisWeek.forEach((m) => add(m.weekChangePercent));
  for (const m of sheet.verdictFacts.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percentage points?)/g)) out.add(Number(m[1]));
  return [...out];
}
