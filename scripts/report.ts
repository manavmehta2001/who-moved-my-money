import "./_env";
import { withJobRun } from "@/db/queries";
import { currentWeekEnding } from "@/lib/dates";
import { generateReport } from "@/lib/jobs/report";

// Generates (or regenerates) the report for the current week. Pass --refresh-news to re-fetch headlines.
async function main() {
  const week = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? currentWeekEnding();
  const { result, status, details } = await withJobRun("report", (ctx) => generateReport(ctx, week, { forceNews: process.argv.includes("--refresh-news") }));
  const c = result.report.content;
  console.log(`\n${result.report.verdict}  ·  worry ${result.report.worryScore}/100  ·  written by ${result.report.writtenBy}${result.report.model ? ` (${result.report.model})` : ""}`);
  console.log(`tokens ${result.report.tokensIn} in / ${result.report.tokensOut} out · ${result.report.latencyMs} ms · retries ${result.report.retries}\n`);
  console.log(`# ${c.headline}\n`);
  for (const f of c.funds) console.log(`[${f.schemeCode}] ${f.summary}${f.citedHeadlineIds.length ? `  (cites ${f.citedHeadlineIds.join(", ")})` : ""}\n`);
  console.log(`Why: ${c.verdictReason}\nJargon: ${c.jargonUsed.join(", ")}`);
  for (const a of result.written.attempts) if (!a.ok) console.log(`\nAttempt rejected by the guard:\n  - ${a.errors.join("\n  - ")}`);
  for (const w of (details.warnings as string[] | undefined) ?? []) console.warn(`! ${w}`);
  console.log(`\n${status.toUpperCase()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
