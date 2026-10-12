import type { CheckinView, FundCard, PortfolioSummary } from "@/lib/data/views";
import type { Headline, IndexMove } from "@/db/types";
import { formatDisplayDate } from "@/lib/dates";
import { inr, signedInr } from "@/lib/format";
import { dominantDriver } from "@/lib/engine/decomposition";
import { Term, GlossaryText } from "@/components/glossary/Glossary";
import { Pct } from "@/components/checkin/Pct";
import { WorryDial } from "@/components/checkin/WorryDial";
import { ShareButtons } from "@/components/checkin/ShareButtons";
import { SheetTrigger } from "./Sheet";
import { AmountToggle } from "./AmountToggle";
import { HoldingsTable, type HoldingRow } from "./HoldingsTable";

const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];

const shortDate = (iso: string) => formatDisplayDate(iso).replace(/ \d{4}$/, "");

/* ---------- Portfolio value ---------- */

function ValueChart({ history }: { history: PortfolioSummary["history"] }) {
  if (history.length < 2) return null;
  const W = 600;
  const H = 120;
  const vals = history.map((h) => h.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo || hi * 0.01) * 0.15;
  lo -= pad;
  hi += pad;
  const x = (i: number) => (i / (history.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(h.value).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const first = history[0];
  const last = history.at(-1)!;
  const change = last.value / first.value - 1;
  return (
    <figure className="value-chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Portfolio value over ${history.length} weeks at today's holdings: from ${inr(first.value)} to ${inr(last.value)}, ${(change * 100).toFixed(2)}%.`}>
        <path className="value-area" d={area} data-anim="value-area" />
        <path className="value-line" d={line} data-anim="value-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="value-axis">
        <span>{shortDate(first.weekEnding)}</span>
        <span>Value at today&rsquo;s holdings · {history.length} weeks</span>
        <span>{shortDate(last.weekEnding)}</span>
      </figcaption>
    </figure>
  );
}

const compactInr = (x: number) =>
  x >= 1e7 ? `₹${(x / 1e7).toFixed(2)}Cr` : x >= 1e5 ? `₹${(x / 1e5).toFixed(2)}L` : inr(x);

export function PortfolioCard({ p, weekEnding }: { p: PortfolioSummary; weekEnding: string }) {
  return (
    <section className="card hero" aria-labelledby="pf-title">
      <div className="hero-head">
        <h2 id="pf-title" className="hero-label">
          My portfolio <AmountToggle />
        </h2>
        {p.sample && (
          <span className="hero-pill" title="Units and invested amounts come from replaying Meera's monthly SIPs since January 2024 at real NAVs. Edit them on My Funds.">
            Sample holdings
          </span>
        )}
      </div>
      <p className="hero-value num amount" title={inr(p.value)}>
        {compactInr(p.value)}
        <span className="sr-only"> ({inr(p.value)})</span>
      </p>
      <p className="hero-sub">
        Current value · NAVs as of {formatDisplayDate(p.valueAsOf)}
      </p>
      <div className="hero-stats">
        <div>
          <span>Invested</span>
          <strong className="num amount">{inr(p.invested)}</strong>
        </div>
        <div>
          <span>Total returns</span>
          <strong className="num">
            <span className="amount">{signedInr(p.gain)}</span> <Pct value={p.gainPct} />
          </strong>
        </div>
        <div>
          <span>This week</span>
          <strong className="num">
            <span className="amount">{signedInr(p.weekChange)}</span> <Pct value={p.weekChangePct} />
          </strong>
          <small>to {shortDate(weekEnding)}</small>
        </div>
        <div>
          <span>Funds</span>
          <strong className="num">{p.allocation.length}</strong>
        </div>
      </div>
      <ValueChart history={p.history} />
    </section>
  );
}

/* ---------- Verdict ---------- */

export function VerdictCard({ view }: { view: CheckinView }) {
  const r = view.report;
  const watched = view.funds.filter((f) => f.flagged);
  return (
    <section className="card verdict-card" aria-labelledby="verdict-title">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2 id="verdict-title" className="card-title">
          Portfolio health
        </h2>
        <span className="card-sub">Week to {shortDate(r.weekEnding)}</span>
      </div>
      <p className="verdict-sentence" data-anim="verdict">
        <span className="verdict-chip">{r.verdict}</span>
      </p>
      {watched.length > 0 && (
        <p style={{ marginTop: "var(--space-2)", fontWeight: 600 }}>
          {watched.map((f, i) => (
            <span key={f.schemeCode}>
              {i > 0 && ", "}
              <SheetTrigger id={f.schemeCode} className="term">
                {f.shortName}
              </SheetTrigger>
            </span>
          ))}
        </p>
      )}
      <p className="verdict-reason">
        <GlossaryText text={r.verdictReason} extraTerms={r.content.jargonUsed} skip={view.funds.map((f) => f.shortName)} />
      </p>
      <WorryDial score={r.worryScore} />
    </section>
  );
}

/* ---------- Holdings ---------- */

const DRIVER_SHORT = { market: "Market", similar_funds: "Category", fund_choices: "Fund" } as const;


const MULTI_WORD_AMC = ["Nippon India", "Aditya Birla Sun Life", "Motilal Oswal", "Parag Parikh", "ICICI Prudential", "Kotak Mahindra", "Mirae Asset", "Franklin Templeton", "Franklin India", "Bank of India", "Canara Robeco", "Union", "Quant", "PGIM India", "Baroda BNP Paribas", "Mahindra Manulife", "White Oak", "Invesco India", "LIC MF", "Aditya Birla"];

function amcOf(name: string): string {
  const hit = MULTI_WORD_AMC.find((a) => name.toLowerCase().startsWith(a.toLowerCase()));
  return hit ?? name.split(/\s+/)[0];
}

function groupOf(f: FundCard): HoldingRow["group"] {
  if (/overseas|international|fof.*(us|global)|nasdaq|s&p/i.test(`${f.categoryLabel} ${f.name}`)) return "international";
  if (f.isDebt) return "debt";
  if (/equity|index/i.test(f.categoryLabel)) return "equity";
  return "other";
}

export function HoldingsCard({ funds }: { funds: FundCard[] }) {
  const rows: HoldingRow[] = funds.map((f) => {
    const s = f.latest;
    const d = dominantDriver({ market: s.market1w, similarFunds: s.similarFunds1w, fundChoices: s.fundChoices1w });
    return {
      code: f.schemeCode,
      shortName: f.shortName,
      amc: amcOf(f.name),
      category: f.categoryLabel.replace(/^(Equity|Debt|Hybrid): /, ""),
      group: groupOf(f),
      flagged: f.flagged,
      value: f.holdings.value,
      gainPct: f.holdings.gainPct,
      weekChange: f.holdings.weekChange,
      ret1w: s.fundRet1w,
      ret1m: s.fundRet1m,
      retYtd: s.fundRetYtd,
      gap1w: s.fundRet1w !== null && s.catRet1w !== null ? s.fundRet1w - s.catRet1w : null,
      driver: d ? DRIVER_SHORT[d] : null,
    };
  });
  return (
    <section className="card" aria-labelledby="holdings-title">
      <div className="card-head">
        <h2 id="holdings-title" className="card-title">
          Holdings
        </h2>
        <span className="card-sub">Tap a fund for the full analysis</span>
      </div>
      <HoldingsTable rows={rows} />
    </section>
  );
}

/* ---------- Allocation donut ---------- */

export function AllocationCard({ p }: { p: PortfolioSummary }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const offsets = p.allocation.map((_, i) => p.allocation.slice(0, i).reduce((a, x) => a + x.weight * C, 0));
  const maxDrift = Math.max(0, ...p.allocation.map((a) => (a.targetWeight === null ? 0 : Math.abs(a.weight - a.targetWeight))));
  return (
    <section className="card" aria-labelledby="alloc-title">
      <div className="card-head">
        <h2 id="alloc-title" className="card-title">
          <Term t="allocation">Allocation</Term>
        </h2>
        <span className="card-sub">By current value</span>
      </div>
      <div className="alloc">
        <div className="donut">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-sunk)" strokeWidth="14" />
            {p.allocation.map((a, i) => {
              const len = a.weight * C;
              return (
                <circle
                  key={a.schemeCode}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={SERIES[i % SERIES.length]}
                  strokeWidth="14"
                  strokeDasharray={`${Math.max(len - 0.8, 0.1)} ${C}`}
                  strokeDashoffset={-offsets[i]}
                  data-anim="donut"
                />
              );
            })}
          </svg>
          <div className="donut-center">
            <span className="faint">Total</span>
            <strong className="num">{inr(p.value)}</strong>
          </div>
        </div>
        <ul className="legend">
          {p.allocation.map((a, i) => (
            <li key={a.schemeCode}>
              <span className="swatch" style={{ background: SERIES[i % SERIES.length] }} aria-hidden="true" />
              <span>{a.shortName}</span>
              <span className="num" style={{ fontWeight: 650 }}>
                {(a.weight * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
      {p.allocation.every((a) => a.targetWeight !== null) && (
        <p className="faint" style={{ marginTop: "var(--space-3)" }}>
          Largest gap from the SIP-implied target: <span className="num">{(maxDrift * 100).toFixed(1)} pp</span> ({maxDrift > 0.1 ? "above" : "within"} the 10 pp review threshold).
        </p>
      )}
    </section>
  );
}

/* ---------- Analyst note ---------- */

export function NoteCard({ view, shareText }: { view: CheckinView; shareText: string }) {
  const r = view.report;
  return (
    <section className="card" aria-labelledby="note-title">
      <div className="card-head">
        <h2 id="note-title" className="card-title">
          Weekly analyst note
        </h2>
        <span className="badge">{r.writtenBy === "gemini" ? `AI-written · fact-checked` : "Written without AI this week"}</span>
      </div>
      <p className="note-headline">{r.content.headline}</p>
      <ul className="note-list">
        {view.funds.map((f) => (
          <li key={f.schemeCode} className={f.flagged ? "flagged" : undefined}>
            <span>
              <SheetTrigger id={f.schemeCode} className="term">
                <strong>{f.shortName}</strong>
              </SheetTrigger>
            </span>
            <span>{f.summary.split(/(?<=[.!?])\s+(?=[A-Z])/)[0]}</span>
          </li>
        ))}
      </ul>
      <ShareButtons text={shareText} />
    </section>
  );
}

/* ---------- Market ---------- */

export function MarketCard({ moves, headlines, cited, provider }: { moves: IndexMove[]; headlines: Headline[]; cited: Set<string>; provider: string | null }) {
  const ordered = [...headlines].sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id))).slice(0, 6);
  return (
    <section className="card" aria-labelledby="market-title">
      <div className="card-head">
        <h2 id="market-title" className="card-title">
          Markets this week
        </h2>
        {provider && <span className="card-sub">{provider}</span>}
      </div>
      {moves.length > 0 && (
        <ul className="strip">
          {moves.map((m) => (
            <li key={m.key}>
              <span className="index-name">{m.label.replace("Nifty ", "")}</span>
              <span className="index-move">
                <Pct value={m.weekReturn} title={`${m.label} · ${m.source === "yahoo" ? `Yahoo Finance ${m.sourceRef}` : `Index fund ${m.sourceRef}`}${m.asOf ? `, as of ${formatDisplayDate(m.asOf)}` : ""}`} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {ordered.length > 0 ? (
        <ul className="headlines">
          {ordered.map((h) => (
            <li key={h.id}>
              <a href={h.url} target="_blank" rel="noopener noreferrer" className={cited.has(h.id) ? "cited" : undefined}>
                {h.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <span className="faint">
                {h.source} · {shortDate(h.publishedAt.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No market headlines were found for this week.</p>
      )}
    </section>
  );
}
