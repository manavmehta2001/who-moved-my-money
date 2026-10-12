/**
 * Every scheme code / symbol here was checked against live data on 12 Oct 2026 (see scripts/verify-sources.ts).
 * Primary benchmarks are Direct-Growth index funds: growth NAVs reinvest dividends, so they approximate the
 * Total Return Index — a fairer yardstick for a fund than the price-only index level.
 * Each primary falls back to the matching Yahoo index level if the proxy has no data for a window.
 */

export type BenchmarkDef = {
  key: string;
  label: string;
  sourceType: "mf_proxy" | "yahoo";
  sourceRef: string;
  sourceName: string;
  isTriApprox: boolean;
  currency: string;
  fallbackKey: string | null;
  showInMarketStrip: boolean;
  stripOrder: number | null;
};

export const BENCHMARKS: BenchmarkDef[] = [
  // Primary: index-fund proxies (mfapi)
  { key: "nifty50", label: "Nifty 50", sourceType: "mf_proxy", sourceRef: "120716", sourceName: "UTI Nifty 50 Index Fund - Direct Plan - Growth", isTriApprox: true, currency: "INR", fallbackKey: "idx_nifty50", showInMarketStrip: false, stripOrder: null },
  { key: "nifty500", label: "Nifty 500", sourceType: "mf_proxy", sourceRef: "147625", sourceName: "Motilal Oswal Nifty 500 Index Fund - Direct Plan - Growth", isTriApprox: true, currency: "INR", fallbackKey: "idx_nifty500", showInMarketStrip: false, stripOrder: null },
  { key: "midcap150", label: "Nifty Midcap 150", sourceType: "mf_proxy", sourceRef: "147622", sourceName: "Motilal Oswal Nifty Midcap 150 Index Fund - Direct Plan - Growth", isTriApprox: true, currency: "INR", fallbackKey: "idx_midcap150", showInMarketStrip: false, stripOrder: null },
  { key: "smallcap250", label: "Nifty Smallcap 250", sourceType: "mf_proxy", sourceRef: "147623", sourceName: "Motilal Oswal Nifty Smallcap 250 Index Fund - Direct Plan - Growth", isTriApprox: true, currency: "INR", fallbackKey: "idx_smallcap250", showInMarketStrip: false, stripOrder: null },
  { key: "nasdaq100", label: "Nasdaq 100 (in rupees)", sourceType: "mf_proxy", sourceRef: "149219", sourceName: "ICICI Prudential NASDAQ 100 Index Fund - Direct Plan - Growth", isTriApprox: true, currency: "INR", fallbackKey: "idx_nasdaq100", showInMarketStrip: false, stripOrder: null },
  { key: "sp500", label: "S&P 500 (in rupees)", sourceType: "mf_proxy", sourceRef: "148381", sourceName: "Motilal Oswal S&P 500 Index Fund - Direct Plan - Growth", isTriApprox: true, currency: "INR", fallbackKey: "idx_sp500", showInMarketStrip: false, stripOrder: null },

  // Secondary: index levels (Yahoo). Price-only, so not TRI. Also feed the Saturday market strip.
  { key: "idx_nifty50", label: "Nifty 50", sourceType: "yahoo", sourceRef: "^NSEI", sourceName: "Yahoo Finance ^NSEI", isTriApprox: false, currency: "INR", fallbackKey: null, showInMarketStrip: true, stripOrder: 1 },
  { key: "idx_midcap150", label: "Nifty Midcap 150", sourceType: "yahoo", sourceRef: "NIFTYMIDCAP150.NS", sourceName: "Yahoo Finance NIFTYMIDCAP150.NS", isTriApprox: false, currency: "INR", fallbackKey: null, showInMarketStrip: true, stripOrder: 2 },
  // Nifty Smallcap 100 has no working Yahoo symbol (NIFTYSMLCAP100.NS returns "not found"), so the strip uses Smallcap 250.
  { key: "idx_smallcap250", label: "Nifty Smallcap 250", sourceType: "yahoo", sourceRef: "NIFTYSMLCAP250.NS", sourceName: "Yahoo Finance NIFTYSMLCAP250.NS", isTriApprox: false, currency: "INR", fallbackKey: null, showInMarketStrip: true, stripOrder: 3 },
  { key: "idx_nifty500", label: "Nifty 500", sourceType: "yahoo", sourceRef: "^CRSLDX", sourceName: "Yahoo Finance ^CRSLDX", isTriApprox: false, currency: "INR", fallbackKey: null, showInMarketStrip: false, stripOrder: null },
  { key: "idx_nasdaq100", label: "Nasdaq 100 (in dollars)", sourceType: "yahoo", sourceRef: "^NDX", sourceName: "Yahoo Finance ^NDX", isTriApprox: false, currency: "USD", fallbackKey: null, showInMarketStrip: false, stripOrder: null },
  { key: "idx_sp500", label: "S&P 500 (in dollars)", sourceType: "yahoo", sourceRef: "^GSPC", sourceName: "Yahoo Finance ^GSPC", isTriApprox: false, currency: "USD", fallbackKey: null, showInMarketStrip: false, stripOrder: null },
];

/** For the market strip: if Yahoo is blocked, use the index-fund proxy for the same index instead. */
export const STRIP_PROXY_FALLBACK: Record<string, string> = {
  idx_nifty50: "nifty50",
  idx_midcap150: "midcap150",
  idx_smallcap250: "smallcap250",
};

export function benchmarkLabel(key: string | null): string | null {
  return BENCHMARKS.find((b) => b.key === key)?.label ?? null;
}

/** Benchmarks Meera can pick from in the add-fund dropdown (primaries only). */
export const SELECTABLE_BENCHMARKS = BENCHMARKS.filter((b) => b.sourceType === "mf_proxy").map((b) => ({ key: b.key, label: b.label }));
