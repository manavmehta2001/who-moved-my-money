import type { Metadata } from "next";
import { Suspense } from "react";
import { getFundsView } from "@/lib/data/views";
import { isAdmin } from "@/lib/auth/passcode";
import { FundsManager } from "@/components/funds/FundsManager";

export const metadata: Metadata = { title: "My funds" };

export default function FundsPage() {
  return (
    <>
      <h1 className="page-title">My funds</h1>
      <p className="lede">Add or remove a fund by its scheme code. Removing keeps its history, so you can add it back any time.</p>
      <Suspense fallback={<p className="muted">Loading your funds…</p>}>
        <Funds />
      </Suspense>
    </>
  );
}

async function Funds() {
  const [view, admin] = await Promise.all([getFundsView(), isAdmin()]);
  return (
    <FundsManager
      isAdmin={admin}
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
      }))}
    />
  );
}
