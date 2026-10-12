import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { categoryAverage } from "./categoryAverage";
import { decompose } from "./decomposition";
import { computeReturns, pointOnOrBefore, type Point } from "./returns";
import { allocationDrift, fundFlags, portfolioVerdict, worryScore, type FundAssessment, type WeekFacts } from "./verdict";
import { buildFundSnapshots } from "./snapshots";

/** Business-day series from `from` to `to`, value grows by `dailyGrowth` per trading day. */
function series(from: string, to: string, start = 100, dailyGrowth = 0, skip: string[] = []): Point[] {
  const out: Point[] = [];
  let v = start;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || skip.includes(d)) continue;
    out.push({ date: d, value: v });
    v *= 1 + dailyGrowth;
  }
  return out;
}

describe("pointOnOrBefore", () => {
  const s = series("2026-09-01", "2026-10-09");
  it("returns the exact date when present", () => {
    expect(pointOnOrBefore(s, "2026-10-09", 7)?.date).toBe("2026-10-09");
  });
  it("steps back over a weekend", () => {
    expect(pointOnOrBefore(s, "2026-10-11", 7)?.date).toBe("2026-10-09");
  });
  it("refuses a value that is too stale", () => {
    expect(pointOnOrBefore(s, "2026-10-30", 7)).toBeNull();
  });
  it("returns null before the series starts", () => {
    expect(pointOnOrBefore(s, "2026-08-01", 7)).toBeNull();
  });
});

describe("computeReturns", () => {
  it("computes week, month and YTD from the right base dates", () => {
    const s: Point[] = [
      { date: "2025-12-31", value: 100 },
      { date: "2026-09-09", value: 110 },
      { date: "2026-10-02", value: 115 },
      { date: "2026-10-09", value: 120 },
    ];
    const r = computeReturns(s, "2026-10-09");
    expect(r["1w"]?.value).toBeCloseTo(120 / 115 - 1, 12);
    expect(r["1m"]?.value).toBeCloseTo(120 / 110 - 1, 12);
    expect(r.ytd?.value).toBeCloseTo(0.2, 12);
    expect(r.ytdFromInception).toBe(false);
  });

  it("handles a Friday holiday: uses Thursday's NAV for both ends", () => {
    const s = series("2025-12-01", "2026-10-09", 100, 0.001, ["2026-10-02", "2026-10-09"]);
    const r = computeReturns(s, "2026-10-09");
    expect(r["1w"]?.end.date).toBe("2026-10-08");
    expect(r["1w"]?.start.date).toBe("2026-10-01");
  });

  it("handles missing days in the middle of the week", () => {
    const s = series("2025-12-01", "2026-10-09", 100, 0.001, ["2026-10-06", "2026-10-07"]);
    const r = computeReturns(s, "2026-10-09");
    expect(r["1w"]).not.toBeNull();
    expect(r["1w"]?.end.date).toBe("2026-10-09");
  });

  it("YTD is from launch (and flagged) for a fund started this year", () => {
    const s = series("2026-06-15", "2026-10-09", 10, 0.0005);
    const r = computeReturns(s, "2026-10-09", { allowYtdFromInception: true });
    expect(r.ytdFromInception).toBe(true);
    expect(r.ytd?.start.date).toBe("2026-06-15");
    const strict = computeReturns(s, "2026-10-09");
    expect(strict.ytd).toBeNull();
  });

  it("1M across a leap-year February clamps to the 29th", () => {
    const s: Point[] = [
      { date: "2023-12-29", value: 90 },
      { date: "2024-02-29", value: 100 },
      { date: "2024-03-29", value: 105 },
    ];
    // 29 Mar 2024 − 1 month = 29 Feb 2024 (exists in a leap year)
    expect(computeReturns(s, "2024-03-29")["1m"]?.start.date).toBe("2024-02-29");
  });

  it("returns nothing when the fund has stopped publishing NAVs", () => {
    const s = series("2025-01-01", "2026-08-01");
    const r = computeReturns(s, "2026-10-09");
    expect(r["1w"]).toBeNull();
    expect(r.ytd).toBeNull();
  });
});

