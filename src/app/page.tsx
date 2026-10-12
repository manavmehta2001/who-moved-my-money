import { Suspense } from "react";
import Link from "next/link";
import { getCheckinView } from "@/lib/data/views";
import { formatDisplayDate } from "@/lib/dates";
import { shareText } from "@/lib/share";
import { GenerateNow } from "@/components/admin/GenerateNow";
import { DashboardMotion } from "@/components/dashboard/DashboardMotion";
import { AllocationCard, HoldingsCard, MarketCard, NoteCard, PortfolioCard, VerdictCard } from "@/components/dashboard/Cards";
import { FundDetail } from "@/components/dashboard/FundDetail";
import { Sheet } from "@/components/dashboard/Sheet";

export default function DashboardPage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="muted">Loading your portfolio…</p>}>
      <Dashboard searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { week } = await searchParams;
  const view = await getCheckinView(typeof week === "string" ? week : undefined);

  if (!view) {
    return (
      <section className="card empty" aria-labelledby="empty-title">
        <h1 id="empty-title" className="page-title">
          Your first weekly report arrives Saturday morning.
        </h1>
        <p className="muted">Every Saturday at about 7 AM the dashboard explains what moved each fund: the market, its category, or the fund&rsquo;s own choices.</p>
        <GenerateNow label="Generate it now" className="button" />
      </section>
    );
  }

  const r = view.report;
  const cited = new Set(view.funds.flatMap((f) => f.citedHeadlineIds));

  return (
    <DashboardMotion state={view.state} week={r.weekEnding}>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <span className="crumb">Mutual Funds /</span> Portfolio
          </h1>
          <p className="page-sub">
            Weekly review for the week ending {formatDisplayDate(r.weekEnding)}
            {!view.isLatest && (
              <>
                {" · "}
                <Link href="/">Go to latest</Link>
              </>
            )}
          </p>
        </div>
        {view.isLatest && <GenerateNow />}
      </div>

      {view.removedSince.length > 0 && (
        <p className="alert info" style={{ marginBottom: "var(--gap)" }}>
          Removed since this report: {view.removedSince.join(", ")}. It won&rsquo;t appear in future reports.
        </p>
      )}

      <div className="dash-grid">
        <div className="dash-main">
          {view.portfolio && <PortfolioCard p={view.portfolio} weekEnding={r.weekEnding} />}
          <HoldingsCard funds={view.funds} />
          <NoteCard view={view} shareText={shareText(view, process.env.NEXT_PUBLIC_APP_URL)} />
        </div>
        <div className="dash-side">
          <VerdictCard view={view} />
          {view.portfolio && <AllocationCard p={view.portfolio} />}
          <MarketCard moves={view.indexMoves} headlines={view.headlines} cited={cited} provider={view.newsProvider} />
        </div>
      </div>

      <p className="faint" style={{ marginTop: "var(--gap)" }}>
        Generated {r.generatedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST ·{" "}
        {r.writtenBy === "gemini" ? `analyst note by ${r.model}, fact-checked against the data` : "analyst note written without AI this week"}
      </p>

      {view.funds.map((f) => (
        <Sheet
          key={f.schemeCode}
          id={f.schemeCode}
          title={f.shortName}
          subtitle={
            <p className="faint" style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span className="chip">{f.categoryLabel}</span>
              {f.benchmarkLabel && <span className="chip">vs {f.benchmarkLabel}</span>}
              {f.flagged && <span className="chip accent">Watch</span>}
            </p>
          }
        >
          <FundDetail f={f} jargon={r.content.jargonUsed} />
        </Sheet>
      ))}
    </DashboardMotion>
  );
}
