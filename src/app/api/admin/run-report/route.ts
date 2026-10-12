import { unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth/passcode";
import { respondWeeklyReport } from "@/lib/jobs/runners";

export const maxDuration = 300;

/** "Generate this week's report now". ?refreshNews=1 re-fetches the week's headlines. */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) return unauthorized();
  const refreshNews = new URL(request.url).searchParams.get("refreshNews") === "1";
  return respondWeeklyReport("manual", { refreshNews });
}