describe("categoryAverage", () => {
  const week = "2026-10-09";
  const mk = (weekly: number) => {
    const s = series("2025-12-01", "2026-10-02", 100, 0);
    s.push({ date: week, value: 100 * (1 + weekly) });
    return s;
  };

  it("is the equal-weighted mean, excluding the fund itself and peers without data", () => {
    const peers = new Map<string, Point[]>([
      ["self", mk(0.5)],
      ["a", mk(0.01)],
      ["b", mk(0.03)],
      ["dead", series("2025-01-01", "2026-06-01")],
    ]);
    const avg = categoryAverage(peers, "self", week);
    expect(avg["1w"]?.value).toBeCloseTo(0.02, 12);
    expect(avg["1w"]?.count).toBe(2);
  });

  it("drops implausible returns as data errors", () => {
    const peers = new Map<string, Point[]>([
      ["a", mk(0.01)],
      ["glitch", mk(-0.9)],
    ]);
    expect(categoryAverage(peers, "x", week)["1w"]).toEqual({ value: expect.closeTo(0.01, 12), count: 1 });
  });

  it("returns null when no peer has data", () => {
    expect(categoryAverage(new Map(), "x", week)["1w"]).toBeNull();
  });
});

describe("decompose", () => {
  it("parts always add up exactly to the fund's return", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.2;
    for (let i = 0; i < 1000; i++) {
      const fund = rand();
      const bench = rand();
      const cat = rand();
      const d = decompose(fund, bench, cat);
      expect((d.market ?? 0) + (d.similarFunds ?? 0) + (d.fundChoices ?? 0)).toBeCloseTo(fund, 12);
      const noBench = decompose(fund, null, cat);
      expect((noBench.similarFunds ?? 0) + (noBench.fundChoices ?? 0)).toBeCloseTo(fund, 12);
      const noCat = decompose(fund, bench, null);
      expect((noCat.market ?? 0) + (noCat.fundChoices ?? 0)).toBeCloseTo(fund, 12);
    }
  });

  it("matches the worked example: fund −1.8%, market −1.5%, mid-caps −1.6%", () => {
    const d = decompose(-0.018, -0.015, -0.016);
    expect(d.market).toBeCloseTo(-0.015, 12);
    expect(d.similarFunds).toBeCloseTo(-0.001, 12);
    expect(d.fundChoices).toBeCloseTo(-0.002, 12);
    expect(d.mode).toBe("three_part");
    expect(d.dominant).toBe("market");
  });

  it("collapses to two parts without a benchmark and picks the dominant driver", () => {
    const d = decompose(0.001, null, 0.0015);
    expect(d.mode).toBe("no_benchmark");
    expect(d.market).toBeNull();
    expect(d.dominant).toBe("similar_funds");
    expect(decompose(0.01, null, null)).toMatchObject({ mode: "fund_only", dominant: null });
  });
});

const week = (i: number, over: Partial<WeekFacts> = {}): WeekFacts => ({
  weekEnding: addDays("2026-09-18", 7 * i),
  fundRet1w: 0.005,
  fundRet1m: 0.01,
  fundRetYtd: 0.08,
  catRet1w: 0.005,
  catRet1m: 0.01,
  catRetYtd: 0.08,
  fundChoices1w: 0.001,
  ytdFromInception: false,
  ...over,
});

describe("fundFlags — equity", () => {
  it("one bad week alone never flags, however bad", () => {
    const h = [week(0), week(1), week(2), week(3, { fundChoices1w: -0.05, fundRet1w: -0.06, fundRet1m: -0.04, catRet1m: 0.01 })];
    expect(fundFlags("equity", h)).toEqual([]);
  });

  it("flags 3 of 4 lagging weeks plus a 1M gap worse than −1.5 pp", () => {
    const lag = { fundChoices1w: -0.004 };
    const h = [week(0, lag), week(1), week(2, lag), week(3, { ...lag, fundRet1m: -0.01, catRet1m: 0.008 })];
    const flags = fundFlags("equity", h);
    expect(flags.map((f) => f.code)).toEqual(["equity_persistent_lag"]);
    expect(flags[0].reason).toContain("3 of the last 4 weeks");
    expect(flags[0].reason).toContain("1.80 percentage points");
  });

  it("needs both conditions: persistent lag with only a small 1M gap is fine", () => {
    const lag = { fundChoices1w: -0.002 };
    const h = [week(0, lag), week(1, lag), week(2, lag), week(3, { ...lag, fundRet1m: 0.0, catRet1m: 0.01 })];
    expect(fundFlags("equity", h)).toEqual([]);
  });

  it("ignores tracking noise: an index fund trailing by its fee every week is not lagging", () => {
    const noise = { fundChoices1w: -0.00002 };
    const h = [week(0, noise), week(1, noise), week(2, noise), week(3, { ...noise, fundRet1m: -0.03, catRet1m: 0.0 })];
    expect(fundFlags("equity", h)).toEqual([]);
    const f: FundAssessment = { schemeCode: "x", name: "X", assetClass: "equity", history: h, flags: [] };
    expect(worryScore([f], { applicable: false, reason: "" }).parts.persistence).toBe(0);
  });

  it("needs four weeks of history before the persistence rule applies", () => {
    const lag = { fundChoices1w: -0.01, fundRet1m: -0.05, catRet1m: 0.01 };
    expect(fundFlags("equity", [week(0, lag), week(1, lag), week(2, lag)])).toEqual([]);
  });

  it("flags YTD more than 4 pp behind, but not when YTD is since launch", () => {
    expect(fundFlags("equity", [week(0, { fundRetYtd: 0.02, catRetYtd: 0.07 })]).map((f) => f.code)).toEqual(["equity_ytd_lag"]);
    expect(fundFlags("equity", [week(0, { fundRetYtd: 0.02, catRetYtd: 0.07, ytdFromInception: true })])).toEqual([]);
  });
});

