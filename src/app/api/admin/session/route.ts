import { z } from "zod";
import { clientIp, errorJson, json, rateLimit, tooMany } from "@/lib/api";
import { clearAdminCookie, isAdmin, passcodeMatches, setAdminCookie } from "@/lib/auth/passcode";

const bodySchema = z.object({ passcode: z.string().min(1).max(200) });

export async function GET(request: Request) {
  return json({ admin: await isAdmin(request) });
}

/** Enter the passcode once; an httpOnly cookie remembers it for 30 days. */
export async function POST(request: Request) {
  const limit = rateLimit(`login:${clientIp(request)}`, 5, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorJson("Enter the passcode.", 400);
  if (!passcodeMatches(parsed.data.passcode)) return errorJson("That passcode isn't right.", 401);
  await setAdminCookie();
  return json({ admin: true });
}

export async function DELETE() {
  await clearAdminCookie();
  return json({ admin: false });
}
