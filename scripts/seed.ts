import "./_env";
import { registerFund } from "@/lib/funds/register";
import { SEED_FUNDS } from "./seedFunds";

// Seeds Meera's five funds (see seedFunds.ts for the verified names). Safe to re-run: existing funds are updated, not duplicated.
// SIP amounts are illustrative; units held are left empty so the allocation-drift rule stays off until real units are entered.
async function main() {
  for (const f of SEED_FUNDS) {
    const preview = await registerFund({ schemeCode: f.schemeCode, monthlySip: f.monthlySip }, { allowExisting: true });
    console.log(`✓ ${f.role.padEnd(28)} ${preview.schemeCode}  ${preview.name}`);
    console.log(`  ${preview.categoryLabel} · peers: "${preview.peerGroup}" · benchmark: ${preview.suggestedBenchmarkLabel ?? "none (compared with similar funds)"}`);
    for (const w of preview.warnings) console.log(`  ! ${w}`);
  }
  console.log("\nSeeded. Next: npm run backfill");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
