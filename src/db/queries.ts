import { and, asc, desc, eq, gte, inArray, isNull, lte, max, sql } from "drizzle-orm";
import { db } from "./client";
import { benchmarkHistory, benchmarks, categoryPeers, funds, jobRuns, navHistory } from "./schema";
import type { BenchmarkDef } from "@/lib/sources/benchmarkCatalog";
import type { JobDetails } from "./types";
import type { IsoDate } from "@/lib/dates";

const CHUNK = 1000;

function chunks<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export async function upsertNavs(schemeCode: string, points: Array<{ date: IsoDate; nav: number }>): Promise<number> {
  for (const part of chunks(points)) {
    await db()
      .insert(navHistory)
      .values(part.map((p) => ({ schemeCode, navDate: p.date, nav: p.nav })))
      .onConflictDoUpdate({ target: [navHistory.schemeCode, navHistory.navDate], set: { nav: sql`excluded.nav` } });
  }
  return points.length;
}

export async function upsertNavRows(rows: Array<{ schemeCode: string; navDate: IsoDate; nav: number }>): Promise<number> {
  for (const part of chunks(rows)) {
    await db()
      .insert(navHistory)
      .values(part)
      .onConflictDoUpdate({ target: [navHistory.schemeCode, navHistory.navDate], set: { nav: sql`excluded.nav` } });
  }
  return rows.length;
}

export async function upsertBenchmarkValues(key: string, points: Array<{ date: IsoDate; value: number }>): Promise<number> {
  for (const part of chunks(points)) {
    await db()
      .insert(benchmarkHistory)
      .values(part.map((p) => ({ key, valueDate: p.date, value: p.value })))
      .onConflictDoUpdate({ target: [benchmarkHistory.key, benchmarkHistory.valueDate], set: { value: sql`excluded.value` } });
  }
  return points.length;
}

export async function upsertBenchmarkDefs(defs: BenchmarkDef[]): Promise<void> {
  await db()
    .insert(benchmarks)
    .values(defs)
    .onConflictDoUpdate({
      target: benchmarks.key,
      set: {
        label: sql`excluded.label`,
        sourceType: sql`excluded.source_type`,
        sourceRef: sql`excluded.source_ref`,
        sourceName: sql`excluded.source_name`,
        isTriApprox: sql`excluded.is_tri_approx`,
        currency: sql`excluded.currency`,
        fallbackKey: sql`excluded.fallback_key`,
        showInMarketStrip: sql`excluded.show_in_market_strip`,
        stripOrder: sql`excluded.strip_order`,
      },
    });
}

export async function activeFunds() {
  return db().select().from(funds).where(eq(funds.isActive, true)).orderBy(asc(funds.addedAt), asc(funds.schemeCode));
}

export async function allBenchmarks() {
  return db().select().from(benchmarks).orderBy(asc(benchmarks.key));
}

/** Replaces a peer group's membership atomically (neon-http batch = one transaction). */
export async function replacePeerGroup(group: string, members: Array<{ schemeCode: string; schemeName: string }>): Promise<void> {
  const now = new Date();
  const del = db().delete(categoryPeers).where(eq(categoryPeers.sebiCategory, group));
  if (members.length === 0) {
    await del;
    return;
  }
  const ins = db()
    .insert(categoryPeers)
    .values(members.map((m) => ({ sebiCategory: group, schemeCode: m.schemeCode, schemeName: m.schemeName, refreshedAt: now })));
  await db().batch([del, ins]);
}

export async function peersFor(group: string) {
  return db().select().from(categoryPeers).where(eq(categoryPeers.sebiCategory, group));
}

export async function lastNavDates(schemeCodes: string[]): Promise<Map<string, { first: IsoDate; last: IsoDate }>> {
  if (schemeCodes.length === 0) return new Map();
  const rows = await db()
    .select({
      schemeCode: navHistory.schemeCode,
      first: sql<IsoDate>`min(${navHistory.navDate})`,
      last: max(navHistory.navDate),
    })
    .from(navHistory)
    .where(inArray(navHistory.schemeCode, schemeCodes))
    .groupBy(navHistory.schemeCode);
  return new Map(rows.filter((r) => r.last).map((r) => [r.schemeCode, { first: r.first, last: r.last as IsoDate }]));
}

