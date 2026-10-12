import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getHistoryView, VERDICT_STATE } from "@/lib/data/views";
import { formatDisplayDate } from "@/lib/dates";
import { Term } from "@/components/glossary/Glossary";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <span className="crumb">Mutual Funds /</span> Performance
          </h1>
          <p className="page-sub">One weak week means little; persistent underperformance against the category is what warrants attention.</p>
        </div>
      </div>
      <Suspense fallback={<p className="muted">Loading history…</p>}>
        <History />
      </Suspense>
    </>
  );
}

const MARK: Record<string, { symbol: string; word: string }> = {
  ahead: { symbol: "▲", word: "ahead of its category" },
  behind: { symbol: "▼", word: "behind its category" },
  level: { symbol: "=", word: "in line with its category" },
  none: { symbol: "·", word: "no data" },
};

async function History() {
  const view = await getHistoryView();
  return (
    <div className="funds-grid">
      <section className="card" aria-labelledby="grid-title">
        <div className="card-head">
          <h2 id="grid-title" className="card-title">
            Weekly performance vs <Term t="category average">category</Term>
          </h2>
          <span className="card-sub">Last {view.weeks.length} weeks</span>
        </div>
        {view.grid.length === 0 || view.weeks.length === 0 ? (
          <p className="muted">No weekly data yet.</p>
        ) : (
          <>
            <ul className="summary-list">
              {view.grid.map((g) => (
                <li key={g.schemeCode}>
                  <strong>{g.shortName}</strong>{" "}
                  <span className="muted">
                    {g.behindRecent === 0
                      ? `in line with or ahead of its category in each of the last ${g.recentWindow} weeks.`
                      : `behind its category in ${g.behindRecent} of the last ${g.recentWindow} weeks.`}
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <ul className="week-strips">
                {view.grid.map((g) => (
                  <li key={g.schemeCode}>
                    <span className="strip-name">{g.shortName}</span>
                    <ol className="strip-cells" aria-label={`${g.shortName}, oldest week first`}>
                      {g.weeks.map((m) => (
                        <li
                          key={m.weekEnding}
                          className={`cell ${m.mark}`}
                          title={`${formatDisplayDate(m.weekEnding)}: ${MARK[m.mark].word}${m.gap !== null ? ` (${m.gap > 0 ? "+" : "−"}${Math.abs(m.gap * 100).toFixed(2)} pp)` : ""}`}
                        >
                          <span aria-hidden="true">{MARK[m.mark].symbol}</span>
                          <span className="sr-only">
                            Week ending {formatDisplayDate(m.weekEnding)}: {MARK[m.mark].word}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
              <p className="strip-axis faint" aria-hidden="true">
                <span>{formatDisplayDate(view.weeks[0])}</span>
                <span>{formatDisplayDate(view.weeks.at(-1)!)}</span>
              </p>
            </div>
            <p className="faint" style={{ marginTop: "var(--space-2)" }}>
              ▲ ahead · ▼ behind · = within 0.05 percentage points (normal tracking noise). Hover or long-press a square for the exact gap.
            </p>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="reports-title">
        <div className="card-head">
          <h2 id="reports-title" className="card-title">
            Weekly reports
          </h2>
        </div>
        {view.reports.length === 0 ? (
          <p className="muted">No reports yet. The first one arrives on Saturday morning.</p>
        ) : (
          <ul className="report-list">
            {view.reports.map((r) => (
              <li key={r.weekEnding}>
                <Link href={`/?week=${r.weekEnding}`} data-verdict={VERDICT_STATE[r.verdict]}>
                  <span className="faint">Week ending {formatDisplayDate(r.weekEnding)}</span>
                  <strong>{r.verdict}</strong>
                  <span className="muted">{r.headline}</span>
                  <span className="faint">
                    Risk score {r.worryScore}/100 · {r.writtenBy === "gemini" ? "AI-written, fact-checked" : "written without AI"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="faint" style={{ marginTop: "var(--space-3)" }}>
          Written reports start from the week this app was set up; the weekly grid goes back {view.weeks.length} weeks using the same calculations.
        </p>
      </section>
    </div>
  );
}
