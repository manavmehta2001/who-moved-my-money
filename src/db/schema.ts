import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { FundFlag, Provenance, IndexMove, Headline, ReportContent, JobDetails } from "./types";

export const benchmarks = pgTable("benchmarks", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  sourceType: text("source_type", { enum: ["mf_proxy", "yahoo"] }).notNull(),
  sourceRef: text("source_ref").notNull(),
  sourceName: text("source_name"),
  isTriApprox: boolean("is_tri_approx").notNull().default(false),
  currency: text("currency").notNull().default("INR"),
  fallbackKey: text("fallback_key"),
  showInMarketStrip: boolean("show_in_market_strip").notNull().default(false),
  stripOrder: integer("strip_order"),
});

export const funds = pgTable("funds", {
  schemeCode: text("scheme_code").primaryKey(),
  name: text("name").notNull(),
  amc: text("amc").notNull(),
  sebiCategory: text("sebi_category").notNull(),
  peerGroup: text("peer_group").notNull(),
  assetClass: text("asset_class", { enum: ["equity", "debt", "hybrid", "other"] }).notNull(),
  benchmarkKey: text("benchmark_key").references(() => benchmarks.key),
  monthlySip: doublePrecision("monthly_sip"),
  unitsHeld: doublePrecision("units_held"),
  investedAmount: doublePrecision("invested_amount"),
  /** True when units/invested come from the sample SIP simulation rather than Meera's own numbers. */
  holdingsSample: boolean("holdings_sample").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
});

export const navHistory = pgTable(
  "nav_history",
  {
    schemeCode: text("scheme_code").notNull(),
    navDate: date("nav_date", { mode: "string" }).notNull(),
    nav: doublePrecision("nav").notNull(),
  },
  (t) => [primaryKey({ columns: [t.schemeCode, t.navDate] })],
);

export const benchmarkHistory = pgTable(
  "benchmark_history",
  {
    key: text("key")
      .notNull()
      .references(() => benchmarks.key),
    valueDate: date("value_date", { mode: "string" }).notNull(),
    value: doublePrecision("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.valueDate] })],
);

// `sebi_category` holds the peer-group key: the normalised SEBI category, narrowed by tracked index for index funds / overseas FoFs.
export const categoryPeers = pgTable(
  "category_peers",
  {
    sebiCategory: text("sebi_category").notNull(),
    schemeCode: text("scheme_code").notNull(),
    schemeName: text("scheme_name").notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sebiCategory, t.schemeCode] }), index("category_peers_scheme_idx").on(t.schemeCode)],
);

export const weeklySnapshots = pgTable(
  "weekly_snapshots",
  {
    weekEnding: date("week_ending", { mode: "string" }).notNull(),
    schemeCode: text("scheme_code").notNull(),
    nav: doublePrecision("nav").notNull(),
    navDate: date("nav_date", { mode: "string" }).notNull(),
    fundRet1w: doublePrecision("fund_ret_1w"),
    fundRet1m: doublePrecision("fund_ret_1m"),
    fundRetYtd: doublePrecision("fund_ret_ytd"),
    benchRet1w: doublePrecision("bench_ret_1w"),
    benchRet1m: doublePrecision("bench_ret_1m"),
    benchRetYtd: doublePrecision("bench_ret_ytd"),
    catRet1w: doublePrecision("cat_ret_1w"),
    catRet1m: doublePrecision("cat_ret_1m"),
    catRetYtd: doublePrecision("cat_ret_ytd"),
    market1w: doublePrecision("market_1w"),
    similarFunds1w: doublePrecision("similar_funds_1w"),
    fundChoices1w: doublePrecision("fund_choices_1w"),
    market1m: doublePrecision("market_1m"),
    similarFunds1m: doublePrecision("similar_funds_1m"),
    fundChoices1m: doublePrecision("fund_choices_1m"),
    peerCount: integer("peer_count").notNull().default(0),
    flags: jsonb("flags").$type<FundFlag[]>().notNull().default([]),
    provenance: jsonb("provenance").$type<Provenance>().notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.weekEnding, t.schemeCode] })],
);

export const marketContext = pgTable("market_context", {
  weekEnding: date("week_ending", { mode: "string" }).primaryKey(),
  indexMoves: jsonb("index_moves").$type<IndexMove[]>().notNull(),
  headlines: jsonb("headlines").$type<Headline[]>().notNull(),
  newsProvider: text("news_provider").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  weekEnding: date("week_ending", { mode: "string" }).primaryKey(),
  verdict: text("verdict", {
    enum: ["No action needed", "One fund worth watching", "Consider reviewing your allocation"],
  }).notNull(),
  verdictReason: text("verdict_reason").notNull(),
  worryScore: integer("worry_score").notNull(),
  content: jsonb("content").$type<ReportContent>().notNull(),
  writtenBy: text("written_by", { enum: ["gemini", "template"] }).notNull(),
  model: text("model"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  latencyMs: integer("latency_ms"),
  retries: integer("retries").notNull().default(0),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial("id").primaryKey(),
    jobName: text("job_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status", { enum: ["running", "success", "partial", "error"] }).notNull(),
    details: jsonb("details").$type<JobDetails>(),
    error: text("error"),
  },
  (t) => [index("job_runs_name_started_idx").on(t.jobName, t.startedAt)],
);

export type Fund = typeof funds.$inferSelect;
export type Benchmark = typeof benchmarks.$inferSelect;
export type WeeklySnapshot = typeof weeklySnapshots.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type MarketContext = typeof marketContext.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
