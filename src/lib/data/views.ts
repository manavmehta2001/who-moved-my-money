import "server-only";
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { benchmarkHistory, benchmarks, funds, jobRuns, marketContext, navHistory, reports, weeklySnapshots, type Fund, type Report, type WeeklySnapshot } from "@/db/schema";
import type { Headline, IndexMove, Verdict } from "@/db/types";
import { addDays, isValidIso, type IsoDate } from "@/lib/dates";
import { normaliseCategory } from "@/lib/classify";
import { shortFundName } from "@/lib/gemini/factSheet";
import { geminiModel } from "@/lib/env";
import { SELECTABLE_BENCHMARKS } from "@/lib/sources/benchmarkCatalog";
import { VERDICT_CONFIG } from "@/config/verdict";
import { SNAPSHOT_WEEKS } from "@/lib/jobs/ingest";

export type VerdictState = "calm" | "watch" | "review";

export const VERDICT_STATE: Record<Verdict, VerdictState> = {
  "No action needed": "calm",
  "One fund worth watching": "watch",
  "Consider reviewing your allocation": "review",
};

export type FundCard = {
  schemeCode: string;
  name: string;
  shortName: string;
  categoryLabel: string;
  isDebt: boolean;
  summary: string;
  citedHeadlineIds: string[];
  latest: WeeklySnapshot;
  history: Array<Pick<WeeklySnapshot, "weekEnding" | "fundRet1w" | "benchRet1w" | "catRet1w" | "fundChoices1w">>;
  benchmarkLabel: string | null;
  flagged: boolean;
  holdings: {
    units: number | null;
    invested: number | null;
    sample: boolean;
    monthlySip: number | null;
    latestNav: number;
    latestNavDate: IsoDate;
    value: number | null;
    gain: number | null;
    gainPct: number | null;
    /** Rupee change over the report week, at today's units. */
    weekChange: number | null;
  };
};

export type PortfolioSummary = {
  value: number;
  invested: number;
  gain: number;
  gainPct: number;
  weekChange: number;
  weekChangePct: number;
  valueAsOf: IsoDate;
  sample: boolean;
  fundsWithHoldings: number;
  /** Portfolio value at each snapshot week, at today's units. */
  history: Array<{ weekEnding: IsoDate; value: number }>;
  allocation: Array<{ schemeCode: string; shortName: string; value: number; weight: number; targetWeight: number | null }>;
};

export type CheckinView = {
  report: Report;
  state: VerdictState;
  funds: FundCard[];
  indexMoves: IndexMove[];
  headlines: Headline[];
  newsProvider: string | null;
  removedSince: string[];
  isLatest: boolean;
  portfolio: PortfolioSummary | null;
};

async function reportFor(week?: string): Promise<Report | null> {
  const q = db().select().from(reports);
  const rows = week && isValidIso(week) ? await q.where(eq(reports.weekEnding, week)).limit(1) : await q.orderBy(desc(reports.weekEnding)).limit(1);
  return rows[0] ?? null;
}

