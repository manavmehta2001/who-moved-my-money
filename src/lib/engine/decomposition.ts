export type Driver = "market" | "similar_funds" | "fund_choices";

export type Decomposition = {
  /** Whole-market move (the benchmark). Null when no public benchmark exists. */
  market: number | null;
  /** How funds like this one did beyond the market. With no benchmark, this is the category average itself. */
  similarFunds: number | null;
  /** What the fund manager's own decisions added or cost. */
  fundChoices: number | null;
  mode: "three_part" | "no_benchmark" | "no_category" | "fund_only";
  dominant: Driver | null;
};

/**
 * Splits a fund's return so the parts always add up to it exactly:
 *   market        = benchmark
 *   similar_funds = category average − benchmark
 *   fund_choices  = fund − category average
 * Without a benchmark: similar_funds = category average, fund_choices = fund − category average.
 * Without peers:       market = benchmark, fund_choices = fund − benchmark.
 */
export function decompose(fund: number, benchmark: number | null, categoryAvg: number | null): Decomposition {
  let parts: Pick<Decomposition, "market" | "similarFunds" | "fundChoices" | "mode">;
  if (benchmark !== null && categoryAvg !== null) {
    parts = { market: benchmark, similarFunds: categoryAvg - benchmark, fundChoices: fund - categoryAvg, mode: "three_part" };
  } else if (categoryAvg !== null) {
    parts = { market: null, similarFunds: categoryAvg, fundChoices: fund - categoryAvg, mode: "no_benchmark" };
  } else if (benchmark !== null) {
    parts = { market: benchmark, similarFunds: null, fundChoices: fund - benchmark, mode: "no_category" };
  } else {
    parts = { market: null, similarFunds: null, fundChoices: null, mode: "fund_only" };
  }
  return { ...parts, dominant: dominantDriver(parts) };
}

export function dominantDriver(p: { market: number | null; similarFunds: number | null; fundChoices: number | null }): Driver | null {
  const candidates: Array<[Driver, number | null]> = [
    ["market", p.market],
    ["similar_funds", p.similarFunds],
    ["fund_choices", p.fundChoices],
  ];
  let best: Driver | null = null;
  let bestAbs = -1;
  for (const [k, v] of candidates) {
    if (v === null) continue;
    if (Math.abs(v) > bestAbs) {
      best = k;
      bestAbs = Math.abs(v);
    }
  }
  return best;
}

export const DRIVER_LABEL: Record<Driver, string> = {
  market: "The market",
  similar_funds: "Funds like yours",
  fund_choices: "Your fund's choices",
};
