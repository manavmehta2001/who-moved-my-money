export const VERDICTS = ["No action needed", "One fund worth watching", "Consider reviewing your allocation"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type FundFlag = {
  code: "equity_persistent_lag" | "equity_ytd_lag" | "debt_weekly_drop" | "debt_monthly_negative";
  reason: string;
};

export type BenchmarkProvenance = {
  key: string;
  label: string;
  sourceType: "mf_proxy" | "yahoo";
  sourceRef: string;
  sourceName: string | null;
  isTriApprox: boolean;
  currency: string;
  usedFallback: boolean;
  asOf: string | null;
};

export type Provenance = {
  navSource: string;
  navAsOf: string;
  benchmark: BenchmarkProvenance | null;
  benchmarkNote: string | null;
  peerGroup: string;
  peerCount1w: number;
  peerCount1m: number;
  peerCountYtd: number;
  ytdFromInception: boolean;
  ytdStartDate: string | null;
};

export type IndexMove = {
  key: string;
  label: string;
  weekReturn: number | null;
  level: number | null;
  asOf: string | null;
  source: "yahoo" | "mf_proxy";
  sourceRef: string;
  note: string | null;
};

export type Headline = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
};

export type ReportFundContent = {
  schemeCode: string;
  summary: string;
  citedHeadlineIds: string[];
};

export type ReportContent = {
  headline: string;
  funds: ReportFundContent[];
  verdict: Verdict;
  verdictReason: string;
  jargonUsed: string[];
  guardErrors?: string[];
};

export type JobDetails = Record<string, unknown>;
