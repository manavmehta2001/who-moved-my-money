import { describe, expect, it } from "vitest";
import type { FactSheet } from "./factSheet";
import { allowedPercentages, shortFundName } from "./factSheet";
import { checkReport, countSentences, extractPercentages } from "./hallucinationGuard";
import { templateReport } from "./templateFallback";
import { writeReport, type GenerateFn } from "./writer";

const sheet: FactSheet = {
  weekEnding: "2026-10-09",
  weekLabel: "the week ending 9 Oct 2026",
  verdict: "One fund worth watching",
  verdictFacts: "HDFC Mid Cap Fund - Direct Plan - Growth Option: This year it is 4.11 percentage points behind similar funds.",
  worryScoreOutOf100: 23,
  funds: [
    {
      schemeCode: "118989",
      name: "HDFC Mid Cap Fund",
      kind: "Equity: Mid Cap",
      isDebt: false,
      thisWeek: { fund: 0.17, market: -0.18, similarFunds: -0.08 },
      pastMonth: { fund: -5.36, market: -6.03, similarFunds: -5.42 },
      thisYear: { fund: -2.19, market: -2.64, similarFunds: 1.91, sinceLaunch: false },
      gaps: { weekVsSimilar: 0.25, weekVsMarket: 0.35, monthVsSimilar: 0.06, monthVsMarket: 0.67, yearVsSimilar: -4.11, yearVsMarket: 0.45 },
      whoMovedItThisWeek: { theMarket: -0.18, fundsLikeYours: 0.1, yourFundsChoices: 0.25, biggestPart: "Your fund's choices", note: null },
      marketYardstick: "Nifty Midcap 150",
      similarFundsCompared: 32,
      weeksBehindSimilarFundsOfLast4: 1,
      warnings: ["This year it is 4.11 percentage points behind similar funds."],
    },
    {
      schemeCode: "120754",
      name: "ICICI Prudential Short Term Fund",
      kind: "Debt: Short Duration",
      isDebt: true,
      thisWeek: { fund: 0.05, market: null, similarFunds: 0.07 },
      pastMonth: { fund: -0.19, market: null, similarFunds: -0.1 },
      thisYear: { fund: 4.13, market: null, similarFunds: 3.84, sinceLaunch: false },
      gaps: { weekVsSimilar: -0.02, weekVsMarket: null, monthVsSimilar: -0.09, monthVsMarket: null, yearVsSimilar: 0.29, yearVsMarket: null },
      whoMovedItThisWeek: { theMarket: null, fundsLikeYours: 0.07, yourFundsChoices: -0.02, biggestPart: "Funds like yours", note: "No public benchmark." },
      marketYardstick: null,
      similarFundsCompared: 22,
      weeksBehindSimilarFundsOfLast4: 2,
      warnings: [],
    },
  ],
  marketThisWeek: [{ index: "Nifty 50", weekChangePercent: 0.43 }],
  headlines: [{ id: "h1", title: "RBI raises repo rate", source: "Reuters", date: "2026-10-09" }],
};

const good = {
  headline: "A mixed week: mid-caps slipped while your mid-cap fund held up.",
  funds: [
    {
      schemeCode: "118989",
      summary: "HDFC Mid Cap Fund rose 0.17% this week. The market fell 0.18% and similar funds fell 0.08%, so your fund was 0.25 percentage points ahead of funds like it. No specific news explains the gap; it came from your fund's own choices.",
      citedHeadlineIds: [],
    },
    {
      schemeCode: "120754",
      summary: "ICICI Prudential Short Term Fund rose 0.05% this week. It has no public benchmark, and similar debt funds rose 0.07%, so it was close to them. The RBI's rate decision moved all bond funds together this week.",
      citedHeadlineIds: ["h1"],
    },
  ],
  verdict: "One fund worth watching",
  verdictReason: "HDFC Mid Cap Fund is 4.11 percentage points behind similar funds this year, so keep an eye on it.",
  jargonUsed: ["percentage points", "debt fund"],
};

describe("countSentences", () => {
  it("ignores decimals and abbreviations", () => {
    expect(countSentences("It rose 1.82% this week. The U.S. market rose 0.5%. Rs. 100 is fine.")).toBe(3);
    expect(countSentences("One. Two! Three?")).toBe(3);
    expect(countSentences("Only one sentence with 2.50% inside")).toBe(1);
  });
});

describe("extractPercentages", () => {
  it("finds %, percent and percentage points, as absolute values", () => {
    expect(extractPercentages("fell −1.82%, rose 2 percent, 0.25 percentage points, 3.1 pp")).toEqual([1.82, 2, 0.25, 3.1]);
  });
});

describe("allowedPercentages", () => {
  it("includes every fact-sheet number and those quoted in the verdict facts", () => {
    const a = allowedPercentages(sheet);
    expect(a).toContain(0.17);
    expect(a).toContain(0.18);
    expect(a).toContain(4.11);
    expect(a).toContain(0.43);
  });
});

