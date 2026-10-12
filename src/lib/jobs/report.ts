import { and, asc, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { reports, weeklySnapshots, type Fund, type Report } from "@/db/schema";
import { activeFunds, type JobContext } from "@/db/queries";
import { addDays, type IsoDate } from "@/lib/dates";
import { normaliseCategory } from "@/lib/classify";
import { toWeekFacts, type SnapshotRow } from "@/lib/engine/snapshots";
import { portfolioVerdict, type PortfolioVerdict } from "@/lib/engine/verdict";
import { buildFactSheet, shortFundName, type FactSheet } from "@/lib/gemini/factSheet";
import { writeReport, type WrittenReport } from "@/lib/gemini/writer";
import { getOrFetchMarketContext } from "./marketContext";
import { computeSnapshots } from "./snapshots";
import { SNAPSHOT_WEEKS } from "./ingest";

export async function loadSnapshots(codes: string[], fromWeek: IsoDate, toWeek: IsoDate): Promise<SnapshotRow[]> {
  if (codes.length === 0) return [];
  return db()
    .select()
    .from(weeklySnapshots)
    .where(and(inArray(weeklySnapshots.schemeCode, codes), gte(weeklySnapshots.weekEnding, fromWeek), lte(weeklySnapshots.weekEnding, toWeek)))
    .orderBy(asc(weeklySnapshots.weekEnding));
}

export function assessPortfolio(fundList: Fund[], rows: SnapshotRow[], weekEnding: IsoDate) {
  const perFund = fundList.flatMap((f) => {
    const history = rows.filter((r) => r.schemeCode === f.schemeCode);
    const latest = history.at(-1);
    return latest && latest.weekEnding === weekEnding ? [{ fund: f, history, latest }] : [];
  });
  const verdict: PortfolioVerdict = portfolioVerdict(
    perFund.map(({ fund, history, latest }) => ({ schemeCode: fund.schemeCode, name: shortFundName(fund.name), assetClass: fund.assetClass, history: history.map(toWeekFacts), flags: latest.flags })),
    perFund.map(({ fund, latest }) => ({ schemeCode: fund.schemeCode, name: shortFundName(fund.name), monthlySip: fund.monthlySip, unitsHeld: fund.unitsHeld, nav: latest.nav })),
  );
  return { perFund, verdict };
}

export type GeneratedReport = { report: Report; sheet: FactSheet; written: WrittenReport; verdict: PortfolioVerdict };

/** Builds this week's report end to end and upserts it (re-running a week replaces, never duplicates). */
export async function generateReport(ctx: JobContext, weekEnding: IsoDate, opts: { forceNews?: boolean } = {}): Promise<GeneratedReport> {
  const fundList = await activeFunds();
  if (fundList.length === 0) throw new Error("There are no funds to report on. Add a fund first.");
  const codes = fundList.map((f) => f.schemeCode);
  const fromWeek = addDays(weekEnding, -7 * (SNAPSHOT_WEEKS - 1));

  let rows = await loadSnapshots(codes, fromWeek, weekEnding);
  const haveLatest = new Set(rows.filter((r) => r.weekEnding === weekEnding).map((r) => r.schemeCode));
  if (codes.some((c) => !haveLatest.has(c))) {
    await computeSnapshots(ctx, weekEnding);
    rows = await loadSnapshots(codes, fromWeek, weekEnding);
  }

  const { perFund, verdict } = assessPortfolio(fundList, rows, weekEnding);
  if (perFund.length === 0) throw new Error(`No fund has NAV data for the week ending ${weekEnding}.`);
  const skipped = fundList.filter((f) => !perFund.some((p) => p.fund.schemeCode === f.schemeCode));
  for (const f of skipped) ctx.warn(`${f.name} has no data for ${weekEnding} and is left out of this report.`);

  const mc = await getOrFetchMarketContext(ctx, weekEnding, { force: opts.forceNews });
  const sheet = buildFactSheet({
    weekEnding,
    verdict,
    latest: perFund.map(({ fund, latest, history }) => ({ name: fund.name, categoryLabel: normaliseCategory(fund.sebiCategory).category, assetClass: fund.assetClass, row: latest, history })),
    indexMoves: mc.indexMoves,
    headlines: mc.headlines,
  });

  const written = await writeReport(sheet, { apiKey: process.env.GEMINI_API_KEY || undefined });
  if (written.writtenBy === "template") ctx.warn(`Report written without AI this week: ${written.content.guardErrors?.slice(0, 3).join(" | ")}`);

  const values = {
    weekEnding,
    verdict: verdict.verdict,
    verdictReason: written.content.verdictReason,
    worryScore: verdict.worry.score,
    content: written.content,
    writtenBy: written.writtenBy,
    model: written.model,
    tokensIn: written.tokensIn,
    tokensOut: written.tokensOut,
    latencyMs: written.latencyMs,
    retries: written.retries,
    generatedAt: new Date(),
  };
  const [report] = await db()
    .insert(reports)
    .values(values)
    .onConflictDoUpdate({
      target: reports.weekEnding,
      set: {
        verdict: sql`excluded.verdict`,
        verdictReason: sql`excluded.verdict_reason`,
        worryScore: sql`excluded.worry_score`,
        content: sql`excluded.content`,
        writtenBy: sql`excluded.written_by`,
        model: sql`excluded.model`,
        tokensIn: sql`excluded.tokens_in`,
        tokensOut: sql`excluded.tokens_out`,
        latencyMs: sql`excluded.latency_ms`,
        retries: sql`excluded.retries`,
        generatedAt: sql`excluded.generated_at`,
      },
    })
    .returning();

  ctx.details.report = { weekEnding, verdict: verdict.verdict, writtenBy: written.writtenBy, model: written.model, retries: written.retries, tokensIn: written.tokensIn, tokensOut: written.tokensOut, latencyMs: written.latencyMs };
  return { report, sheet, written, verdict };
}
