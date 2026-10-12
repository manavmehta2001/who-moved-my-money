/** Small helpers shared by the route handlers. */

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function errorJson(message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, status);
}

export const unauthorized = () => errorJson("Enter the admin passcode first.", 401);

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

/**
 * Basic fixed-window rate limit, per server instance. Serverless instances don't share memory, so this is a
 * speed bump against accidental hammering of mfapi, not a security boundary.
 */
const buckets = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start >= windowMs) buckets.delete(k);
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  return b.count <= limit ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.ceil((b.start + windowMs - now) / 1000) };
}

export function tooMany(retryAfterSec: number): Response {
  return json({ error: `Too many requests. Try again in ${retryAfterSec} seconds.` }, 429, { "Retry-After": String(retryAfterSec) });
}