export async function lastBenchmarkDates(): Promise<Map<string, IsoDate>> {
  const rows = await db()
    .select({ key: benchmarkHistory.key, last: max(benchmarkHistory.valueDate) })
    .from(benchmarkHistory)
    .groupBy(benchmarkHistory.key);
  return new Map(rows.filter((r) => r.last).map((r) => [r.key, r.last as IsoDate]));
}

export async function navSeries(schemeCodes: string[], from: IsoDate, to: IsoDate) {
  if (schemeCodes.length === 0) return new Map<string, Array<{ date: IsoDate; value: number }>>();
  const rows = await db()
    .select({ schemeCode: navHistory.schemeCode, date: navHistory.navDate, nav: navHistory.nav })
    .from(navHistory)
    .where(and(inArray(navHistory.schemeCode, schemeCodes), gte(navHistory.navDate, from), lte(navHistory.navDate, to)))
    .orderBy(asc(navHistory.schemeCode), asc(navHistory.navDate));
  const out = new Map<string, Array<{ date: IsoDate; value: number }>>();
  for (const r of rows) {
    const list = out.get(r.schemeCode) ?? [];
    list.push({ date: r.date, value: r.nav });
    out.set(r.schemeCode, list);
  }
  return out;
}

export async function benchmarkSeries(keys: string[], from: IsoDate, to: IsoDate) {
  if (keys.length === 0) return new Map<string, Array<{ date: IsoDate; value: number }>>();
  const rows = await db()
    .select({ key: benchmarkHistory.key, date: benchmarkHistory.valueDate, value: benchmarkHistory.value })
    .from(benchmarkHistory)
    .where(and(inArray(benchmarkHistory.key, keys), gte(benchmarkHistory.valueDate, from), lte(benchmarkHistory.valueDate, to)))
    .orderBy(asc(benchmarkHistory.key), asc(benchmarkHistory.valueDate));
  const out = new Map<string, Array<{ date: IsoDate; value: number }>>();
  for (const r of rows) {
    const list = out.get(r.key) ?? [];
    list.push({ date: r.date, value: r.value });
    out.set(r.key, list);
  }
  return out;
}

export async function recentJobRuns(limit = 20) {
  return db().select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(limit);
}

export async function runningJob(jobName: string, withinMinutes = 15) {
  const rows = await db()
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.jobName, jobName), eq(jobRuns.status, "running"), isNull(jobRuns.finishedAt), gte(jobRuns.startedAt, new Date(Date.now() - withinMinutes * 60_000))))
    .limit(1);
  return rows[0] ?? null;
}

export type JobContext = { details: JobDetails; warn: (msg: string) => void };

/** Records a job_runs row around `fn`. Warnings make the run "partial" instead of "success". */
export async function withJobRun<T>(jobName: string, fn: (ctx: JobContext) => Promise<T>): Promise<{ runId: number; result: T; status: "success" | "partial"; details: JobDetails }> {
  const [row] = await db().insert(jobRuns).values({ jobName, status: "running", details: {} }).returning({ id: jobRuns.id });
  const warnings: string[] = [];
  const details: JobDetails = {};
  const ctx: JobContext = { details, warn: (msg) => warnings.push(msg) };
  const started = Date.now();
  try {
    const result = await fn(ctx);
    const status = warnings.length ? "partial" : "success";
    await db()
      .update(jobRuns)
      .set({ status, finishedAt: new Date(), details: { ...details, warnings, durationMs: Date.now() - started } })
      .where(eq(jobRuns.id, row.id));
    return { runId: row.id, result, status, details: { ...details, warnings } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db()
      .update(jobRuns)
      .set({ status: "error", finishedAt: new Date(), error: message.slice(0, 4000), details: { ...details, warnings, durationMs: Date.now() - started } })
      .where(eq(jobRuns.id, row.id));
    throw e;
  }
}