export async function getCheckinView(week?: string): Promise<CheckinView | null> {
  const report = await reportFor(week);
  if (!report) return null;
  const [latestRow] = await db().select({ w: max(reports.weekEnding) }).from(reports);
  const codes = report.content.funds.map((f) => f.schemeCode);
  const fundRows = codes.length ? await db().select().from(funds).where(inArray(funds.schemeCode, codes)) : [];
  const from = addDays(report.weekEnding, -7 * (SNAPSHOT_WEEKS - 1));
  const snaps = codes.length
    ? await db()
        .select()
        .from(weeklySnapshots)
        .where(and(inArray(weeklySnapshots.schemeCode, codes), sql`${weeklySnapshots.weekEnding} between ${from} and ${report.weekEnding}`))
        .orderBy(asc(weeklySnapshots.weekEnding))
    : [];
  const [mc] = await db().select().from(marketContext).where(eq(marketContext.weekEnding, report.weekEnding)).limit(1);
  const benchLabels = new Map((await db().select({ key: benchmarks.key, label: benchmarks.label }).from(benchmarks)).map((b) => [b.key, b.label]));
  const latestNavRows = codes.length
    ? await db()
        .select({ code: navHistory.schemeCode, date: max(navHistory.navDate) })
        .from(navHistory)
        .where(inArray(navHistory.schemeCode, codes))
        .groupBy(navHistory.schemeCode)
    : [];
  const latestNavs = new Map<string, { date: IsoDate; nav: number }>();
  for (const r of latestNavRows) {
    if (!r.date) continue;
    const [row] = await db().select({ nav: navHistory.nav }).from(navHistory).where(and(eq(navHistory.schemeCode, r.code), eq(navHistory.navDate, r.date))).limit(1);
    if (row) latestNavs.set(r.code, { date: r.date, nav: row.nav });
  }

  const cards: FundCard[] = [];
  const removedSince: string[] = [];
  for (const c of report.content.funds) {
    const f = fundRows.find((x) => x.schemeCode === c.schemeCode);
    const history = snaps.filter((s) => s.schemeCode === c.schemeCode);
    const latest = history.find((s) => s.weekEnding === report.weekEnding);
    if (!f || !latest) continue;
    if (!f.isActive) removedSince.push(shortFundName(f.name));
    cards.push({
      schemeCode: f.schemeCode,
      name: f.name,
      shortName: shortFundName(f.name),
      categoryLabel: normaliseCategory(f.sebiCategory).category,
      isDebt: f.assetClass === "debt",
      summary: c.summary,
      citedHeadlineIds: c.citedHeadlineIds,
      latest,
      history: history.map(({ weekEnding, fundRet1w, benchRet1w, catRet1w, fundChoices1w }) => ({ weekEnding, fundRet1w, benchRet1w, catRet1w, fundChoices1w })),
      benchmarkLabel: latest.provenance.benchmark?.label ?? (f.benchmarkKey ? (benchLabels.get(f.benchmarkKey) ?? null) : null),
      flagged: latest.flags.length > 0,
      holdings: holdingsFor(f, latest, latestNavs.get(f.schemeCode)),
    });
  }

  return {
    report,
    state: VERDICT_STATE[report.verdict],
    funds: cards,
    indexMoves: mc?.indexMoves ?? [],
    headlines: mc?.headlines ?? [],
    newsProvider: mc?.newsProvider ?? null,
    removedSince,
    isLatest: latestRow?.w === report.weekEnding,
    portfolio: portfolioSummary(cards, snaps),
  };
}

function holdingsFor(f: Fund, latest: WeeklySnapshot, nav: { date: IsoDate; nav: number } | undefined): FundCard["holdings"] {
  const latestNav = nav?.nav ?? latest.nav;
  const latestNavDate = nav?.date ?? latest.navDate;
  const units = f.unitsHeld;
  const value = units ? units * latestNav : null;
  const invested = f.investedAmount;
  const gain = value !== null && invested ? value - invested : null;
  const r = latest.fundRet1w;
  return {
    units,
    invested,
    sample: f.holdingsSample,
    monthlySip: f.monthlySip,
    latestNav,
    latestNavDate,
    value,
    gain,
    gainPct: gain !== null && invested ? gain / invested : null,
    weekChange: units && r !== null ? units * latest.nav * (r / (1 + r)) : null,
  };
}

function portfolioSummary(cards: FundCard[], snaps: WeeklySnapshot[]): PortfolioSummary | null {
  const held = cards.filter((c) => c.holdings.value !== null);
  if (held.length === 0) return null;
  const value = held.reduce((a, c) => a + (c.holdings.value ?? 0), 0);
  const invested = held.reduce((a, c) => a + (c.holdings.invested ?? 0), 0);
  const weekChange = held.reduce((a, c) => a + (c.holdings.weekChange ?? 0), 0);
  const totalSip = cards.every((c) => c.holdings.monthlySip) ? cards.reduce((a, c) => a + (c.holdings.monthlySip ?? 0), 0) : null;
  const weeks = [...new Set(snaps.map((s) => s.weekEnding))].sort();
  const history = weeks.map((w) => ({
    weekEnding: w,
    value: held.reduce((a, c) => a + (c.holdings.units ?? 0) * (snaps.find((s) => s.schemeCode === c.schemeCode && s.weekEnding === w)?.nav ?? 0), 0),
  }));
  return {
    value,
    invested,
    gain: value - invested,
    gainPct: invested ? (value - invested) / invested : 0,
    weekChange,
    weekChangePct: value - weekChange ? weekChange / (value - weekChange) : 0,
    valueAsOf: held.map((c) => c.holdings.latestNavDate).sort()[0],
    sample: held.some((c) => c.holdings.sample),
    fundsWithHoldings: held.length,
    history,
    allocation: held
      .map((c) => ({
        schemeCode: c.schemeCode,
        shortName: c.shortName,
        value: c.holdings.value ?? 0,
        weight: (c.holdings.value ?? 0) / value,
        targetWeight: totalSip && c.holdings.monthlySip ? c.holdings.monthlySip / totalSip : null,
      }))
      .sort((a, b) => b.value - a.value),
  };
}

