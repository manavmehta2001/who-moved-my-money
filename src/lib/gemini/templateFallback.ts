import { termsIn } from "@/lib/glossary";
import type { FactSheet, FactSheetFund } from "./factSheet";
import type { ReportOutput } from "./schema";

const n2 = (x: number) => Math.abs(x).toFixed(2);

function moved(x: number | null, subject: string): string {
  if (x === null) return `${subject} has no figure this week`;
  if (Math.abs(x) < 0.005) return `${subject} was flat at 0.00%`;
  return `${subject} ${x > 0 ? "rose" : "fell"} ${n2(x)}%`;
}

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
    return `The market (${f.marketYardstick}) ${market >= 0 ? "rose" : "fell"} ${n2(market)}% and similar funds ${similarFunds >= 0 ? "rose" : "fell"} ${n2(similarFunds)}% on average, so it was ${relation(g.weekVsSimilar, "funds like it")}.`;
  }
  if (similarFunds !== null && g.weekVsSimilar !== null) {
    return `There is no public benchmark for this fund, so it is compared with ${f.similarFundsCompared} similar funds, which ${similarFunds >= 0 ? "rose" : "fell"} ${n2(similarFunds)}% on average, leaving it ${relation(g.weekVsSimilar, "them")}.`;
  }
  if (market !== null && g.weekVsMarket !== null) {
    return `The market (${f.marketYardstick}) ${market >= 0 ? "rose" : "fell"} ${n2(market)}%, so it was ${relation(g.weekVsMarket, "the market")}.`;
  }
  return "There was nothing reliable to compare it with this week.";
}

function sentenceThree(f: FactSheetFund): string {
  switch (f.whoMovedItThisWeek.biggestPart) {
    case "The market":
      return "Most of this week's move came from the market as a whole rather than anything specific to your fund.";
    case "Funds like yours":
      return "Most of the move was shared by funds like yours, and no single headline clearly explains it.";
    case "Your fund's choices":
      return "Most of the difference came from your fund's own choices, and no single headline clearly explains it.";
    default:
      return "No single headline clearly explains this week's move.";
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
  const headline = `${up} of your ${sheet.funds.length} funds rose in ${sheet.weekLabel}. ${sheet.verdict}.`;
  const all = [headline, sheet.verdictFacts, ...funds.map((f) => f.summary)].join(" ");
  return { headline, funds, verdict: sheet.verdict, verdictReason: sheet.verdictFacts, jargonUsed: termsIn(all) };
}
