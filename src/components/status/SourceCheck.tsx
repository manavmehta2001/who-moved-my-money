"use client";

import { useState } from "react";

type Check = { source: string; ok: boolean; ms: number; detail: string };

export function SourceCheck() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/status/check");
      const body = (await res.json()) as { checks?: Check[]; error?: string };
      if (!res.ok || !body.checks) throw new Error(body.error ?? "The check didn't complete.");
      setChecks(body.checks);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check didn't complete.");
      setState("error");
    }
  }

  const healthy = checks.filter((c) => c.ok).length;

  return (
    <div className="form-row">
      <div>
        <button type="button" className="button secondary" onClick={run} disabled={state === "loading"}>
          {state === "loading" ? "Checking every source…" : "Check all sources now"}
        </button>
      </div>
      <p role="status" aria-live="polite" className={state === "error" ? "alert" : "muted"}>
        {state === "done" ? `${healthy} of ${checks.length} sources responded.` : error}
      </p>
      {checks.length > 0 && (
        <div className="table-scroll">
          <table className="status-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.source}>
                  <th scope="row" style={{ fontWeight: 400 }}>
                    {c.source}
                  </th>
                  <td>
                    <span className={`health ${c.ok ? "ok" : "down"}`}>{c.ok ? "Healthy" : "Failing"}</span>
                  </td>
                  <td>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