describe("fundFlags — debt", () => {
  it("flags a weekly fall below −0.3% that is clearly worse than similar funds (possible credit event)", () => {
    const flags = fundFlags("debt", [week(0, { fundRet1w: -0.004, catRet1w: 0.0005, fundRet1m: 0.002, catRet1m: 0.003 })]);
    expect(flags.map((f) => f.code)).toEqual(["debt_weekly_drop"]);
    expect(flags[0].reason).toContain("0.45 percentage points more than similar debt funds");
  });

  it("does not flag a fall that all similar funds share (e.g. after a rate hike)", () => {
    expect(fundFlags("debt", [week(0, { fundRet1w: -0.004, catRet1w: -0.0035, fundRet1m: -0.0019, catRet1m: -0.001 })])).toEqual([]);
  });

  it("flags a negative month only when more than 0.25 pp behind similar funds", () => {
    expect(fundFlags("debt", [week(0, { fundRet1w: 0.0005, fundRet1m: -0.004, catRet1m: 0.001 })]).map((f) => f.code)).toEqual(["debt_monthly_negative"]);
    expect(fundFlags("debt", [week(0, { fundRet1w: 0.0005, fundRet1m: -0.001, catRet1m: 0.001 })])).toEqual([]);
  });

  it("falls back to the absolute rules when similar-fund data is missing", () => {
    const flags = fundFlags("debt", [week(0, { fundRet1w: -0.004, catRet1w: null, fundRet1m: -0.001, catRet1m: null })]);
    expect(flags.map((f) => f.code)).toEqual(["debt_weekly_drop", "debt_monthly_negative"]);
  });

  it("is calm for normal debt behaviour", () => {
    expect(fundFlags("debt", [week(0, { fundRet1w: 0.0012, fundRet1m: 0.006 })])).toEqual([]);
  });
});

const assess = (code: string, flagged: boolean, assetClass: FundAssessment["assetClass"] = "equity"): FundAssessment => ({
  schemeCode: code,
  name: `Fund ${code}`,
  assetClass,
  history: [week(0), week(1), week(2), week(3)],
  flags: flagged ? [{ code: "equity_ytd_lag", reason: "This year it is 5.00 percentage points behind similar funds." }] : [],
});
const holdings = (codes: string[]) => codes.map((c) => ({ schemeCode: c, name: `Fund ${c}`, monthlySip: 1000, unitsHeld: null, nav: 10 }));

describe("portfolioVerdict", () => {
  it("0 flagged → No action needed", () => {
    expect(portfolioVerdict([assess("a", false), assess("b", false)], holdings(["a", "b"])).verdict).toBe("No action needed");
  });
  it("1 flagged → One fund worth watching, naming the fund and reason", () => {
    const v = portfolioVerdict([assess("a", true), assess("b", false)], holdings(["a", "b"]));
    expect(v.verdict).toBe("One fund worth watching");
    expect(v.reason).toContain("Fund a");
    expect(v.reason).toContain("5.00 percentage points");
  });
  it("2 flagged → Consider reviewing your allocation", () => {
    expect(portfolioVerdict([assess("a", true), assess("b", true)], holdings(["a", "b"])).verdict).toBe("Consider reviewing your allocation");
  });
  it("allocation drift alone → Consider reviewing your allocation", () => {
    const h = [
      { schemeCode: "a", name: "Fund a", monthlySip: 5000, unitsHeld: 800, nav: 10 },
      { schemeCode: "b", name: "Fund b", monthlySip: 5000, unitsHeld: 200, nav: 10 },
    ];
    const v = portfolioVerdict([assess("a", false), assess("b", false)], h);
    expect(v.verdict).toBe("Consider reviewing your allocation");
    expect(v.reason).toContain("80.0%");
  });
});

