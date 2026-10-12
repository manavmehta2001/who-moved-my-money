import { errorJson } from "@/lib/api";
import { isCronRequest } from "@/lib/auth/passcode";
import { respondWeeklyReport } from "@/lib/jobs/runners";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) return errorJson("Unauthorized", 401);
  return respondWeeklyReport("cron");
}
