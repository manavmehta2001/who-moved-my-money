import { runningJob, withJobRun } from "@/db/queries";
import { errorJson, json } from "@/lib/api";
import { runDailyNav, runWeeklyReport } from "./scheduled";

export const WEEKLY_JOB = "weekly-report";
export const DAILY_JOB = "daily-nav";

function failure(e: unknown): Response {
  const message = e instanceof Error ? e.message : String(e);
  return errorJson(message, 500);
}

export async function respondDailyNav(): Promise<Response> {
  try {
    const { runId, status, result, details } = await withJobRun(DAILY_JOB, runDailyNav);
    return json({ runId, status, ...result, warnings: details.warnings });
  } catch (e) {
    return failure(e);
  }
}

/** Shared by the Saturday cron and the "Generate this week's report now" button. One run at a time. */
export async function respondWeeklyReport(trigger: "cron" | "manual", opts: { refreshNews?: boolean } = {}): Promise<Response> {
  const busy = await runningJob(WEEKLY_JOB);
  if (busy) return errorJson("A report is already being generated. Give it a minute and refresh.", 409, { runId: busy.id });
  try {
    const { runId, status, result, details } = await withJobRun(WEEKLY_JOB, (ctx) => {
      ctx.details.trigger = trigger;
      return runWeeklyReport(ctx, opts);
    });
    return json({ runId, status, ...result, warnings: details.warnings });
  } catch (e) {
    return failure(e);
  }
}