describe("allocationDrift", () => {
  it("is skipped honestly when units are missing", () => {
    const d = allocationDrift(holdings(["a", "b"]));
    expect(d.applicable).toBe(false);
  });
  it("compares value weights with SIP weights", () => {
    const d = allocationDrift([
      { schemeCode: "a", name: "A", monthlySip: 6000, unitsHeld: 100, nav: 60 },
      { schemeCode: "b", name: "B", monthlySip: 4000, unitsHeld: 100, nav: 40 },
    ]);
    expect(d.applicable && d.maxDrift).toBeCloseTo(0, 12);
    expect(d.applicable && d.triggered).toBe(false);
  });
});

describe("worryScore", () => {
  it("stays within 0–100 and grows with flags", () => {
    const calm = worryScore([assess("a", false), assess("b", false)], { applicable: false, reason: "" }).score;
    const tense = worryScore([assess("a", true), assess("b", true), assess("c", true)], { applicable: false, reason: "" }).score;
    expect(calm).toBeGreaterThanOrEqual(0);
    expect(tense).toBeLessThanOrEqual(100);
    expect(tense).toBeGreaterThan(calm);
  });
});

describe("buildFundSnapshots", () => {
  it("produces one row per week with decomposition that sums to the fund's return", () => {
    const fund = series("2025-11-01", "2026-10-09", 100, 0.0008);
    const bench = series("2025-11-01", "2026-10-09", 100, 0.0006);
    const peers = new Map([
      ["p1", series("2025-11-01", "2026-10-09", 50, 0.0007)],
      ["p2", series("2025-11-01", "2026-10-09", 20, 0.0005)],
    ]);
    const weeks = ["2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09"];
    const rows = buildFundSnapshots(
      { schemeCode: "f", name: "F", assetClass: "equity", peerGroup: "Equity: Mid Cap", benchmarkKey: "midcap150" },
      weeks,
      {
        fundSeries: fund,
        primary: { key: "midcap150", label: "Nifty Midcap 150", sourceType: "mf_proxy", sourceRef: "147622", sourceName: null, isTriApprox: true, currency: "INR", series: bench },
        fallback: null,
        peers,
      },
    );
    expect(rows.map((r) => r.weekEnding)).toEqual(weeks);
    for (const r of rows) {
      expect((r.market1w ?? 0) + (r.similarFunds1w ?? 0) + (r.fundChoices1w ?? 0)).toBeCloseTo(r.fundRet1w ?? NaN, 12);
      expect(r.peerCount).toBe(2);
      expect(r.provenance.benchmark?.usedFallback).toBe(false);
    }
  });

  it("falls back to the secondary benchmark and says so", () => {
    const fund = series("2025-11-01", "2026-10-09", 100, 0.0008);
    const rows = buildFundSnapshots(
      { schemeCode: "f", name: "F", assetClass: "equity", peerGroup: "g", benchmarkKey: "nasdaq100" },
      ["2026-10-09"],
      {
        fundSeries: fund,
        primary: { key: "nasdaq100", label: "Nasdaq 100", sourceType: "mf_proxy", sourceRef: "1", sourceName: null, isTriApprox: true, currency: "INR", series: [] },
        fallback: { key: "idx_nasdaq100", label: "Nasdaq 100 (USD)", sourceType: "yahoo", sourceRef: "^NDX", sourceName: null, isTriApprox: false, currency: "USD", series: series("2025-11-01", "2026-10-09", 1000, 0.001) },
        peers: new Map(),
      },
    );
    expect(rows[0].provenance.benchmark?.usedFallback).toBe(true);
    expect(rows[0].provenance.benchmarkNote).toContain("Yahoo Finance");
    expect(rows[0].provenance.benchmarkNote).toContain("US dollars");
  });
});
