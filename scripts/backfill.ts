import "./_env";
import { withJobRun } from "@/db/queries";
import { runDataBackfill } from "@/lib/jobs/backfill";

async function main() {
  const started = Date.now();
  const { result, status, details } = await withJobRun("backfill", (ctx) => runDataBackfill(ctx));
  console.log(`Week ending ${result.weekEnding}`);
  console.log("Funds (NAV rows):", result.funds);
  console.log("Benchmarks (rows):", result.benchmarks);
  console.log("Peer groups (members):", result.peerGroups);
  console.log("Peer histories:", result.peers);
  const warnings = (details.warnings as string[] | undefined) ?? [];
  for (const w of warnings) console.warn(`! ${w}`);
  console.log(`\n${status.toUpperCase()} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
