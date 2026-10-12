import { Term } from "@/components/glossary/Glossary";
import { Pct } from "./Pct";

type Part = { key: "market" | "similar" | "choices"; label: string; glossary: string; value: number };

/**
 * "Who moved my money?" as a waterfall: each row starts where the previous one ended, so the three parts visibly
 * add up to the fund's own return on the last row. Bars render at full width; the load timeline grows them in order.
 */
export function Waterfall({ market, similar, choices, fund, mode, benchmarkLabel, peerCount }: {
  market: number | null;
  similar: number | null;
  choices: number | null;
  fund: number | null;
  mode: "three_part" | "no_benchmark" | "no_category" | "fund_only";
  benchmarkLabel: string | null;
  peerCount: number;
}) {
  if (fund === null || mode === "fund_only" || choices === null) {
    return <p className="wf-note">There wasn&rsquo;t enough data this week to split the move into parts.</p>;
  }
  const parts: Part[] = [];
  if (market !== null) parts.push({ key: "market", label: "The market", glossary: "the market", value: market });
  if (similar !== null) parts.push({ key: "similar", label: "Funds like yours", glossary: "funds like yours", value: similar });
  parts.push({ key: "choices", label: "Your fund's choices", glossary: "your fund's choices", value: choices });

  const totals = [0];
  for (const p of parts) totals.push(totals.at(-1)! + p.value);
  let lo = Math.min(0, ...totals, fund);
  let hi = Math.max(0, ...totals, fund);
  const span = Math.max(hi - lo, 0.002);
  lo -= span * 0.08;
  hi += span * 0.08;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zero = x(0);

  return (
    <figure style={{ margin: 0 }}>
      <ol className="wf" aria-label="Who moved this fund's money this week">
        <li className="wf-title" aria-hidden="true">
          Who moved my money this week?
        </li>
        {parts.map((p, i) => {
          const from = totals[i];
          const to = totals[i + 1];
          return (
            <li key={p.key} className="wf-row">
              <span className="wf-label">
                <Term t={p.glossary}>{p.label}</Term>
                {p.key === "market" && benchmarkLabel && <span className="faint"> ({benchmarkLabel})</span>}
                {p.key === "similar" && mode === "no_benchmark" && <span className="faint"> (average of {peerCount})</span>}
              </span>
              <span className="wf-track" aria-hidden="true">
                <span className="wf-zero" style={{ left: `${zero}%` }} />
                <span
                  className={`wf-seg p-${p.key}`}
                  data-anim="part"
                  style={{ left: `${x(Math.min(from, to))}%`, width: `${Math.abs(x(to) - x(from))}%`, transformOrigin: to >= from ? "left center" : "right center" }}
                />
              </span>
              <span className="wf-value">
                <Pct value={p.value} />
              </span>
            </li>
          );
        })}
        <li className="wf-row total">
          <span className="wf-label">Your fund</span>
          <span className="wf-track" aria-hidden="true">
            <span className="wf-zero" style={{ left: `${zero}%` }} />
            <span
              className="wf-seg p-total"
              data-anim="part"
              style={{ left: `${x(Math.min(0, fund))}%`, width: `${Math.abs(x(fund) - zero)}%`, transformOrigin: fund >= 0 ? "left center" : "right center" }}
            />
          </span>
          <span className="wf-value">
            <Pct value={fund} />
          </span>
        </li>
      </ol>
      {mode === "no_benchmark" && (
        <figcaption className="wf-note" style={{ marginTop: "var(--space-2)" }}>
          Benchmark data isn&rsquo;t publicly available for this fund, so we compare it with similar funds instead.
        </figcaption>
      )}
    </figure>
  );
}