export type FundsView = {
  active: Array<Fund & { lastNavDate: IsoDate | null; categoryLabel: string; benchmarkLabel: string | null }>;
  removed: Array<Pick<Fund, "schemeCode" | "name" | "removedAt">>;
  benchmarks: Array<{ key: string; label: string }>;
};

export async function getFundsView(): Promise<FundsView> {
  const all = await db().select().from(funds).orderBy(asc(funds.addedAt));
  const active = all.filter((f) => f.isActive);
  const lastDates = active.length
    ? await db()
        .select({ code: navHistory.schemeCode, last: max(navHistory.navDate) })
        .from(navHistory)
        .where(inArray(navHistory.schemeCode, active.map((f) => f.schemeCode)))
        .groupBy(navHistory.schemeCode)
    : [];
  const labels = new Map(SELECTABLE_BENCHMARKS.map((b) => [b.key, b.label]));
  return {
    active: active.map((f) => ({
      ...f,
      lastNavDate: lastDates.find((d) => d.code === f.schemeCode)?.last ?? null,
      categoryLabel: normaliseCategory(f.sebiCategory).category,
      benchmarkLabel: f.benchmarkKey ? (labels.get(f.benchmarkKey) ?? null) : null,
    })),
    removed: all.filter((f) => !f.isActive).map((f) => ({ schemeCode: f.schemeCode, name: f.name, removedAt: f.removedAt })),
    benchmarks: SELECTABLE_BENCHMARKS,
  };
}

export type WeekMark = { weekEnding: IsoDate; gap: number | null; mark: "ahead" | "behind" | "level" | "none" };

export type HistoryView = {
  reports: Array<Pick<Report, "weekEnding" | "verdict" | "worryScore" | "writtenBy" | "generatedAt"> & { headline: string }>;
  grid: Array<{ schemeCode: string; shortName: string; weeks: WeekMark[]; behindRecent: number; recentWindow: number }>;
  weeks: IsoDate[];
};

export async function getHistoryView(): Promise<HistoryView> {
  const reportRows = await db().select().from(reports).orderBy(desc(reports.weekEnding)).limit(52);
  const active = await db().select().from(funds).where(eq(funds.isActive, true)).orderBy(asc(funds.addedAt));
  const [latestSnap] = await db().select({ w: max(weeklySnapshots.weekEnding) }).from(weeklySnapshots);
  const lastWeek = latestSnap?.w ?? null;
  const weeks = lastWeek ? Array.from({ length: SNAPSHOT_WEEKS }, (_, i) => addDays(lastWeek, -7 * (SNAPSHOT_WEEKS - 1 - i))) : [];
  const snaps =
    active.length && weeks.length
      ? await db()
          .select({ schemeCode: weeklySnapshots.schemeCode, weekEnding: weeklySnapshots.weekEnding, fundRet1w: weeklySnapshots.fundRet1w, catRet1w: weeklySnapshots.catRet1w })
          .from(weeklySnapshots)
          .where(and(inArray(weeklySnapshots.schemeCode, active.map((f) => f.schemeCode)), sql`${weeklySnapshots.weekEnding} between ${weeks[0]} and ${weeks.at(-1)}`))
      : [];
  const noise = VERDICT_CONFIG.equity.noiseBand;
  const recentWindow = 6;
  return {
    reports: reportRows.map((r) => ({ weekEnding: r.weekEnding, verdict: r.verdict, worryScore: r.worryScore, writtenBy: r.writtenBy, generatedAt: r.generatedAt, headline: r.content.headline })),
    weeks,
    grid: active.map((f) => {
      const marks: WeekMark[] = weeks.map((w) => {
        const s = snaps.find((x) => x.schemeCode === f.schemeCode && x.weekEnding === w);
        if (!s || s.fundRet1w === null || s.catRet1w === null) return { weekEnding: w, gap: null, mark: "none" };
        const gap = s.fundRet1w - s.catRet1w;
        return { weekEnding: w, gap, mark: gap > noise ? "ahead" : gap < -noise ? "behind" : "level" };
      });
      return { schemeCode: f.schemeCode, shortName: shortFundName(f.name), weeks: marks, behindRecent: marks.slice(-recentWindow).filter((m) => m.mark === "behind").length, recentWindow };
    }),
  };
}

