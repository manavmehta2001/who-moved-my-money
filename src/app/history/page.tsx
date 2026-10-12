import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getHistoryView, VERDICT_STATE } from "@/lib/data/views";
import { formatDisplayDate } from "@/lib/dates";
import { Term } from "@/components/glossary/Glossary";

export const metadata: Metadata = { title: "Past Saturdays" };

export default function HistoryPage() {
  return (
    <>
      <h1 className="page-title">Past Saturdays</h1>
      <p className="lede">One bad week means little. A fund that trails funds like it week after week is the one to keep an eye on.</p>
      <Suspense fallback={<p className="muted">Loading past check-ins…</p>}>
        <History />
      </Suspense>
    </>
  );
}

const MARK: Record<string, { symbol: string; word: string }> = {
  ahead: { symbol: "▲", word: "ahead of similar funds" },
  behind: { symbol: "▼", word: "behind similar funds" },
  level: { symbol: "=", word: "level with similar funds" },
  none: { symbol: "·", word: "no data" },
};

async function History() {
  const view = await getHistoryView();
  return (
    <>
      <section aria-labelledby="grid-title" style={{ marginTop: "var(--space-5)" }}>
        <h2 id="grid-title" style={{ fontSize: "var(--step-2)" }}>
          Weeks beating <Term t="similar funds" />
        </h2>
        {view.grid.length === 0 || view.weeks.length === 0 ? (
          <p className="muted">No weekly data yet.</p>
        ) : (
          <>
            <ul style={{ listStyle: "none", padding: 0, margin: "var(--space-3) 0 0", display: "grid", gap: "var(--space-1)" }}>
              {view.grid.map((g) => (
                <li key={g.schemeCode}>
                  <strong>{g.shortName}</strong>{" "}
                  <span className="muted">
                    {g.behindRecent === 0
                      ? `kept up with or beat similar funds in each of the last ${g.recentWindow} weeks.`
                      : `lagged similar funds in ${g.behindRecent} of the last ${g.recentWindow} weeks.`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="grid-wrap">
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

      <section aria-labelledby="reports-title" style={{ marginTop: "var(--space-6)" }}>
        <h2 id="reports-title" style={{ fontSize: "var(--step-2)" }}>
          Past reports
        </h2>
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
                    Worry {r.worryScore}/100 · {r.writtenBy === "gemini" ? "written by Gemini" : "written without AI"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="faint" style={{ marginTop: "var(--space-3)" }}>
          Full written reports start from the week this app was set up; the grid above goes back {view.weeks.length} weeks using the same calculations.
        </p>
      </section>
    </>
  );
}
