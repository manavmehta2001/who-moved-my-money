import { json, errorJson, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth/passcode";
import { withJobRun } from "@/db/queries";
import { runDataBackfill } from "@/lib/jobs/backfill";
import { generateReport } from "@/lib/jobs/report";

export const maxDuration = 300;

/**
 * Pulls full history and computes 12 weeks of snapshots, then writes the latest week's report.
 * Stops before the time limit and answers { done: false } so the caller can POST again to continue.
 */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) return unauthorized();
  const deadline = Date.now() + 200_000;
  try {
    const { runId, status, result } = await withJobRun("backfill", async (ctx) => {
      const data = await runDataBackfill(ctx, { deadline });
      const report = data.done ? await generateReport(ctx, data.weekEnding) : null;
      return { ...data, report: report ? { verdict: report.report.verdict, writtenBy: report.report.writtenBy } : null };
    });
    return json({ runId, status, ...result, next: result.done ? null : "POST again to continue" });
  } catch (e) {
    return errorJson(e instanceof Error ? e.message : String(e), 500);
  }
}
