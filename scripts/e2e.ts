import "./_env";
import { neon } from "@neondatabase/serverless";
import { activeFunds } from "@/db/queries";
import { db } from "@/db/client";
import { marketContext, reports } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { normaliseCategory } from "@/lib/classify";
import { addDays } from "@/lib/dates";
import { buildFactSheet } from "@/lib/gemini/factSheet";
import { checkReport } from "@/lib/gemini/hallucinationGuard";
import { assessPortfolio, loadSnapshots } from "@/lib/jobs/report";
import { SNAPSHOT_WEEKS } from "@/lib/jobs/ingest";

/**
 * End-to-end test against a running deployment (default: production). Exercises the real HTTP API, the real
 * database and the real Gemini call. It adds a test fund, reports, removes it and reports again, so the final
 * state is the normal portfolio. Usage: npm run e2e [-- https://your-url]
 */
const BASE = (process.argv.find((a) => a.startsWith("http")) ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";
const TEST_FUND = "122639"; // Parag Parikh Flexi Cap Fund - Direct Plan - Growth: a category Meera doesn't hold
const sql = neon(process.env.DATABASE_URL!);

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
}

async function call(method: string, path: string, opts: { auth?: boolean; body?: unknown } = {}) {
  const t = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(opts.auth ? { Authorization: `Bearer ${SECRET}` } : {}), ...(opts.body ? { "content-type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML page */
  }
  return { status: res.status, json, text, ms: Date.now() - t };
}

async function counts() {
  const [r] = await sql`select (select count(*) from weekly_snapshots)::int snaps, (select count(*) from reports)::int reports, (select count(*) from market_context)::int mc, (select count(*) from funds)::int funds, (select count(*) from category_peers)::int peers`;
  return r as { snaps: number; reports: number; mc: number; funds: number; peers: number };
}

async function latestReportCodes(): Promise<string[]> {
  const [r] = await sql`select content->'funds' f from reports order by week_ending desc limit 1`;
  return ((r?.f ?? []) as Array<{ schemeCode: string }>).map((x) => x.schemeCode);
}

/** Rebuilds the fact sheet from stored data and re-runs the hallucination guard on the stored report. */
async function guardStoredReport(label: string) {
  const [report] = await db().select().from(reports).orderBy(desc(reports.weekEnding)).limit(1);
  const fundList = await activeFunds();
  const rows = await loadSnapshots(fundList.map((f) => f.schemeCode), addDays(report.weekEnding, -7 * (SNAPSHOT_WEEKS - 1)), report.weekEnding);
  const { perFund, verdict } = assessPortfolio(fundList, rows, report.weekEnding);
  const [mc] = await db().select().from(marketContext).where(eq(marketContext.weekEnding, report.weekEnding));
  const sheet = buildFactSheet({
    weekEnding: report.weekEnding,
    verdict,
    latest: perFund.map(({ fund, latest, history }) => ({ name: fund.name, categoryLabel: normaliseCategory(fund.sebiCategory).category, assetClass: fund.assetClass, row: latest, history })),
    indexMoves: mc.indexMoves,
    headlines: mc.headlines,
  });
  const { guardErrors: _g, ...content } = report.content;
  void _g;
  const result = checkReport(content, sheet);
  check(`${label}: stored report passes the hallucination guard`, result.ok, result.ok ? `${report.writtenBy}, ${report.model}` : result.errors.join(" | "));
  check(`${label}: verdict is the engine's verdict`, report.verdict === verdict.verdict, report.verdict);
  check(`${label}: report has one entry per active fund`, report.content.funds.length === perFund.length, `${report.content.funds.length} summaries`);
}

async function main() {
  console.log(`End-to-end test against ${BASE}\n`);
  if (!SECRET) throw new Error("CRON_SECRET missing from .env.local");

  console.log("— Security");
  for (const [m, p] of [["GET", "/api/cron/daily-nav"], ["GET", "/api/cron/saturday-report"], ["POST", "/api/admin/run-report"], ["POST", "/api/admin/backfill"], ["POST", "/api/funds"], ["DELETE", `/api/funds/${TEST_FUND}`]] as const) {
    const r = await call(m, p, { body: m === "POST" && p === "/api/funds" ? { schemeCode: TEST_FUND } : undefined });
    check(`${m} ${p} without credentials is rejected`, r.status === 401, `HTTP ${r.status}`);
  }
  const wrong = await fetch(`${BASE}/api/cron/saturday-report`, { headers: { Authorization: "Bearer wrong-secret" } });
  check("Cron with a wrong secret is rejected", wrong.status === 401, `HTTP ${wrong.status}`);
  const badLogin = await call("POST", "/api/admin/session", { body: { passcode: "definitely-not-it" } });
  check("Wrong passcode is rejected", badLogin.status === 401, String(badLogin.json.error ?? ""));

  console.log("\n— Pages");
  for (const p of ["/", "/funds", "/history", "/status"]) {
    const r = await call("GET", p);
    check(`${p} loads`, r.status === 200 && r.text.includes("Who moved my money?"), `HTTP ${r.status}, ${r.ms} ms`);
  }
  const home = await call("GET", "/");
  check("Home shows one of the three verdict phrases", /No action needed|One fund worth watching|Consider reviewing your allocation/.test(home.text));
  check("Home carries the SEBI disclaimer", home.text.includes("Not SEBI-registered advice"));

  console.log("\n— Fund lookup (public, rate-limited)");
  const letters = await call("GET", "/api/funds/lookup?code=12ab");
  check("Code with letters gives a clear error", letters.status === 400, String(letters.json.error));
  const unknown = await call("GET", "/api/funds/lookup?code=999999");
  check("Unknown code gives a clear error", unknown.status === 404, String(unknown.json.error));
  const look = await call("GET", `/api/funds/lookup?code=${TEST_FUND}`);
  const preview = look.json.preview as { name?: string; suggestedBenchmark?: string; latestNavDate?: string } | undefined;
  check("Valid code returns a live preview", look.status === 200 && !!preview?.name, `${preview?.name}, NAV ${preview?.latestNavDate}, benchmark ${preview?.suggestedBenchmark}`);
  const search = await call("GET", "/api/funds/lookup?q=parag%20parikh%20flexi");
  check("Scheme search returns matches", Array.isArray(search.json.results) && (search.json.results as unknown[]).length > 0, `${(search.json.results as unknown[] | undefined)?.length} results`);

  console.log("\n— Add a fund → it appears in the next report with backfilled history");
  const before = await counts();
  const add = await call("POST", "/api/funds", { auth: true, body: { schemeCode: TEST_FUND, monthlySip: 3000 } });
  const backfill = add.json.backfill as { snapshotRows?: number; status?: string } | undefined;
  check("Add fund succeeds", add.status === 201, `HTTP ${add.status} in ${(add.ms / 1000).toFixed(1)} s`);
  check("New fund is backfilled with 12 weeks", backfill?.snapshotRows === 12, `${backfill?.snapshotRows} weeks, ${backfill?.status}`);
  const dup = await call("POST", "/api/funds", { auth: true, body: { schemeCode: TEST_FUND } });
  check("Adding it again is refused clearly", dup.status === 409, String(dup.json.error));
  const r1 = await call("POST", "/api/admin/run-report", { auth: true });
  check("Report generates", r1.status === 200 && r1.json.status !== undefined, `${r1.json.verdict}, written by ${r1.json.writtenBy}, ${(r1.ms / 1000).toFixed(1)} s`);
  check("New fund is in the report", (await latestReportCodes()).includes(TEST_FUND));
  await guardStoredReport("With test fund");

  console.log("\n— Idempotency: same week again");
  const mid = await counts();
  const r2 = await call("GET", "/api/cron/saturday-report", { auth: true });
  const after2 = await counts();
  check("Saturday cron runs with the secret", r2.status === 200, `${r2.json.verdict}, ${(r2.ms / 1000).toFixed(1)} s`);
  check("No duplicate snapshots, reports or market context", mid.snaps === after2.snaps && mid.reports === after2.reports && mid.mc === after2.mc, `snapshots ${mid.snaps}→${after2.snaps}, reports ${mid.reports}→${after2.reports}, context ${mid.mc}→${after2.mc}`);

  console.log("\n— Remove the fund → hidden from reports, history kept");
  const del = await call("DELETE", `/api/funds/${TEST_FUND}`, { auth: true });
  check("Remove succeeds", del.status === 200, `HTTP ${del.status}`);
  const r3 = await call("POST", "/api/admin/run-report", { auth: true });
  check("Report regenerates", r3.status === 200, `${r3.json.verdict}, ${(r3.ms / 1000).toFixed(1)} s`);
  check("Removed fund is not in the report", !(await latestReportCodes()).includes(TEST_FUND));
  const [kept] = await sql`select count(*)::int n from weekly_snapshots where scheme_code = ${TEST_FUND}`;
  const [row] = await sql`select is_active from funds where scheme_code = ${TEST_FUND}`;
  check("Its history is kept (soft delete)", kept.n >= 12 && row.is_active === false, `${kept.n} snapshots, is_active=${row.is_active}`);
  await guardStoredReport("Final report");

  console.log("\n— Data integrity across every stored week");
  const [bad] = await sql`select count(*)::int n from weekly_snapshots where fund_ret_1w is not null and fund_choices_1w is not null and abs(coalesce(market_1w,0) + coalesce(similar_funds_1w,0) + fund_choices_1w - fund_ret_1w) > 1e-9`;
  const [all] = await sql`select count(*)::int n from weekly_snapshots`;
  check("The three parts sum to the fund's return in every snapshot", bad.n === 0, `${all.n} snapshots checked, ${bad.n} off`);
  const final = await counts();
  check("Fund count unchanged apart from the soft-deleted test fund", final.funds === before.funds || final.funds === before.funds + 1, `${before.funds}→${final.funds}`);

  console.log("\n— Live sources");
  const st = await call("GET", "/api/status/check");
  const checks = (st.json.checks ?? []) as Array<{ source: string; ok: boolean; detail: string }>;
  for (const c of checks) check(`Source healthy: ${c.source}`, c.ok, c.detail);

  console.log(`\n${passed} passed · ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
