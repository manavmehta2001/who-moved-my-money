import { formatDisplayDate } from "@/lib/dates";
import { Pct } from "./Pct";

type Week = { weekEnding: string; fund: number | null; compare: number | null };

/** Growth of ₹100 over the stored weeks, built from the weekly returns in the snapshots. */
function cumulative(values: Array<number | null>): number[] {
  const out = [0];
  let level = 1;
  for (const v of values) {
    level *= 1 + (v ?? 0);
    out.push(level - 1);
  }
  return out;
}

export function Sparkline({ weeks, compareLabel }: { weeks: Week[]; compareLabel: string }) {
  if (weeks.length < 2) return null;
  const fund = cumulative(weeks.map((w) => w.fund));
  const comp = weeks.some((w) => w.compare !== null) ? cumulative(weeks.map((w) => w.compare)) : null;
  const W = 300;
  const H = 96;
  const pad = 6;
  const all = [...fund, ...(comp ?? [])];
  let lo = Math.min(0, ...all);
  let hi = Math.max(0, ...all);
  if (hi - lo < 0.004) {
    hi += 0.002;
    lo -= 0.002;
  }
  const x = (i: number) => pad + (i / (fund.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2);
  const path = (s: number[]) => s.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const first = weeks[0].weekEnding;
  const last = weeks.at(-1)!.weekEnding;

  return (
    <figure className="spark" style={{ margin: 0 }}>
      <figcaption>
        Last {weeks.length} weeks, {formatDisplayDate(first)} to {formatDisplayDate(last)}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Over ${weeks.length} weeks your fund moved ${(fund.at(-1)! * 100).toFixed(2)}%${comp ? `, ${compareLabel} moved ${(comp.at(-1)! * 100).toFixed(2)}%` : ""}.`}>
        <line className="spark-zero" x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} />
        {comp && <path className="spark-bench" d={path(comp)} />}
        <path className="spark-fund" d={path(fund)} data-anim="spark" />
      </svg>
      <div className="spark-legend">
        <span>
          <span className="key" aria-hidden="true" />
          Your fund <Pct value={fund.at(-1)!} />
        </span>
        {comp && (
          <span>
            <span className="key bench" aria-hidden="true" />
            {compareLabel} <Pct value={comp.at(-1)!} />
          </span>
        )}
      </div>
    </figure>
  );
}
