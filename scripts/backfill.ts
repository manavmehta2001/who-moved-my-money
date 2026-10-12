import "./_env";
import { withJobRun } from "@/db/queries";
import { runDataBackfill } from "@/lib/jobs/backfill";
import { generateReport } from "@/lib/jobs/report";

async function main() {
  const started = Date.now();
  // Older weeks get snapshots only; a full report (with real news) is written just for the latest week.
  const { result, status, details } = await withJobRun("backfill", async (ctx) => {
    const data = await runDataBackfill(ctx);
    const report = data.done ? await generateReport(ctx, data.weekEnding) : null;
    return { ...data, reportWrittenBy: report?.report.writtenBy ?? "not written (backfill incomplete)" };
  });
  console.log(`Week ending ${result.weekEnding}`);
  console.log("Funds (NAV rows):", result.funds);
  console.log("Benchmarks (rows):", result.benchmarks);
  console.log("Peer groups (members):", result.peerGroups);
  console.log("Peer histories:", result.peers);
  console.log("Weekly snapshots written:", result.snapshotRows);
  console.log("Latest report written by:", result.reportWrittenBy);
  const warnings = (details.warnings as string[] | undefined) ?? [];
  for (const w of warnings) console.warn(`! ${w}`);
  console.log(`\n${status.toUpperCase()} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
