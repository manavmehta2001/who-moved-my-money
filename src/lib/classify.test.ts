import { describe, expect, it } from "vitest";
import { assetClassFor, normaliseCategory, peerGroupFor, planInfo, suggestBenchmark } from "./classify";

describe("normaliseCategory", () => {
  it("merges AMFI's singular and plural spellings", () => {
    expect(normaliseCategory("Equity Scheme - Mid Cap Fund").category).toBe("Equity: Mid Cap");
    expect(normaliseCategory("Equity Schemes - Mid Cap Fund").category).toBe("Equity: Mid Cap");
    expect(normaliseCategory("Open Ended Schemes(Equity Schemes - Mid Cap Fund)").category).toBe("Equity: Mid Cap");
  });

  it("maps the old debt names onto SEBI's duration categories", () => {
    expect(normaliseCategory("Income/Debt Oriented Schemes - Short Term Fund").category).toBe("Debt: Short Duration");
    expect(normaliseCategory("Debt Scheme - Short Duration Fund").category).toBe("Debt: Short Duration");
    expect(normaliseCategory("Income/Debt Oriented Schemes - Ultra Short to Short Term Fund").category).toBe("Debt: Low Duration");
    expect(normaliseCategory("Income/Debt Oriented Schemes - Banking and PSU Debt Fund").category).toBe("Debt: Banking and PSU");
  });

  it("collapses ELSS and sectoral variants", () => {
    expect(normaliseCategory("Equity Schemes - ELSS- Tax Saver Fund").category).toBe("Equity: ELSS");
    expect(normaliseCategory("Equity Scheme - Sectoral/ Thematic").category).toBe("Equity: Sectoral/Thematic");
    expect(normaliseCategory("Equity Schemes - Thematic Fund").category).toBe("Equity: Sectoral/Thematic");
  });
});

describe("peerGroupFor", () => {
  const index = "Other Scheme - Index Funds";
  it("narrows index funds to the index they track", () => {
    expect(peerGroupFor(index, "HDFC Nifty 50 Index Fund - Direct Plan - Growth Option")).toBe("Index fund: Nifty 50");
    expect(peerGroupFor(index, "HDFC NIFTY50 Equal Weight Index Fund")).not.toBe("Index fund: Nifty 50");
    expect(peerGroupFor(index, "UTI Nifty Next 50 Index Fund")).toBe("Index fund: Nifty Next 50");
    expect(peerGroupFor(index, "Motilal Oswal Nifty 500 Index Fund")).toBe("Index fund: Nifty 500");
    expect(peerGroupFor(index, "Motilal Oswal Nifty 500 Momentum 50 Index Fund")).toBe("Index fund: other");
    expect(peerGroupFor(index, "Kotak Nifty Midcap 150 Momentum 50 Index Fund")).toBe("Index fund: other");
  });

  it("keeps ex-US and debt FoFs out of the US-equity group", () => {
    const fof = "Other Scheme - FoF Overseas";
    expect(peerGroupFor(fof, "Edelweiss US Technology Equity Fund of Fund")).toBe("Overseas fund of funds: US equity");
    expect(peerGroupFor(fof, "Motilal Oswal Developed Market Ex US ETFs Overseas Equity Passive FOF")).toBe("Overseas fund of funds: other");
    expect(peerGroupFor(fof, "DSP US Specific Debt Passive FoF")).toBe("Overseas fund of funds: debt");
  });
});

describe("suggestBenchmark", () => {
  it("follows the brief's category → benchmark rules", () => {
    expect(suggestBenchmark("Equity Scheme - Large Cap Fund", "x")).toBe("nifty50");
    expect(suggestBenchmark("Equity Scheme - Mid Cap Fund", "x")).toBe("midcap150");
    expect(suggestBenchmark("Equity Scheme - Small Cap Fund", "x")).toBe("smallcap250");
    expect(suggestBenchmark("Equity Schemes - Large & Mid Cap Fund", "x")).toBe("nifty500");
    expect(suggestBenchmark("Equity Scheme - Flexi Cap Fund", "x")).toBe("nifty500");
    expect(suggestBenchmark("Other Scheme - Index Funds", "UTI Nifty 50 Index Fund")).toBe("nifty50");
    expect(suggestBenchmark("Other Scheme - FoF Overseas", "Edelweiss US Technology Equity Fund of Fund")).toBe("nasdaq100");
    expect(suggestBenchmark("Other Scheme - FoF Overseas", "Kotak US Specific Equity Passive FOF")).toBe("sp500");
  });

  it("returns null when no public benchmark exists", () => {
    expect(suggestBenchmark("Debt Scheme - Short Duration Fund", "x")).toBeNull();
    expect(suggestBenchmark("Hybrid Scheme - Aggressive Hybrid Fund", "x")).toBeNull();
    expect(suggestBenchmark("Other Scheme - FoF Overseas", "PGIM India Global Equity Opportunities Fund of Fund")).toBeNull();
  });
});

describe("planInfo / assetClassFor", () => {
  it("reads AMFI plan/option columns", () => {
    expect(planInfo("DSP Short Term Fund", "Direct Plan", "Growth")).toEqual({ isDirect: true, isRegular: false, isGrowth: true });
    expect(planInfo("DSP Short Term Fund", "Direct Plan", "Monthly IDCW").isGrowth).toBe(false);
    expect(planInfo("DSP Short Term Fund", "Regular Plan", "Growth").isDirect).toBe(false);
  });

  it("falls back to the scheme name", () => {
    expect(planInfo("HSBC Short Duration Fund - Growth Direct")).toMatchObject({ isDirect: true, isGrowth: true });
    expect(planInfo("Tata Mid Cap Growth Fund - Direct Plan Bonus(Growth)").isGrowth).toBe(false);
    expect(planInfo("Nippon India Growth Mid Cap Fund - Direct Plan - IDCW Option").isGrowth).toBe(false);
  });

  it("classifies asset classes", () => {
    expect(assetClassFor("Debt Scheme - Short Duration Fund", "x")).toBe("debt");
    expect(assetClassFor("Other Scheme - FoF Overseas", "Edelweiss US Technology Equity Fund of Fund")).toBe("equity");
    expect(assetClassFor("Other Scheme - Index Funds", "Bharat Bond ETF FOF - April 2030")).toBe("debt");
  });
});
