import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getStatusView, type Health } from "@/lib/data/views";
import { formatDisplayDate, todayIST } from "@/lib/dates";
import { SourceCheck } from "@/components/status/SourceCheck";

export const metadata: Metadata = { title: "Data status" };

const HEALTH_WORD: Record<Health, string> = { ok: "Up to date", stale: "Behind", down: "No data" };
const JOB_LABEL: Record<string, string> = {
  "daily-nav": "Daily NAV update",
  "weekly-report": "Saturday report",
  backfill: "Backfill",
  "add-fund": "Add fund",
  report: "Report (script)",
  "recompute-fund": "Recompute fund",
};

function ist(d: Date | null): string {
  return d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default function StatusPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <span className="crumb">Mutual Funds /</span> Data status
          </h1>
          <p className="page-sub">Where every number comes from, how fresh it is, and whether the scheduled jobs are running.</p>
        </div>
      </div>
      <Suspense fallback={<p className="muted">Checking…</p>}>
        <Status />
      </Suspense>
    </>
  );
}

async function Status() {
  await connection();
  const today = todayIST();
  const v = await getStatusView(today);
  const r = v.latestReport;

  return (
    <div className="status-grid">
      <section className="card" aria-labelledby="live-title">
        <h2 id="live-title" className="card-title" style={{ marginBottom: "var(--space-3)" }}>
          Live source check
        </h2>
        <SourceCheck />
      </section>

      <section className="card" aria-labelledby="nav-title">
        <h2 id="nav-title" className="card-title" style={{ marginBottom: "var(--space-3)" }}>
          Latest NAV per fund
        </h2>
        <div className="table-scroll">
          <table className="status-table">
            <thead>
              <tr>
                <th scope="col">Fund</th>
                <th scope="col">Latest NAV date</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {v.funds.map((f) => (
                <tr key={f.schemeCode}>
                  <td>
                    {f.shortName} <span className="faint">({f.schemeCode})</span>
                  </td>
                  <td className="num">{f.lastNavDate ? formatDisplayDate(f.lastNavDate) : "—"}</td>
                  <td>
                    <span className={`health ${f.health}`}>{HEALTH_WORD[f.health]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ marginTop: "var(--space-2)" }}>
          NAVs are published on business days after markets close, so a Friday date is normal over a weekend.
        </p>
      </section>

      <section className="card" aria-labelledby="bench-title">
        <h2 id="bench-title" className="card-title" style={{ marginBottom: "var(--space-3)" }}>
          Benchmarks used this week
        </h2>
        <ul className="plain-list">
          {v.benchmarkUsage.map((b) => (
            <li key={b.shortName}>
              <strong>{b.shortName}</strong>: {b.label ?? "no benchmark, compared with similar funds"}
              {b.usedFallback ? " (fallback: Yahoo index level)" : b.label ? " (index-fund stand-in, close to total return)" : ""}
              {b.note && <span className="faint"> {b.note}</span>}
            </li>
          ))}
        </ul>
        <div className="table-scroll" style={{ marginTop: "var(--space-3)" }}>
          <table className="status-table">
            <thead>
              <tr>
                <th scope="col">Series</th>
                <th scope="col">Source</th>
                <th scope="col">Latest</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {v.benchmarks.map((b) => (
                <tr key={b.key}>
                  <td>{b.label}</td>
                  <td>
                    {b.sourceType === "mf_proxy" ? "Index fund via mfapi.in" : "Yahoo Finance"}
                    <span className="faint"> · {b.sourceName}</span>
                  </td>
                  <td className="num">{b.lastDate ? formatDisplayDate(b.lastDate) : "—"}</td>
                  <td>
                    <span className={`health ${b.health}`}>{HEALTH_WORD[b.health]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="ai-title">
        <h2 id="ai-title" className="card-title" style={{ marginBottom: "var(--space-3)" }}>
          News and Gemini
        </h2>
        <ul className="plain-list">
          <li>News provider: {v.newsProvider ?? "not fetched yet"} ({v.headlineCount} headlines kept this week)</li>
          <li>Gemini model: {v.geminiModel}</li>
          {r && (
            <li>
              Latest report (week ending {formatDisplayDate(r.weekEnding)}): {r.writtenBy === "gemini" ? `written by ${r.model}` : "written without AI"}, {r.tokensIn ?? 0} tokens in / {r.tokensOut ?? 0} out, {((r.latencyMs ?? 0) / 1000).toFixed(1)} s, {r.retries} {r.retries === 1 ? "retry" : "retries"}, generated {ist(r.generatedAt)} IST
            </li>
          )}
        </ul>
      </section>

      <section className="card" aria-labelledby="jobs-title">
        <h2 id="jobs-title" className="card-title" style={{ marginBottom: "var(--space-3)" }}>
          Recent job runs
        </h2>
        <div className="table-scroll">
          <table className="status-table">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Started (IST)</th>
                <th scope="col">Took</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {v.jobs.map((j) => (
                <tr key={j.id}>
                  <td>{JOB_LABEL[j.jobName] ?? j.jobName}</td>
                  <td className="num">{ist(j.startedAt)}</td>
                  <td className="num">{j.durationMs !== null ? `${(j.durationMs / 1000).toFixed(1)} s` : "—"}</td>
                  <td>
                    <span className={`health ${j.status === "success" ? "ok" : j.status === "partial" || j.status === "running" ? "stale" : "error"}`}>
                      {j.status === "success" ? "Success" : j.status === "partial" ? "Done with warnings" : j.status === "running" ? "Running" : "Failed"}
                    </span>
                    {(j.error || j.warnings.length > 0) && <div className="faint">{j.error ?? j.warnings.slice(0, 2).join(" · ")}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ marginTop: "var(--space-2)" }}>
          Scheduled on Vercel: daily NAV update at 18:00 UTC (11:30 PM IST) and the Saturday report at 01:30 UTC (7:00 AM IST). Vercel may start a job anywhere within that hour.
        </p>
      </section>
    </div>
  );
}
