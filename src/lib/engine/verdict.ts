import { VERDICT_CONFIG } from "@/config/verdict";
import type { FundFlag, Verdict } from "@/db/types";
import { pct, pp } from "@/lib/format";

export type AssetClass = "equity" | "debt" | "hybrid" | "other";

/** True when the fund's own choices cost it more than tracking noise this week. */
export function isLagging(fundChoices1w: number | null): boolean {
  return fundChoices1w !== null && fundChoices1w < -VERDICT_CONFIG.equity.noiseBand;
}

/** One fund's numbers for one week — the subset of a weekly snapshot the rules need. */
export type WeekFacts = {
  weekEnding: string;
  fundRet1w: number | null;
  fundRet1m: number | null;
  fundRetYtd: number | null;
  catRet1m: number | null;
  catRetYtd: number | null;
  fundChoices1w: number | null;
  ytdFromInception: boolean;
};

/**
 * Flags for the latest week in `history` (oldest first). Equity-style rules need persistence: one bad week alone
 * never flags. Hybrid and "other" funds use the equity rules, since they're judged against similar funds the same way.
 */
export function fundFlags(assetClass: AssetClass, history: WeekFacts[]): FundFlag[] {
  const latest = history.at(-1);
  if (!latest) return [];
  const flags: FundFlag[] = [];

  if (assetClass === "debt") {
    const c = VERDICT_CONFIG.debt;
    if (latest.fundRet1w !== null && latest.fundRet1w < c.weeklyDrop) {
      flags.push({ code: "debt_weekly_drop", reason: `It fell ${pct(latest.fundRet1w)} this week, which is unusual for a short-duration debt fund and can mean trouble with a bond it holds.` });
    }
    if (latest.fundRet1m !== null && latest.fundRet1m < c.oneMonthNegative) {
      flags.push({ code: "debt_monthly_negative", reason: `It is down ${pct(latest.fundRet1m)} over the past month; funds like this normally edge up steadily.` });
    }
    return flags;
  }

  const c = VERDICT_CONFIG.equity;
  const recent = history.slice(-c.persistenceWindowWeeks);
  const known = recent.filter((w) => w.fundChoices1w !== null);
  const laggingWeeks = known.filter((w) => isLagging(w.fundChoices1w)).length;
  const gap1m = latest.fundRet1m !== null && latest.catRet1m !== null ? latest.fundRet1m - latest.catRet1m : null;
  if (known.length >= c.persistenceWindowWeeks && laggingWeeks >= c.persistentLagWeeks && gap1m !== null && gap1m < c.oneMonthGapVsCategory) {
    flags.push({
      code: "equity_persistent_lag",
      reason: `It trailed similar funds in ${laggingWeeks} of the last ${known.length} weeks and is ${pp(gap1m)} behind them over the past month.`,
    });
  }
  const gapYtd = latest.fundRetYtd !== null && latest.catRetYtd !== null && !latest.ytdFromInception ? latest.fundRetYtd - latest.catRetYtd : null;
  if (gapYtd !== null && gapYtd < c.ytdGapVsCategory) {
    flags.push({ code: "equity_ytd_lag", reason: `This year it is ${pp(gapYtd)} behind similar funds.` });
  }
  return flags;
}

export type HoldingInput = { schemeCode: string; name: string; monthlySip: number | null; unitsHeld: number | null; nav: number | null };

export type DriftResult =
  | { applicable: false; reason: string }
  | {
      applicable: true;
      maxDrift: number;
      worstFund: { schemeCode: string; name: string; currentWeight: number; targetWeight: number };
      funds: Array<{ schemeCode: string; name: string; value: number; currentWeight: number; targetWeight: number; drift: number }>;
      triggered: boolean;
    };

/** Current value weights (units × NAV) vs SIP-implied target weights. Only when every fund has both numbers. */
export function allocationDrift(holdings: HoldingInput[]): DriftResult {
  if (holdings.length < 2) return { applicable: false, reason: "Drift needs at least two funds." };
  const missing = holdings.filter((h) => !h.unitsHeld || !h.monthlySip || !h.nav);
  if (missing.length > 0) return { applicable: false, reason: `Units held or SIP amount is missing for ${missing.length} of ${holdings.length} funds, so allocation drift isn't checked.` };
  const values = holdings.map((h) => (h.unitsHeld as number) * (h.nav as number));
  const totalValue = values.reduce((a, b) => a + b, 0);
  const totalSip = holdings.reduce((a, h) => a + (h.monthlySip as number), 0);
  const funds = holdings.map((h, i) => {
    const currentWeight = values[i] / totalValue;
    const targetWeight = (h.monthlySip as number) / totalSip;
    return { schemeCode: h.schemeCode, name: h.name, value: values[i], currentWeight, targetWeight, drift: currentWeight - targetWeight };
  });
  const worst = funds.reduce((a, b) => (Math.abs(b.drift) > Math.abs(a.drift) ? b : a));
  return {
    applicable: true,
    maxDrift: Math.abs(worst.drift),
    worstFund: { schemeCode: worst.schemeCode, name: worst.name, currentWeight: worst.currentWeight, targetWeight: worst.targetWeight },
    funds,
    triggered: Math.abs(worst.drift) > VERDICT_CONFIG.allocation.driftThreshold,
  };
}

