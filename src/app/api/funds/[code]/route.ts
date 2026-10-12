import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { funds } from "@/db/schema";
import { errorJson, json, unauthorized } from "@/lib/api";
import { isAdmin } from "@/lib/auth/passcode";
import { removeFund } from "@/lib/funds/register";
import { BENCHMARKS } from "@/lib/sources/benchmarkCatalog";
import { withJobRun } from "@/db/queries";
import { computeSnapshots } from "@/lib/jobs/snapshots";
import { currentWeekEnding } from "@/lib/dates";

export const maxDuration = 60;

/** Soft delete: the fund leaves future reports, its history stays, and it can be added back. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/funds/[code]">) {
  if (!(await isAdmin(request))) return unauthorized();
  const { code } = await ctx.params;
  const removed = await removeFund(code);
  return removed ? json({ removed: code }) : errorJson(`No fund with scheme code ${code} in your list.`, 404);
}

const patchSchema = z
  .object({
    benchmarkKey: z.string().nullable().optional(),
    monthlySip: z.number().positive().max(1e9).nullable().optional(),
    unitsHeld: z.number().positive().max(1e9).nullable().optional(),
    investedAmount: z.number().positive().max(1e12).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

/** Change the benchmark, SIP, units or invested amount; a benchmark change recomputes that fund's snapshots. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/funds/[code]">) {
  if (!(await isAdmin(request))) return unauthorized();
  const { code } = await ctx.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  const { benchmarkKey } = parsed.data;
  if (benchmarkKey && !BENCHMARKS.some((b) => b.key === benchmarkKey && b.sourceType === "mf_proxy")) return errorJson(`Unknown benchmark "${benchmarkKey}".`, 400);

  // Meera's own numbers replace the sample holdings.
  const editsHoldings = parsed.data.unitsHeld !== undefined || parsed.data.investedAmount !== undefined;
  const [updated] = await db()
    .update(funds)
    .set({ ...parsed.data, ...(editsHoldings ? { holdingsSample: false } : {}) })
    .where(eq(funds.schemeCode, code))
    .returning();
  if (!updated) return errorJson(`No fund with scheme code ${code}.`, 404);
  if (benchmarkKey !== undefined) {
    await withJobRun("recompute-fund", (jc) => computeSnapshots(jc, currentWeekEnding(), { funds: [updated] }));
  }
  return json({ fund: updated });
}
