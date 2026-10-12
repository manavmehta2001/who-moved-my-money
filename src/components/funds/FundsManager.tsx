"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";
import { useAdmin } from "@/components/admin/AdminProvider";
import { Term } from "@/components/glossary/Glossary";

export type FundRow = {
  schemeCode: string;
  name: string;
  categoryLabel: string;
  benchmarkLabel: string | null;
  lastNavDate: string | null;
  monthlySip: number | null;
  unitsHeld: number | null;
  investedAmount: number | null;
  holdingsSample: boolean;
};

type Preview = {
  schemeCode: string;
  name: string;
  amc: string;
  categoryLabel: string;
  peerGroup: string;
  suggestedBenchmark: string | null;
  suggestedBenchmarkLabel: string | null;
  latestNav: number;
  latestNavDate: string;
  historyStart: string;
  warnings: string[];
};

const NO_BENCHMARK = "__none__";
const rupees = (x: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(x);

function prettyDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const AVATAR = ["#21305e", "#0b8048", "#b45309", "#6941c6", "#c2410c", "#0369a1"];
function avatarColour(name: string) {
  let h = 0;
  for (const c of name.split(/\s+/)[0]) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}
function initialsOf(name: string) {
  const w = name.split(/\s+/);
  return (/^[A-Z]{2,}$/.test(w[0]) ? w[0].slice(0, 2) : w[0][0] + (w[1]?.[0] ?? "")).toUpperCase();
}

const invalidAmount = (v: string) => v.trim() !== "" && !(Number(v) > 0);

export function FundsManager({ initial, removed, benchmarks, search }: { search?: string; initial: FundRow[]; removed: Array<{ schemeCode: string; name: string }>; benchmarks: Array<{ key: string; label: string }> }) {
  const router = useRouter();
  const { adminFetch } = useAdmin();
  const [removedLocally, setRemovedLocally] = useState<Set<string>>(() => new Set());
  const rows = initial.filter((r) => !removedLocally.has(r.schemeCode));
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FundRow | null>(null);
  const listRef = useRef<HTMLTableSectionElement>(null);

  // Responsive motion for user actions only: a new row slides in.
  useGSAP(
    () => {
      if (!justAdded || !window.matchMedia(MOTION_OK).matches) return;
      const el = listRef.current?.querySelector(`[data-code="${justAdded}"]`);
      if (el) gsap.from(el, { y: -12, opacity: 0, duration: 0.45, ease: "power3.out" });
    },
    { dependencies: [justAdded, initial], scope: listRef },
  );

  async function remove(code: string, name: string) {
    if (!window.confirm(`Remove ${name}? Its history is kept and you can add it back later.`)) return;
    setListError(null);
    const res = await adminFetch(`/api/funds/${code}`, { method: "DELETE" });
    if (res.status === 401) return;
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setListError(body.error ?? "Couldn't remove that fund.");
      return;
    }
    const el = listRef.current?.querySelector<HTMLElement>(`[data-code="${code}"]`);
    const finish = () => {
      setRemovedLocally((prev) => new Set(prev).add(code));
      router.refresh();
    };
    // …and a removed row collapses.
    if (el && window.matchMedia(MOTION_OK).matches) gsap.to(el, { height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0, duration: 0.35, ease: "power2.inOut", onComplete: finish });
    else finish();
  }

  return (
    <div className="funds-grid">
      <section className="card" aria-labelledby="list-title">
        <div className="card-head">
          <h2 id="list-title" className="card-title">
            Your funds <span className="faint">({rows.length})</span>
          </h2>
        </div>
        {listError && (
          <p className="alert" role="alert">
            {listError}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="muted">No funds yet. Add one with its scheme code.</p>
        ) : (
          <div className="table-scroll ind-table-wrap">
            <table className="ind-table">
              <caption className="sr-only">Funds in the weekly report, with holdings and actions</caption>
              <thead>
                <tr>
                  <th scope="col">Fund</th>
                  <th scope="col" className="hide-sm">
                    <Term t="benchmark">Benchmark</Term>
                  </th>
                  <th scope="col">Holdings</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={listRef}>
                {rows.map((f) => (
                  <tr key={f.schemeCode} data-code={f.schemeCode}>
                    <td>
                      <div className="fund-cell">
                        <span className="amc-logo" style={{ background: avatarColour(f.name) }} aria-hidden="true">
                          {initialsOf(f.name)}
                        </span>
                        <span className="fund-names">
                          <span className="amc-name">
                            <span className="num">{f.schemeCode}</span> · <Term t="NAV" /> {prettyDate(f.lastNavDate)}
                          </span>
                          <strong className="fund-name">{f.name}</strong>
                          <span className="fund-meta">
                            <span className="tag">{f.categoryLabel}</span>
                            {f.holdingsSample && <span className="tag brand">Sample</span>}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="hide-sm">{f.benchmarkLabel ?? <span className="faint">Category average only</span>}</td>
                    <td>
                      <span className="num strong">{f.monthlySip ? `${rupees(f.monthlySip)}/mo` : "No SIP"}</span>
                      <span className="cell-sub faint">
                        {f.investedAmount ? `${rupees(f.investedAmount)} invested` : f.unitsHeld ? `${f.unitsHeld.toLocaleString("en-IN")} units` : "No holdings set"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="button quiet small" onClick={() => setEditing(f)} aria-label={`Edit holdings for ${f.name}`}>
                          Edit
                        </button>
                        <button type="button" className="button quiet small" onClick={() => remove(f.schemeCode, f.name)} aria-label={`Remove ${f.name}`}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: "grid", gap: "var(--gap)", minWidth: 0 }}>
        <section className="card" aria-labelledby="add-title">
          <div className="card-head">
            <h2 id="add-title" className="card-title">
              Add a fund
            </h2>
          </div>
          <AddFundForm
            benchmarks={benchmarks}
            removed={removed}
            onAdded={(code) => {
              setJustAdded(code);
              router.refresh();
            }}
          />
        </section>
        <SchemeSearch key={search} initialQuery={search} />
      </div>

      <EditHoldings
        fund={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function EditHoldings({ fund, onClose, onSaved }: { fund: FundRow | null; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (fund && !d.open) d.showModal();
    if (!fund && d.open) d.close();
  }, [fund]);

  return (
    <dialog ref={ref} className="modal" aria-label={fund ? `Edit holdings for ${fund.name}` : "Edit holdings"} onClose={onClose}>
      {fund && <EditHoldingsForm key={fund.schemeCode} fund={fund} onCancel={() => ref.current?.close()} onSaved={onSaved} />}
    </dialog>
  );
}

function EditHoldingsForm({ fund, onCancel, onSaved }: { fund: FundRow; onCancel: () => void; onSaved: () => void }) {
  const id = useId();
  const { adminFetch } = useAdmin();
  const [sip, setSip] = useState(() => (fund.monthlySip ? String(fund.monthlySip) : ""));
  const [units, setUnits] = useState(() => (fund.unitsHeld ? String(fund.unitsHeld) : ""));
  const [invested, setInvested] = useState(() => (fund.investedAmount ? String(fund.investedAmount) : ""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/funds/${fund.schemeCode}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monthlySip: num(sip), unitsHeld: num(units), investedAmount: num(invested) }),
      });
      if (res.status === 401) return;
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't save.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const bad = invalidAmount(sip) || invalidAmount(units) || invalidAmount(invested);

  return (
    <form onSubmit={save} className="form-row" noValidate>
      <h2 className="card-title">Edit holdings</h2>
      <p className="faint">{fund.name}</p>
      <div className="field">
        <label htmlFor={`${id}-sip`}>
          Monthly <Term t="SIP" /> (₹)
        </label>
        <input id={`${id}-sip`} type="number" inputMode="decimal" min="1" step="any" value={sip} onChange={(e) => setSip(e.target.value)} aria-invalid={invalidAmount(sip) || undefined} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-units`}>Units held</label>
        <input id={`${id}-units`} type="number" inputMode="decimal" min="0" step="any" value={units} onChange={(e) => setUnits(e.target.value)} aria-invalid={invalidAmount(units) || undefined} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-inv`}>Amount invested (₹)</label>
        <input id={`${id}-inv`} type="number" inputMode="decimal" min="1" step="any" value={invested} onChange={(e) => setInvested(e.target.value)} aria-invalid={invalidAmount(invested) || undefined} />
      </div>
      {fund.holdingsSample && <p className="faint">These are sample numbers. Saving your own replaces them.</p>}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="button quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={busy || bad}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function AddFundForm({ benchmarks, removed, onAdded }: { benchmarks: Array<{ key: string; label: string }>; removed: Array<{ schemeCode: string; name: string }>; onAdded: (code: string) => void }) {
  const id = useId();
  const { adminFetch } = useAdmin();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "error">("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [alreadyAdded, setAlreadyAdded] = useState(false);
  const [benchmark, setBenchmark] = useState<string>("");
  const [sip, setSip] = useState("");
  const [units, setUnits] = useState("");
  const [invested, setInvested] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function changeCode(value: string) {
    setCode(value);
    setResult(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setPreview(null);
      setLookupState("idle");
      setLookupError(null);
    } else if (!/^\d+$/.test(trimmed)) {
      setPreview(null);
      setLookupState("error");
      setLookupError("Scheme codes are numbers only, like 118989.");
    } else {
      setLookupState("idle");
      setLookupError(null);
    }
  }

  // Live preview: look the code up shortly after typing stops.
  useEffect(() => {
    const trimmed = code.trim();
    if (!/^\d{3,}$/.test(trimmed)) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLookupState("loading");
      try {
        const res = await fetch(`/api/funds/lookup?code=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal });
        const body = (await res.json()) as { preview?: Preview; alreadyAdded?: boolean; error?: string };
        if (!res.ok || !body.preview) throw new Error(body.error ?? "Couldn't look that up.");
        setPreview(body.preview);
        setAlreadyAdded(!!body.alreadyAdded);
        setBenchmark(body.preview.suggestedBenchmark ?? NO_BENCHMARK);
        setLookupState("idle");
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setPreview(null);
        setLookupState("error");
        setLookupError(e instanceof Error ? e.message : "Couldn't look that up.");
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!preview || alreadyAdded) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await adminFetch("/api/funds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schemeCode: preview.schemeCode, benchmarkKey: benchmark === NO_BENCHMARK ? null : benchmark, monthlySip: num(sip), unitsHeld: num(units), investedAmount: num(invested) }),
      });
      if (res.status === 401) return;
      const body = (await res.json().catch(() => ({}))) as { error?: string; backfill?: { snapshotRows?: number } };
      if (!res.ok) throw new Error(body.error ?? "Couldn't add that fund.");
      setResult({ ok: true, text: `Added ${preview.name}. ${body.backfill?.snapshotRows ? `${body.backfill.snapshotRows} weeks of history are ready; it appears in the next report.` : "Its history will be filled in on Saturday."}` });
      onAdded(preview.schemeCode);
      setCode("");
      setPreview(null);
      setSip("");
      setUnits("");
      setInvested("");
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Couldn't add that fund." });
    } finally {
      setSubmitting(false);
    }
  }

  const bad = invalidAmount(sip) || invalidAmount(units) || invalidAmount(invested);

  return (
    <form onSubmit={submit} className="form-row" noValidate>
      <div className="field">
        <label htmlFor={`${id}-code`}>Scheme code</label>
        <span className="hint" id={`${id}-code-hint`}>
          The AMFI number of the fund plan. Unsure? Use &ldquo;Find a scheme code&rdquo;.
        </span>
        <input
          id={`${id}-code`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={code}
          onChange={(e) => changeCode(e.target.value)}
          aria-describedby={`${id}-code-hint ${id}-code-status`}
          aria-invalid={lookupState === "error" ? true : undefined}
          placeholder="e.g. 118989"
        />
        <p id={`${id}-code-status`} role="status" aria-live="polite" className={lookupState === "error" ? "alert" : "faint"}>
          {lookupState === "loading" ? "Looking it up…" : lookupState === "error" ? lookupError : ""}
        </p>
        {removed.length > 0 && !code && (
          <p className="faint">
            Removed earlier:{" "}
            {removed.map((r, i) => (
              <span key={r.schemeCode}>
                {i > 0 && ", "}
                <button type="button" className="term" onClick={() => changeCode(r.schemeCode)}>
                  {r.name}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>

      {preview && (
        <div className="preview" aria-live="polite">
          <strong>{preview.name}</strong>
          <dl>
            <dt>Fund house</dt>
            <dd>{preview.amc}</dd>
            <dt>Category</dt>
            <dd>{preview.categoryLabel}</dd>
            <dt>Compared with</dt>
            <dd>{preview.peerGroup}</dd>
            <dt>
              Latest <Term t="NAV" />
            </dt>
            <dd className="num">
              ₹{preview.latestNav.toLocaleString("en-IN", { maximumFractionDigits: 4 })} on {prettyDate(preview.latestNavDate)}
            </dd>
            <dt>History from</dt>
            <dd>{prettyDate(preview.historyStart)}</dd>
          </dl>
          {preview.warnings.map((w) => (
            <p key={w} className="alert warn">
              {w}
            </p>
          ))}
          {alreadyAdded && (
            <p className="alert" role="alert">
              This fund is already in your list.
            </p>
          )}
        </div>
      )}

      {preview && !alreadyAdded && (
        <>
          <div className="field">
            <label htmlFor={`${id}-bench`}>
              <Term t="benchmark">Benchmark</Term>
            </label>
            <span className="hint" id={`${id}-bench-hint`}>
              Suggested from its category: {preview.suggestedBenchmarkLabel ?? "none (no public benchmark), category average only"}.
            </span>
            <select id={`${id}-bench`} value={benchmark} onChange={(e) => setBenchmark(e.target.value)} aria-describedby={`${id}-bench-hint`}>
              {benchmarks.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                  {b.key === preview.suggestedBenchmark ? " (suggested)" : ""}
                </option>
              ))}
              <option value={NO_BENCHMARK}>No benchmark: category average only</option>
            </select>
          </div>
          <div className="form-row three">
            <div className="field">
              <label htmlFor={`${id}-sip`}>
                <Term t="SIP" />/month (₹)
              </label>
              <input id={`${id}-sip`} type="number" inputMode="decimal" min="1" step="any" value={sip} onChange={(e) => setSip(e.target.value)} aria-invalid={invalidAmount(sip) || undefined} placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-units`}>Units held</label>
              <input id={`${id}-units`} type="number" inputMode="decimal" min="0" step="any" value={units} onChange={(e) => setUnits(e.target.value)} aria-invalid={invalidAmount(units) || undefined} placeholder="Optional" />
            </div>
            <div className="field">
              <label htmlFor={`${id}-inv`}>Invested (₹)</label>
              <input id={`${id}-inv`} type="number" inputMode="decimal" min="1" step="any" value={invested} onChange={(e) => setInvested(e.target.value)} aria-invalid={invalidAmount(invested) || undefined} placeholder="Optional" />
            </div>
          </div>
          <div>
            <button className="button" type="submit" disabled={submitting || bad}>
              {submitting ? "Adding and fetching history…" : "Add fund"}
            </button>
          </div>
        </>
      )}

      {result && (
        <p className={result.ok ? "alert ok" : "alert"} role={result.ok ? "status" : "alert"}>
          {result.text}
        </p>
      )}
    </form>
  );
}

function SchemeSearch({ initialQuery }: { initialQuery?: string }) {
  const id = useId();
  const [q, setQ] = useState(initialQuery ?? "");
  const [results, setResults] = useState<Array<{ schemeCode: string; schemeName: string }>>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 3) {
      setMessage("Type at least 3 letters of the fund's name.");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch(`/api/funds/lookup?q=${encodeURIComponent(q.trim())}`);
      const body = (await res.json()) as { results?: Array<{ schemeCode: string; schemeName: string }>; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Search failed.");
      setResults((body.results ?? []).slice(0, 8));
      setMessage(body.results?.length ? `${body.results.length} matches. Prefer the "Direct Plan - Growth" one.` : "No matches. Try fewer words.");
      setState("idle");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Search failed.");
    }
  }

  // Arriving from the top-bar search runs the search straight away.
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !initialQuery) return;
    ran.current = true;
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage(`Copied ${code}. Paste it into the scheme code box.`);
    } catch {
      setMessage(`The code is ${code}.`);
    }
  }

  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <h2 id={`${id}-title`} className="card-title">
          Find a scheme code
        </h2>
      </div>
      <form onSubmit={search} role="search" style={{ display: "flex", gap: "var(--space-2)" }}>
        <label htmlFor={`${id}-q`} className="sr-only">
          Fund name
        </label>
        <input id={`${id}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Parag Parikh Flexi Cap" />
        <button className="button secondary" type="submit" disabled={state === "loading"}>
          {state === "loading" ? "Searching…" : "Search"}
        </button>
      </form>
      <p role="status" aria-live="polite" className={state === "error" ? "alert" : "faint"} style={{ marginTop: "var(--space-2)" }}>
        {message}
      </p>
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.schemeCode}>
              <button type="button" onClick={() => copy(r.schemeCode)}>
                <strong className="num">{r.schemeCode}</strong> {r.schemeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