export type Health = "ok" | "stale" | "down";

export type StatusView = {
  funds: Array<{ schemeCode: string; shortName: string; lastNavDate: IsoDate | null; health: Health }>;
  benchmarks: Array<{ key: string; label: string; sourceType: string; sourceName: string | null; lastDate: IsoDate | null; health: Health; isTriApprox: boolean }>;
  jobs: Array<{ id: number; jobName: string; status: string; startedAt: Date; finishedAt: Date | null; error: string | null; warnings: string[]; durationMs: number | null }>;
  latestReport: Pick<Report, "weekEnding" | "writtenBy" | "model" | "tokensIn" | "tokensOut" | "latencyMs" | "retries" | "generatedAt"> | null;
  newsProvider: string | null;
  headlineCount: number;
  geminiModel: string;
  benchmarkUsage: Array<{ shortName: string; label: string | null; usedFallback: boolean; note: string | null }>;
};

function freshness(last: IsoDate | null, today: IsoDate, staleAfterDays: number): Health {
  if (!last) return "down";
  return last >= addDays(today, -staleAfterDays) ? "ok" : "stale";
}

export async function getStatusView(today: IsoDate): Promise<StatusView> {
  const active = await db().select().from(funds).where(eq(funds.isActive, true)).orderBy(asc(funds.addedAt));
  const navDates = active.length
    ? await db().select({ code: navHistory.schemeCode, last: max(navHistory.navDate) }).from(navHistory).where(inArray(navHistory.schemeCode, active.map((f) => f.schemeCode))).groupBy(navHistory.schemeCode)
    : [];
  const benchRows = await db().select().from(benchmarks).orderBy(asc(benchmarks.key));
  const benchDates = await db().select({ key: benchmarkHistory.key, last: max(benchmarkHistory.valueDate) }).from(benchmarkHistory).groupBy(benchmarkHistory.key);
  const jobs = await db().select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(15);
  const [latest] = await db().select().from(reports).orderBy(desc(reports.weekEnding)).limit(1);
  const [mc] = await db().select().from(marketContext).orderBy(desc(marketContext.weekEnding)).limit(1);
  const latestSnaps = latest
    ? await db().select().from(weeklySnapshots).where(eq(weeklySnapshots.weekEnding, latest.weekEnding))
    : [];

  return {
    // NAVs publish on business days; 5 days covers a long weekend plus a holiday.
    funds: active.map((f) => {
      const last = navDates.find((d) => d.code === f.schemeCode)?.last ?? null;
      return { schemeCode: f.schemeCode, shortName: shortFundName(f.name), lastNavDate: last, health: freshness(last, today, 5) };
    }),
    benchmarks: benchRows.map((b) => {
      const last = benchDates.find((d) => d.key === b.key)?.last ?? null;
      return { key: b.key, label: b.label, sourceType: b.sourceType, sourceName: b.sourceName, lastDate: last, health: freshness(last, today, 6), isTriApprox: b.isTriApprox };
    }),
    jobs: jobs.map((j) => ({
      id: j.id,
      jobName: j.jobName,
      status: j.status,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      error: j.error,
      warnings: Array.isArray(j.details?.warnings) ? (j.details.warnings as string[]) : [],
      durationMs: typeof j.details?.durationMs === "number" ? (j.details.durationMs as number) : null,
    })),
    latestReport: latest
      ? { weekEnding: latest.weekEnding, writtenBy: latest.writtenBy, model: latest.model, tokensIn: latest.tokensIn, tokensOut: latest.tokensOut, latencyMs: latest.latencyMs, retries: latest.retries, generatedAt: latest.generatedAt }
      : null,
    newsProvider: mc?.newsProvider ?? null,
    headlineCount: mc?.headlines.length ?? 0,
    geminiModel: geminiModel(),
    benchmarkUsage: active.map((f) => {
      const s = latestSnaps.find((x) => x.schemeCode === f.schemeCode);
      return { shortName: shortFundName(f.name), label: s?.provenance.benchmark?.label ?? null, usedFallback: s?.provenance.benchmark?.usedFallback ?? false, note: s?.provenance.benchmarkNote ?? null };
    }),
  };
}
