/**
 * Every threshold the verdict engine uses. Returns are decimals (0.015 = 1.5%); "pp" = percentage points.
 * Change a number here and the engine, the report and the README's plain-English rules all follow.
 */
export const VERDICT_CONFIG = {
  equity: {
    /** "Your fund's choices" was negative in at least this many of the last `persistenceWindowWeeks` weeks… */
    persistentLagWeeks: 3,
    persistenceWindowWeeks: 4,
    /** …AND the fund trails similar funds over 1 month by more than this (−1.5 pp). Both must hold. */
    oneMonthGapVsCategory: -0.015,
    /** Year-to-date, the fund trails similar funds by more than this (−4 pp). Not applied when YTD is "since launch". */
    ytdGapVsCategory: -0.04,
    /**
     * A week only counts as "lagging" if the fund's choices cost more than this (0.05 pp). Smaller gaps are
     * tracking noise — an index fund trails its index by its fee (~0.001% a week) and that isn't underperformance.
     */
    noiseBand: 0.0005,
  },
  debt: {
    /**
     * A short-duration debt fund rarely falls 0.3% in a week; when it does on its own it can signal a credit event
     * (a bond it holds being downgraded). But when rates rise every debt fund dips together — that's the market,
     * not the fund — so the fall must also be clearly worse than similar funds (by more than 0.2 pp).
     * This is an absolute loss rather than relative lag, so one week is enough. If similar-fund data is
     * missing, the absolute thresholds apply on their own, so nothing goes unchecked.
     */
    weeklyDrop: -0.003,
    weeklyGapVsCategory: -0.002,
    /** A negative month counts only if the fund is also more than 0.25 pp behind similar funds over that month. */
    oneMonthNegative: 0,
    oneMonthGapVsCategory: -0.0025,
  },
  allocation: {
    /** Current value weight vs SIP-implied target weight; more than 10 pp apart on any fund triggers a review. */
    driftThreshold: 0.1,
  },
  /** Weights of the 0–100 "How much to worry" score. They add up to 100. */
  worryWeights: {
    flaggedFunds: 50,
    persistence: 25,
    oneMonthGap: 10,
    drift: 15,
  },
  /** A 1-month gap this big (−5 pp) counts as the full `oneMonthGap` weight. */
  worryGapScale: 0.05,
  /** A drift this big (20 pp) counts as the full `drift` weight. */
  worryDriftScale: 0.2,
} as const;

/** Data-quality limits used before anything is compared. */
export const DATA_CONFIG = {
  /** The NAV used for "now" must be at most this many days older than the week's Friday. */
  endMaxStaleDays: 7,
  /** The NAV used as a starting point must be at most this many days older than the target date (holidays). */
  baseMaxStaleDays: 10,
  /** Peer returns beyond these are treated as data errors (e.g. a segregated-portfolio NAV reset) and left out. */
  peerSanityBounds: { "1w": 0.2, "1m": 0.4, ytd: 1.5 },
} as const;