describe("checkReport", () => {
  it("accepts a correct report", () => {
    expect(checkReport(good, sheet)).toMatchObject({ ok: true });
  });

  it("rejects an invented percentage", () => {
    const bad = structuredClone(good);
    bad.funds[0].summary = bad.funds[0].summary.replace("0.17%", "0.91%");
    const r = checkReport(bad, sheet);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("0.91%");
  });

  it("doesn't let one fund's summary borrow another fund's number", () => {
    const bad = structuredClone(good);
    bad.funds[1].summary = bad.funds[1].summary.replace("0.05%", "5.36%");
    expect(checkReport(bad, sheet).errors.join(" ")).toContain("5.36%");
  });

  it("allows rounding within ±0.05 pp", () => {
    const close = structuredClone(good);
    close.funds[0].summary = close.funds[0].summary.replace("0.17%", "0.2%");
    expect(checkReport(close, sheet).ok).toBe(true);
  });

  it("rejects a summary that isn't exactly 3 sentences", () => {
    const bad = structuredClone(good);
    bad.funds[1].summary += " Keep an eye on it.";
    expect(checkReport(bad, sheet).errors.join(" ")).toContain("4 sentences");
  });

  it("rejects a changed verdict", () => {
    const bad = { ...structuredClone(good), verdict: "No action needed" };
    expect(checkReport(bad, sheet).errors.join(" ")).toContain('must be exactly "One fund worth watching"');
  });

  it("rejects advice words, weather words, unknown headlines and missing funds", () => {
    const bad = structuredClone(good);
    bad.verdictReason = "You should sell HDFC Mid Cap Fund; it is 4.11 percentage points behind.";
    bad.headline = "A stormy week for mid-caps.";
    bad.funds[1].citedHeadlineIds = ["h9"];
    bad.funds.pop();
    const errors = checkReport(bad, sheet).errors.join(" ");
    expect(errors).toContain('"sell"');
    expect(errors).toContain("No weather");
    expect(errors).toContain("Missing funds: 120754");
  });

  it("rejects double negatives like 'fell -0.18%'", () => {
    const bad = structuredClone(good);
    bad.funds[0].summary = bad.funds[0].summary.replace("The market fell 0.18%", "The market fell -0.18%");
    expect(checkReport(bad, sheet).errors.join(" ")).toContain("Drop the minus sign");
  });

  it("rejects the wrong JSON shape", () => {
    expect(checkReport({ headline: "x" }, sheet).ok).toBe(false);
  });
});

describe("templateReport", () => {
  it("always passes its own guard", () => {
    const t = templateReport(sheet);
    expect(checkReport(t, sheet)).toMatchObject({ ok: true });
    expect(t.verdict).toBe(sheet.verdict);
  });
});

describe("writeReport", () => {
  const fake = (answers: unknown[]): GenerateFn => {
    let i = 0;
    return async () => ({ text: JSON.stringify(answers[Math.min(i++, answers.length - 1)]), tokensIn: 100, tokensOut: 50 });
  };

  it("uses Gemini's answer when it passes first time", async () => {
    const r = await writeReport(sheet, { generate: fake([good]), model: "test" });
    expect(r).toMatchObject({ writtenBy: "gemini", retries: 0, tokensIn: 100, tokensOut: 50 });
  });

  it("retries once with the errors and accepts the fixed answer", async () => {
    const bad = { ...structuredClone(good), verdict: "No action needed" };
    const r = await writeReport(sheet, { generate: fake([bad, good]), model: "test" });
    expect(r).toMatchObject({ writtenBy: "gemini", retries: 1, tokensIn: 200 });
    expect(r.attempts[0].ok).toBe(false);
  });

  it("falls back to the template after two failures and records why", async () => {
    const bad = { ...structuredClone(good), verdict: "No action needed" };
    const r = await writeReport(sheet, { generate: fake([bad, bad]), model: "test" });
    expect(r.writtenBy).toBe("template");
    expect(r.retries).toBe(1);
    expect(r.content.guardErrors?.length).toBeGreaterThan(0);
  });

  it("falls back to the template when the API throws", async () => {
    const r = await writeReport(sheet, { generate: async () => Promise.reject(new Error("503")), model: "test" });
    expect(r.writtenBy).toBe("template");
    expect(r.content.guardErrors?.[0]).toContain("503");
  });
});

describe("shortFundName", () => {
  it("drops plan and option suffixes", () => {
    expect(shortFundName("HDFC Mid Cap Fund - Direct Plan - Growth Option")).toBe("HDFC Mid Cap Fund");
    expect(shortFundName("HSBC Short Duration Fund - Growth Direct")).toBe("HSBC Short Duration Fund");
    expect(shortFundName("Edelweiss US Technology Equity Fund of Fund - Direct Plan - Growth")).toBe("Edelweiss US Technology Equity Fund of Fund");
  });
});
