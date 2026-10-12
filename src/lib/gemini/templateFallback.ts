import { termsIn } from "@/lib/glossary";
import type { FactSheet, FactSheetFund } from "./factSheet";
import type { ReportOutput } from "./schema";

const n2 = (x: number) => Math.abs(x).toFixed(2);

function moved(x: number | null, subject: string): string {
  if (x === null) return `${subject} has no reported return this week`;
  if (Math.abs(x) < 0.005) return `${subject} was unchanged at 0.00%`;
  return `${subject} ${x > 0 ? "returned" : "declined"} ${n2(x)}%`;
}

const verb = (x: number) => (x >= 0 ? "returned" : "declined");

function relation(gap: number, what: string): string {
  if (Math.abs(gap) < 0.005) return `in line with ${what}`;
  return `${n2(gap)} percentage points ${gap > 0 ? "ahead of" : "behind"} ${what}`;
}

function sentenceOne(f: FactSheetFund): string {
  return `${moved(f.thisWeek.fund, f.name)} this week.`;
}

function sentenceTwo(f: FactSheetFund): string {
  const { market, similarFunds } = f.thisWeek;
  const g = f.gaps;
  if (market !== null && similarFunds !== null && g.weekVsSimilar !== null) {
    return `Its benchmark, the ${f.marketYardstick}, ${verb(market)} ${n2(market)}% and the category average ${verb(similarFunds)} ${n2(similarFunds)}%, placing the fund ${relation(g.weekVsSimilar, "its category")}.`;
  }
  if (similarFunds !== null && g.weekVsSimilar !== null) {
    return `With no public benchmark available, it is measured against the average of ${f.similarFundsCompared} comparable funds, which ${verb(similarFunds)} ${n2(similarFunds)}%, placing it ${relation(g.weekVsSimilar, "that average")}.`;
  }
  if (market !== null && g.weekVsMarket !== null) {
    return `Its benchmark, the ${f.marketYardstick}, ${verb(market)} ${n2(market)}%, placing the fund ${relation(g.weekVsMarket, "the benchmark")}.`;
  }
  return "No reliable comparison was available this week.";
}

function sentenceThree(f: FactSheetFund): string {
  switch (f.whoMovedItThisWeek.biggestPart) {
    case "The market":
      return "The move was driven primarily by the broader market rather than fund-specific factors.";
    case "Funds like yours":
      return "The move was largely shared across the category, and no specific headline explains it.";
    case "Your fund's choices":
      return "The difference reflects the fund's own portfolio choices, and no specific headline explains it.";
    default:
      return "No specific headline explains this week's move.";
  }
}

/** Deterministic report used when Gemini is unavailable or fails the guard twice. Uses only fact-sheet numbers. */
export function templateReport(sheet: FactSheet): ReportOutput {
  const up = sheet.funds.filter((f) => (f.thisWeek.fund ?? 0) > 0).length;
  const funds = sheet.funds.map((f) => ({
    schemeCode: f.schemeCode,
    summary: [sentenceOne(f), sentenceTwo(f), sentenceThree(f)].join(" "),
    citedHeadlineIds: [],
  }));
  const headline = `Weekly portfolio review: ${up} of ${sheet.funds.length} funds advanced in ${sheet.weekLabel}`;
  const all = [headline, sheet.verdictFacts, ...funds.map((f) => f.summary)].join(" ");
  return { headline, funds, verdict: sheet.verdict, verdictReason: sheet.verdictFacts, jargonUsed: termsIn(all) };
}
