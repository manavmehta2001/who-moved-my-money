import type { FundCard } from "@/lib/data/views";
import { formatDisplayDate } from "@/lib/dates";
import { GlossaryText, Term } from "@/components/glossary/Glossary";
import { Gap, Pct } from "./Pct";
import { Sparkline } from "./Sparkline";
import { Waterfall } from "./Waterfall";

function benchmarkSource(f: FundCard): string {
  const b = f.latest.provenance.benchmark;
  if (!b) return f.latest.provenance.benchmarkNote ?? "No benchmark.";
  const kind = b.sourceType === "mf_proxy" ? "index fund used as a stand-in, includes dividends (close to the total return index)" : "index level from Yahoo Finance, price only";
  return `${b.label}: ${b.sourceName ?? b.sourceRef} (${kind})${b.asOf ? `, as of ${formatDisplayDate(b.asOf)}` : ""}.`;
}

export function FundSection({ f, jargon, index }: { f: FundCard; jargon: string[]; index: number }) {
  const s = f.latest;
  const p = s.provenance;
  const navAsOf = formatDisplayDate(s.navDate);
  const fundTip = `NAV ₹${s.nav.toFixed(4)} as of ${navAsOf} · mfapi.in / AMFI`;
  const benchTip = p.benchmark
    ? `${p.benchmark.label} as of ${p.benchmark.asOf ? formatDisplayDate(p.benchmark.asOf) : "—"} · ${p.benchmark.sourceType === "mf_proxy" ? `index fund ${p.benchmark.sourceRef} via mfapi.in` : `Yahoo Finance ${p.benchmark.sourceRef}`}`
    : (p.benchmarkNote ?? "No public benchmark for this fund");
  const catTip = `Average of ${p.peerCount1w} similar funds (${p.peerGroup}) as of ${navAsOf} · AMFI + mfapi.in`;
  const mode = s.market1w === null ? (s.similarFunds1w === null ? "fund_only" : "no_benchmark") : s.similarFunds1w === null ? "no_category" : "three_part";
  const compare = f.benchmarkLabel ? { label: f.benchmarkLabel, key: "benchRet1w" as const } : { label: "Similar funds", key: "catRet1w" as const };

  return (
    <section className={`fund${f.flagged ? " flagged" : ""}`} aria-labelledby={`fund-${f.schemeCode}`} data-fund-index={index}>
      <header className="fund-head">
        <h2 className="fund-name" id={`fund-${f.schemeCode}`}>
          {f.shortName}
        </h2>
        <span className="fund-kind">{f.categoryLabel}</span>
        <span className="fund-week" style={{ marginLeft: "auto" }}>
          <Pct value={s.fundRet1w} title={fundTip} countUp />
          <span className="faint" style={{ fontFamily: "var(--font-body)", fontWeight: 400 }}>
            {" "}
            this week
          </span>
        </span>
      </header>

      {f.flagged && (
        <div className="flag-note">
          <strong>Worth watching. </strong>
          {s.flags.map((fl) => fl.reason).join(" ")}
        </div>
      )}

      <p className="summary">
        <GlossaryText text={f.summary} extraTerms={jargon} skip={[f.shortName]} />
      </p>

      <Waterfall market={s.market1w} similar={s.similarFunds1w} choices={s.fundChoices1w} fund={s.fundRet1w} mode={mode} benchmarkLabel={f.benchmarkLabel} peerCount={p.peerCount1w} />

      <div className="fund-detail">
        <Sparkline weeks={f.history.map((h) => ({ weekEnding: h.weekEnding, fund: h.fundRet1w, compare: h[compare.key] }))} compareLabel={compare.label} />
        <div className="table-scroll">
          <table className="returns">
            <caption>Returns</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Series</span>
                </th>
                <th scope="col">Week</th>
                <th scope="col">1 month</th>
                <th scope="col">
                  <Term t="YTD" />
                  {p.ytdFromInception ? "*" : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Your fund</th>
                <td><Pct value={s.fundRet1w} title={fundTip} /></td>
                <td><Pct value={s.fundRet1m} title={fundTip} /></td>
                <td><Pct value={s.fundRetYtd} title={fundTip} /></td>
              </tr>
              <tr>
                <th scope="row">{f.benchmarkLabel ? <Term t="benchmark">{f.benchmarkLabel}</Term> : "Market"}</th>
                <td><Pct value={s.benchRet1w} title={benchTip} /></td>
                <td><Pct value={s.benchRet1m} title={benchTip} /></td>
                <td><Pct value={s.benchRetYtd} title={benchTip} /></td>
              </tr>
              <tr>
                <th scope="row">
                  <Term t="similar funds">Similar funds</Term> <span className="faint">({p.peerCount1w})</span>
                </th>
                <td><Pct value={s.catRet1w} title={catTip} /></td>
                <td><Pct value={s.catRet1m} title={catTip} /></td>
                <td><Pct value={s.catRetYtd} title={catTip} /></td>
              </tr>
              <tr>
                <th scope="row" className="faint">Gap vs similar</th>
                <td><Gap value={s.fundRet1w !== null && s.catRet1w !== null ? s.fundRet1w - s.catRet1w : null} /></td>
                <td><Gap value={s.fundRet1m !== null && s.catRet1m !== null ? s.fundRet1m - s.catRet1m : null} /></td>
                <td><Gap value={s.fundRetYtd !== null && s.catRetYtd !== null ? s.fundRetYtd - s.catRetYtd : null} /></td>
              </tr>
            </tbody>
          </table>
          {p.ytdFromInception && <p className="faint">* Since the fund launched on {p.ytdStartDate ? formatDisplayDate(p.ytdStartDate) : "—"}, not since January.</p>}
        </div>
      </div>

      <details className="provenance">
        <summary>Where these numbers come from</summary>
        <ul>
          <li>
            Fund <Term t="NAV" /> ₹{s.nav.toFixed(4)} as of {navAsOf}, from mfapi.in and AMFI.
          </li>
          <li>{benchmarkSource(f)}</li>
          {p.benchmarkNote && p.benchmark && <li>{p.benchmarkNote}</li>}
          <li>
            Compared with {p.peerCount1w} similar funds ({p.peerGroup}), direct growth plans only, from AMFI&rsquo;s official list.
          </li>
          <li>Simple returns: this week is Friday to Friday; 1 month is from the same date last month; YTD is from the last NAV of last year.</li>
        </ul>
      </details>
    </section>
  );
}
