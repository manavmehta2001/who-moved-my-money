import { errorJson } from "@/lib/api";
import { isCronRequest } from "@/lib/auth/passcode";
import { respondDailyNav } from "@/lib/jobs/runners";

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isCronRequest(request)) return errorJson("Unauthorized", 401);
  return respondDailyNav();
}
