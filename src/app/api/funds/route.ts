import { z } from "zod";
import { errorJson, json, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth/passcode";
import { withJobRun } from "@/db/queries";
import { AlreadyAddedError, registerFund } from "@/lib/funds/register";
import { FundLookupError } from "@/lib/funds/lookup";
import { runDataBackfill } from "@/lib/jobs/backfill";

export const maxDuration = 120;

const optionalAmount = z.number().positive().max(1e9).nullable().optional();

const addFundSchema = z.object({
  schemeCode: z.string().trim().regex(/^\d{3,7}$/, "A scheme code is a number of 3 to 7 digits."),
  benchmarkKey: z.string().nullable().optional(),
  monthlySip: optionalAmount,
  unitsHeld: optionalAmount,
});

const STATUS: Record<FundLookupError["kind"], number> = { invalid_code: 400, not_found: 404, source_down: 503 };

/** Adds (or re-adds) a fund, then backfills its history and similar funds so it appears in the next report. */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) return unauthorized();
  const parsed = addFundSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? "Invalid request.", 400);

  let preview;
  try {
    preview = await registerFund(parsed.data);
  } catch (e) {
    if (e instanceof AlreadyAddedError) return errorJson(e.message, 409, { kind: "already_added" });
    if (e instanceof FundLookupError) return errorJson(e.message, STATUS[e.kind], { kind: e.kind });
    return errorJson(e instanceof Error ? e.message : "Couldn't add that fund.", 500);
  }

  try {
    const { status, result } = await withJobRun("add-fund", (ctx) => {
      ctx.details.schemeCode = preview.schemeCode;
      return runDataBackfill(ctx, { onlyFund: preview.schemeCode, deadline: Date.now() + 90_000 });
    });
    return json({ fund: preview, backfill: { status, snapshotRows: result.snapshotRows, peers: result.peers, done: result.done } }, 201);
  } catch (e) {
    // The fund is saved; the Saturday job will fill in anything the backfill missed.
    return json({ fund: preview, backfill: { status: "error", error: e instanceof Error ? e.message : String(e) } }, 201);
  }
}
