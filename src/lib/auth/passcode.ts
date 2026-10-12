import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "wmm_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** The cookie holds an HMAC of the passcode, never the passcode itself; changing ADMIN_PASSCODE logs everyone out. */
function adminToken(): string | null {
  const passcode = process.env.ADMIN_PASSCODE;
  if (!passcode) return null;
  return createHmac("sha256", passcode).update("who-moved-my-money:admin:v1").digest("hex");
}

export function passcodeMatches(attempt: string): boolean {
  const passcode = process.env.ADMIN_PASSCODE;
  return !!passcode && safeEqual(attempt.trim(), passcode);
}

export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  return !!secret && safeEqual(header, `Bearer ${secret}`);
}

/** Admin = valid passcode cookie, or the cron secret as a Bearer token (for scripts and curl). */
export async function isAdmin(request?: Request): Promise<boolean> {
  if (request && isCronRequest(request)) return true;
  const token = adminToken();
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!token && !!value && safeEqual(value, token);
}

export async function setAdminCookie(): Promise<void> {
  const token = adminToken();
  if (!token) throw new Error("ADMIN_PASSCODE is not configured");
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearAdminCookie(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
