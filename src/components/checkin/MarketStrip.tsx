import type { Headline, IndexMove } from "@/db/types";
import { formatDisplayDate } from "@/lib/dates";
import { Pct } from "./Pct";

export function MarketStrip({ moves, headlines, cited, provider }: { moves: IndexMove[]; headlines: Headline[]; cited: Set<string>; provider: string | null }) {
  const ordered = [...headlines].sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id)));
  return (
    <section className="market" aria-labelledby="market-title">
      <h2 id="market-title" style={{ fontSize: "var(--step-2)" }}>
        The market this week
      </h2>
      {moves.length > 0 && (
        <ul className="strip">
          {moves.map((m) => (
            <li key={m.key}>
              <span className="muted">{m.label}</span>
              <span className="index-move">
                <Pct value={m.weekReturn} title={`${m.source === "yahoo" ? `Yahoo Finance ${m.sourceRef}` : `Index fund ${m.sourceRef} (stand-in)`}${m.asOf ? `, as of ${formatDisplayDate(m.asOf)}` : ""}`} />
              </span>
              {m.note && <span className="faint">{m.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {ordered.length > 0 ? (
        <>
          <h3 style={{ fontSize: "var(--step-1)" }}>Headlines from the week</h3>
          <ul className="headlines">
            {ordered.map((h) => (
              <li key={h.id}>
                <a href={h.url} target="_blank" rel="noopener noreferrer" className={cited.has(h.id) ? "cited" : undefined}>
                  {h.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <span className="faint">
                  {h.source} · {formatDisplayDate(h.publishedAt.slice(0, 10))}
                  {cited.has(h.id) ? " · mentioned in your summary" : ""}
                </span>
              </li>
            ))}
          </ul>
          {provider && <p className="faint">News via {provider}.</p>}
        </>
      ) : (
        <p className="muted">No market headlines were found for this week.</p>
      )}
    </section>
  );
}