export type FundAssessment = { schemeCode: string; name: string; assetClass: AssetClass; history: WeekFacts[]; flags: FundFlag[] };

export type WorryScore = { score: number; parts: Record<keyof typeof VERDICT_CONFIG.worryWeights, number> };

export function worryScore(funds: FundAssessment[], drift: DriftResult): WorryScore {
  const w = VERDICT_CONFIG.worryWeights;
  const flagged = funds.filter((f) => f.flags.length > 0).length;
  const flaggedPart = (Math.min(flagged, 3) / 3) * w.flaggedFunds;

  const equity = funds.filter((f) => f.assetClass !== "debt");
  const window = VERDICT_CONFIG.equity.persistenceWindowWeeks;
  const persistenceShares = equity.map((f) => {
    const known = f.history.slice(-window).filter((x) => x.fundChoices1w !== null);
    return known.length ? known.filter((x) => isLagging(x.fundChoices1w)).length / known.length : 0;
  });
  const persistencePart = persistenceShares.length ? (persistenceShares.reduce((a, b) => a + b, 0) / persistenceShares.length) * w.persistence : 0;

  const gaps = funds.map((f) => {
    const l = f.history.at(-1);
    if (!l || l.fundRet1m === null || l.catRet1m === null) return 0;
    return Math.min(Math.max(-(l.fundRet1m - l.catRet1m) / VERDICT_CONFIG.worryGapScale, 0), 1);
  });
  const gapPart = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length) * w.oneMonthGap : 0;

  const driftPart = drift.applicable ? Math.min(drift.maxDrift / VERDICT_CONFIG.worryDriftScale, 1) * w.drift : 0;

  const parts = { flaggedFunds: flaggedPart, persistence: persistencePart, oneMonthGap: gapPart, drift: driftPart };
  const score = Math.round(Math.min(100, Math.max(0, flaggedPart + persistencePart + gapPart + driftPart)));
  return { score, parts };
}

export type PortfolioVerdict = {
  verdict: Verdict;
  /** Deterministic, specific reason. Gemini rewrites it in friendlier words but may not change the verdict. */
  reason: string;
  flaggedFunds: Array<{ schemeCode: string; name: string; flags: FundFlag[] }>;
  drift: DriftResult;
  worry: WorryScore;
};

export function portfolioVerdict(funds: FundAssessment[], holdings: HoldingInput[]): PortfolioVerdict {
  const flaggedFunds = funds.filter((f) => f.flags.length > 0).map((f) => ({ schemeCode: f.schemeCode, name: f.name, flags: f.flags }));
  const drift = allocationDrift(holdings);
  const worry = worryScore(funds, drift);
  const driftTriggered = drift.applicable && drift.triggered;

  let verdict: Verdict;
  let reason: string;
  if (flaggedFunds.length >= 2 || driftTriggered) {
    verdict = "Consider reviewing your allocation";
    const bits: string[] = [];
    if (flaggedFunds.length >= 2) {
      bits.push(`${flaggedFunds.length} funds need a closer look.`);
      for (const f of flaggedFunds) bits.push(`${f.name}: ${f.flags.map((x) => x.reason).join(" ")}`);
    }
    if (driftTriggered && drift.applicable) {
      bits.push(`${drift.worstFund.name} is now ${pct(drift.worstFund.currentWeight, 1)} of your money, while your SIPs aim for ${pct(drift.worstFund.targetWeight, 1)}.`);
    }
    reason = bits.join(" ");
  } else if (flaggedFunds.length === 1) {
    verdict = "One fund worth watching";
    const f = flaggedFunds[0];
    reason = `${f.name}: ${f.flags.map((x) => x.reason).join(" ")}`;
  } else {
    verdict = "No action needed";
    reason = "No fund has been behind similar funds week after week, and none showed a warning sign this week.";
  }
  return { verdict, reason, flaggedFunds, drift, worry };
}
