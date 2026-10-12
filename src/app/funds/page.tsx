import type { Metadata } from "next";
import { Suspense } from "react";
import { getFundsView } from "@/lib/data/views";
import { FundsManager } from "@/components/funds/FundsManager";

export const metadata: Metadata = { title: "Funds" };

export default function FundsPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Funds</h1>
          <p className="page-sub">Add or remove funds by scheme code. Removing keeps the fund&rsquo;s history, so it can be added back any time.</p>
        </div>
      </div>
      <Suspense fallback={<p className="muted">Loading your funds…</p>}>
        <Funds />
      </Suspense>
    </>
  );
}

async function Funds() {
  const view = await getFundsView();
  return (
    <FundsManager
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
