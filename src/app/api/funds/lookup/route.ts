import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db/client";
import { funds } from "@/db/schema";
import { clientIp, errorJson, json, rateLimit, tooMany } from "@/lib/api";
import { FundLookupError, lookupFund } from "@/lib/funds/lookup";
import { searchSchemes } from "@/lib/sources/mfapi";

const STATUS: Record<FundLookupError["kind"], number> = { invalid_code: 400, not_found: 404, source_down: 503 };

/** ?code=118989 → live preview for the add form. ?q=mid cap → scheme search ("Find a scheme code"). */
export async function GET(request: NextRequest) {
  const limit = rateLimit(`lookup:${clientIp(request)}`, 30, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfterSec);
  const code = request.nextUrl.searchParams.get("code");
  const q = request.nextUrl.searchParams.get("q");

  if (q !== null) {
    if (q.trim().length < 3) return json({ results: [] });
    try {
      const results = (await searchSchemes(q)).slice(0, 25);
      return json({ results });
    } catch {
      return errorJson("Scheme search isn't responding right now. Try again in a minute.", 503);
    }
  }

  if (!code) return errorJson("Pass ?code= or ?q=.", 400);
  try {
    const preview = await lookupFund(code);
    const [existing] = await db().select({ isActive: funds.isActive }).from(funds).where(eq(funds.schemeCode, preview.schemeCode)).limit(1);
    return json({ preview, alreadyAdded: existing?.isActive ?? false, previouslyRemoved: existing ? !existing.isActive : false });
  } catch (e) {
    if (e instanceof FundLookupError) return errorJson(e.message, STATUS[e.kind], { kind: e.kind });
    return errorJson("Something went wrong looking up that fund.", 500);
  }
}
