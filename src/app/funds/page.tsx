import type { Metadata } from "next";
import { Suspense } from "react";
import { getFundsView } from "@/lib/data/views";
import { FundsManager } from "@/components/funds/FundsManager";

export const metadata: Metadata = { title: "Funds" };

export default function FundsPage(props: PageProps<"/funds">) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <span className="crumb">Mutual Funds /</span> My Funds
          </h1>
          <p className="page-sub">Add or remove funds by scheme code. Removing keeps the fund&rsquo;s history, so it can be added back any time.</p>
        </div>
      </div>
      <Suspense fallback={<p className="muted">Loading your funds…</p>}>
        <Funds searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Funds({ searchParams }: { searchParams: PageProps<"/funds">["searchParams"] }) {
  const { search } = await searchParams;
  const view = await getFundsView();
  return (
    <FundsManager
      search={typeof search === "string" ? search.slice(0, 80) : undefined}
      benchmarks={view.benchmarks}
      removed={view.removed.map((r) => ({ schemeCode: r.schemeCode, name: r.name }))}
      initial={view.active.map((f) => ({
        schemeCode: f.schemeCode,
        name: f.name,
        categoryLabel: f.categoryLabel,
        benchmarkLabel: f.benchmarkLabel,
        lastNavDate: f.lastNavDate,
        monthlySip: f.monthlySip,
        unitsHeld: f.unitsHeld,
        investedAmount: f.investedAmount,
        holdingsSample: f.holdingsSample,
      }))}
    />
  );
}
