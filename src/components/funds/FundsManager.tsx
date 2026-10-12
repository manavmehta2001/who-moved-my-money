"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";
import { PasscodeForm } from "@/components/admin/PasscodeForm";
import { Term } from "@/components/glossary/Glossary";

export type FundRow = {
  schemeCode: string;
  name: string;
  categoryLabel: string;
  benchmarkLabel: string | null;
  lastNavDate: string | null;
  monthlySip: number | null;
  unitsHeld: number | null;
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

function prettyDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function FundsManager({ initial, removed, benchmarks, isAdmin }: { initial: FundRow[]; removed: Array<{ schemeCode: string; name: string }>; benchmarks: Array<{ key: string; label: string }>; isAdmin: boolean }) {
  const router = useRouter();
  const [admin, setAdmin] = useState(isAdmin);
  const [removedLocally, setRemovedLocally] = useState<Set<string>>(() => new Set());
  const rows = initial.filter((r) => !removedLocally.has(r.schemeCode));
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

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
    const el = listRef.current?.querySelector<HTMLElement>(`[data-code="${code}"]`);
    const res = await fetch(`/api/funds/${code}`, { method: "DELETE" });
    if (res.status === 401) {
      setAdmin(false);
      return;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setListError(body.error ?? "Couldn't remove that fund.");
      return;
    }
    const finish = () => {
      setRemovedLocally((prev) => new Set(prev).add(code));
      router.refresh();
    };
    // …and a removed row collapses.
    if (el && window.matchMedia(MOTION_OK).matches) gsap.to(el, { height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, duration: 0.35, ease: "power2.inOut", onComplete: finish });
    else finish();
  }

  return (
    <>
      <section aria-labelledby="list-title">
        <h2 id="list-title" style={{ fontSize: "var(--step-2)" }}>
          Your funds ({rows.length})
        </h2>
        {listError && (
          <p className="alert" role="alert">
            {listError}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="muted" style={{ marginTop: "var(--space-3)" }}>
            No funds yet. Add one below with its scheme code.
          </p>
        ) : (
          <ul className="fund-list" ref={listRef}>
            {rows.map((f) => (
              <li key={f.schemeCode} className="fund-row" data-code={f.schemeCode}>
                <div>
                  <strong>{f.name}</strong>
                  <div className="meta">
                    {f.schemeCode} · {f.categoryLabel} · <Term t="benchmark" />: {f.benchmarkLabel ?? "none, compared with similar funds"} · latest <Term t="NAV" /> {prettyDate(f.lastNavDate)}
                    {f.monthlySip ? ` · SIP ₹${f.monthlySip.toLocaleString("en-IN")}/month` : ""}
                    {f.unitsHeld ? ` · ${f.unitsHeld.toLocaleString("en-IN")} units` : ""}
                  </div>
                </div>
                {admin && (
                  <button type="button" className="button quiet" onClick={() => remove(f.schemeCode, f.name)} aria-label={`Remove ${f.name}`}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="add-title">
        <h2 id="add-title" style={{ fontSize: "var(--step-2)" }}>
          Add a fund
        </h2>
        {admin ? (
          <AddFundForm
            benchmarks={benchmarks}
            removed={removed}
            onAdded={(code) => {
              setJustAdded(code);
              router.refresh();
            }}
            onUnauthorized={() => setAdmin(false)}
          />
        ) : (
          <PasscodeForm intro="Adding or removing funds needs the admin passcode. Viewing is open to everyone." onSuccess={() => setAdmin(true)} />
        )}
      </section>

      <SchemeSearch />
    </>
  );
}

function AddFundForm({ benchmarks, removed, onAdded, onUnauthorized }: { benchmarks: Array<{ key: string; label: string }>; removed: Array<{ schemeCode: string; name: string }>; onAdded: (code: string) => void; onUnauthorized: () => void }) {
  const id = useId();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "error">("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [alreadyAdded, setAlreadyAdded] = useState(false);
  const [benchmark, setBenchmark] = useState<string>("");
  const [sip, setSip] = useState("");
  const [units, setUnits] = useState("");
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
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schemeCode: preview.schemeCode, benchmarkKey: benchmark === NO_BENCHMARK ? null : benchmark, monthlySip: num(sip), unitsHeld: num(units) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; backfill?: { snapshotRows?: number } };
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Couldn't add that fund.");
      setResult({ ok: true, text: `Added ${preview.name}. ${body.backfill?.snapshotRows ? `${body.backfill.snapshotRows} weeks of history are ready; it will appear in the next check-in.` : "Its history will be filled in on Saturday."}` });
      onAdded(preview.schemeCode);
      setCode("");
      setPreview(null);
      setSip("");
      setUnits("");
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Couldn't add that fund." });
    } finally {
      setSubmitting(false);
    }
  }

  const sipInvalid = sip.trim() !== "" && !(Number(sip) > 0);
  const unitsInvalid = units.trim() !== "" && !(Number(units) > 0);

  return (
    <form onSubmit={submit} className="form-row" noValidate>
      <div className="field">
        <label htmlFor={`${id}-code`}>Scheme code</label>
        <span className="hint" id={`${id}-code-hint`}>
          The number AMFI gives each fund plan. Don&rsquo;t know it? Use &ldquo;Find a scheme code&rdquo; below.
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
              Compare with (<Term t="benchmark" />)
            </label>
            <span className="hint" id={`${id}-bench-hint`}>
              Suggested from its category: {preview.suggestedBenchmarkLabel ?? "no public benchmark, so similar funds only"}.
            </span>
            <select id={`${id}-bench`} value={benchmark} onChange={(e) => setBenchmark(e.target.value)} aria-describedby={`${id}-bench-hint`}>
              {benchmarks.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                  {b.key === preview.suggestedBenchmark ? " (suggested)" : ""}
                </option>
              ))}
              <option value={NO_BENCHMARK}>No benchmark: compare with similar funds only</option>
            </select>
          </div>
          <div className="form-row two">
            <div className="field">
              <label htmlFor={`${id}-sip`}>
                Monthly <Term t="SIP" /> in ₹ (optional)
              </label>
              <input id={`${id}-sip`} type="number" inputMode="decimal" min="1" step="any" value={sip} onChange={(e) => setSip(e.target.value)} aria-invalid={sipInvalid || undefined} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-units`}>Units held (optional)</label>
              <input id={`${id}-units`} type="number" inputMode="decimal" min="0" step="any" value={units} onChange={(e) => setUnits(e.target.value)} aria-invalid={unitsInvalid || undefined} />
            </div>
          </div>
          <p className="faint">With SIP amounts and units for every fund, the check-in also tells you if your money has drifted away from the split your SIPs aim for.</p>
          <div>
            <button className="button" type="submit" disabled={submitting || sipInvalid || unitsInvalid}>
              {submitting ? "Adding and fetching its history…" : "Add fund"}
            </button>
          </div>
        </>
      )}

      {result && (
        <p className={result.ok ? "alert info" : "alert"} role={result.ok ? "status" : "alert"}>
          {result.text}
        </p>
      )}
    </form>
  );
}

function SchemeSearch() {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ schemeCode: string; schemeName: string }>>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
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
      setResults(body.results ?? []);
      setMessage(body.results?.length ? `${body.results.length} matches. Pick the "Direct Plan - Growth" one if you can.` : "No matches. Try fewer words, like the fund house and type.");
      setState("idle");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Search failed.");
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage(`Copied ${code}. Paste it into the scheme code box above.`);
    } catch {
      setMessage(`The code is ${code}.`);
    }
  }

  return (
    <section className="panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: "var(--step-1)" }}>
        Find a scheme code
      </h2>
      <form onSubmit={search} className="form-row" role="search">
        <div className="field">
          <label htmlFor={`${id}-q`}>Fund name</label>
          <input id={`${id}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Parag Parikh Flexi Cap Direct" />
        </div>
        <div>
          <button className="button secondary" type="submit" disabled={state === "loading"}>
            {state === "loading" ? "Searching…" : "Search"}
          </button>
        </div>
      </form>
      <p role="status" aria-live="polite" className={state === "error" ? "alert" : "faint"}>
        {message}
      </p>
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.schemeCode}>
              <button type="button" onClick={() => copy(r.schemeCode)}>
                <span className="num">
                  <strong>{r.schemeCode}</strong>
                </span>{" "}
                {r.schemeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
