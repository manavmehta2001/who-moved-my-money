import "./_env";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { funds } from "@/db/schema";
import { activeFunds, navSeries } from "@/db/queries";
import { todayIST } from "@/lib/dates";
import { simulateSip } from "@/lib/funds/sipSimulation";

/**
 * Gives Meera sample holdings by replaying each fund's monthly SIP (on the 5th, since Jan 2024) at the real
 * historical NAVs. Marked holdings_sample = true; editing a fund's units or invested amount on /funds replaces it.
 * Only fills funds that don't already have the user's own numbers, unless --force.
 */
const START = "2024-01-01";

async function main() {
  const force = process.argv.includes("--force");
  const list = await activeFunds();
  const end = todayIST();
  const series = await navSeries(list.map((f) => f.schemeCode), START, end);
  for (const f of list) {
    if (!f.monthlySip) {
      console.log(`- ${f.name}: no monthly SIP, skipped`);
      continue;
    }
    if (f.unitsHeld && !f.holdingsSample && !force) {
      console.log(`- ${f.name}: has your own holdings, kept`);
      continue;
    }
    const r = simulateSip(series.get(f.schemeCode) ?? [], f.monthlySip, START, end);
    await db().update(funds).set({ unitsHeld: r.units, investedAmount: r.invested, holdingsSample: true }).where(eq(funds.schemeCode, f.schemeCode));
    console.log(`✓ ${f.name}: ${r.instalments} SIPs of ₹${f.monthlySip} (${r.firstDate} → ${r.lastDate}) = ${r.units} units, ₹${r.invested.toLocaleString("en-IN")} invested`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
