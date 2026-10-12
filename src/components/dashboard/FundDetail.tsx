import type { FundCard } from "@/lib/data/views";
import { formatDisplayDate } from "@/lib/dates";
import { inr, signedInr } from "@/lib/format";
import { GlossaryText, Term } from "@/components/glossary/Glossary";
import { Gap, Pct } from "@/components/checkin/Pct";
import { Sparkline } from "@/components/checkin/Sparkline";
import { Waterfall } from "@/components/checkin/Waterfall";

function benchmarkSource(f: FundCard): string {
  const b = f.latest.provenance.benchmark;
  if (!b) return f.latest.provenance.benchmarkNote ?? "No benchmark.";
  const kind = b.sourceType === "mf_proxy" ? "index fund used as a stand-in, includes dividends (close to the total return index)" : "index level from Yahoo Finance, price only";
  return `${b.label}: ${b.sourceName ?? b.sourceRef} (${kind})${b.asOf ? `, as of ${formatDisplayDate(b.asOf)}` : ""}.`;
}

/** Everything about one fund, shown in its side sheet. */
export function FundDetail({ f, jargon }: { f: FundCard; jargon: string[] }) {
  const s = f.latest;
  const p = s.provenance;
  const h = f.holdings;
  const navAsOf = formatDisplayDate(s.navDate);
  const fundTip = `NAV ₹${s.nav.toFixed(4)} as of ${navAsOf} · mfapi.in / AMFI`;
  const benchTip = p.benchmark
    ? `${p.benchmark.label} as of ${p.benchmark.asOf ? formatDisplayDate(p.benchmark.asOf) : "—"} · ${p.benchmark.sourceType === "mf_proxy" ? `index fund ${p.benchmark.sourceRef} via mfapi.in` : `Yahoo Finance ${p.benchmark.sourceRef}`}`
    : (p.benchmarkNote ?? "No public benchmark for this fund");
  const catTip = `Average of ${p.peerCount1w} similar funds (${p.peerGroup}) as of ${navAsOf} · AMFI + mfapi.in`;
  const mode = s.market1w === null ? (s.similarFunds1w === null ? "fund_only" : "no_benchmark") : s.similarFunds1w === null ? "no_category" : "three_part";
  const compare = f.benchmarkLabel ? { label: f.benchmarkLabel, key: "benchRet1w" as const } : { label: "Category average", key: "catRet1w" as const };

  return (
    <>
      {h.value !== null && (
        <div className="sheet-stats">
          <div className="kpi">
            <span className="faint">Current value</span>
            <strong>{inr(h.value)}</strong>
          </div>
          <div className="kpi">
            <span className="faint">Invested</span>
            <strong>{h.invested ? inr(h.invested) : "—"}</strong>
          </div>
          <div className="kpi">
            <span className="faint">Total returns</span>
            <strong className={h.gain !== null && h.gain >= 0 ? "up" : "down"}>{h.gain !== null ? signedInr(h.gain) : "—"}</strong>
            {h.gainPct !== null && <Pct value={h.gainPct} className="cell-sub" />}
          </div>
        </div>
      )}

      {f.flagged && (
        <div className="flag-note">
          <strong>Worth watching. </strong>
          {s.flags.map((fl) => fl.reason).join(" ")}
        </div>
      )}

      <section>
        <h3 className="sheet-section-title">Analyst note</h3>
        <p className="summary">
          <GlossaryText text={f.summary} extraTerms={jargon} skip={[f.shortName]} />
        </p>
      </section>

      <Waterfall market={s.market1w} similar={s.similarFunds1w} choices={s.fundChoices1w} fund={s.fundRet1w} mode={mode} benchmarkLabel={f.benchmarkLabel} peerCount={p.peerCount1w} />

      <Sparkline weeks={f.history.map((w) => ({ weekEnding: w.weekEnding, fund: w.fundRet1w, compare: w[compare.key] }))} compareLabel={compare.label} />

      <div className="table-scroll">
        <table className="returns">
          <caption>Returns</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Series</span>
              </th>
              <th scope="col">1W</th>
              <th scope="col">1M</th>
              <th scope="col">
                <Term t="YTD" />
                {p.ytdFromInception ? "*" : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">This fund</th>
              <td><Pct value={s.fundRet1w} title={fundTip} /></td>
              <td><Pct value={s.fundRet1m} title={fundTip} /></td>
              <td><Pct value={s.fundRetYtd} title={fundTip} /></td>
            </tr>
            <tr>
              <th scope="row">{f.benchmarkLabel ? <Term t="benchmark">{f.benchmarkLabel}</Term> : "Benchmark"}</th>
              <td><Pct value={s.benchRet1w} title={benchTip} /></td>
              <td><Pct value={s.benchRet1m} title={benchTip} /></td>
              <td><Pct value={s.benchRetYtd} title={benchTip} /></td>
            </tr>
            <tr>
              <th scope="row">
                <Term t="category average">Category avg</Term> <span className="faint">({p.peerCount1w})</span>
              </th>
              <td><Pct value={s.catRet1w} title={catTip} /></td>
              <td><Pct value={s.catRet1m} title={catTip} /></td>
              <td><Pct value={s.catRetYtd} title={catTip} /></td>
            </tr>
            <tr>
              <th scope="row" className="faint">vs category</th>
              <td><Gap value={s.fundRet1w !== null && s.catRet1w !== null ? s.fundRet1w - s.catRet1w : null} /></td>
              <td><Gap value={s.fundRet1m !== null && s.catRet1m !== null ? s.fundRet1m - s.catRet1m : null} /></td>
              <td><Gap value={s.fundRetYtd !== null && s.catRetYtd !== null ? s.fundRetYtd - s.catRetYtd : null} /></td>
            </tr>
          </tbody>
        </table>
        {p.ytdFromInception && <p className="faint">* Since launch on {p.ytdStartDate ? formatDisplayDate(p.ytdStartDate) : "—"}, not since January.</p>}
      </div>

      <details className="provenance">
        <summary>Data sources</summary>
        <ul>
          <li>
            <Term t="NAV" /> ₹{s.nav.toFixed(4)} as of {navAsOf}, from mfapi.in and AMFI.
          </li>
          {h.units !== null && (
            <li>
              {h.units.toLocaleString("en-IN")} units × latest NAV ₹{h.latestNav.toFixed(4)} ({formatDisplayDate(h.latestNavDate)}).
              {h.sample ? ` Sample holdings: a ₹${h.monthlySip?.toLocaleString("en-IN")} monthly SIP since January 2024, replayed at real NAVs.` : ""}
            </li>
          )}
          <li>{benchmarkSource(f)}</li>
          {p.benchmarkNote && p.benchmark && <li>{p.benchmarkNote}</li>}
          <li>Category average: {p.peerCount1w} funds ({p.peerGroup}), direct growth plans, from AMFI.</li>
          <li>Simple returns: 1W is Friday to Friday; 1M is from the same date last month; YTD is from the last NAV of last year.</li>
        </ul>
      </details>
    </>
  );
}
