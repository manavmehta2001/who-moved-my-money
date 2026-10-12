import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { funds } from "@/db/schema";
import { upsertBenchmarkDefs } from "@/db/queries";
import { BENCHMARKS } from "@/lib/sources/benchmarkCatalog";
import { lookupFund, FundLookupError, type FundPreview } from "./lookup";

export type AddFundInput = {
  schemeCode: string;
  benchmarkKey?: string | null;
  monthlySip?: number | null;
  unitsHeld?: number | null;
};

export class AlreadyAddedError extends Error {
  constructor(readonly fundName: string) {
    super(`${fundName} is already in your list.`);
    this.name = "AlreadyAddedError";
  }
}

/** Validates against live data, then inserts (or re-activates a soft-deleted) fund. Returns the preview used. */
export async function registerFund(input: AddFundInput, opts: { allowExisting?: boolean } = {}): Promise<FundPreview> {
  const preview = await lookupFund(input.schemeCode);
  const [existing] = await db().select().from(funds).where(eq(funds.schemeCode, preview.schemeCode)).limit(1);
  if (existing?.isActive && !opts.allowExisting) throw new AlreadyAddedError(existing.name);

  // `undefined` = use the suggestion; `null` = Meera chose "compare with similar funds only".
  const benchmarkKey = input.benchmarkKey === undefined ? preview.suggestedBenchmark : input.benchmarkKey;
  if (benchmarkKey && !BENCHMARKS.some((b) => b.key === benchmarkKey && b.sourceType === "mf_proxy")) {
    throw new FundLookupError(`Unknown benchmark "${benchmarkKey}".`, "invalid_code");
  }

  // funds.benchmark_key references benchmarks.key, so make sure the catalogue rows exist first.
  await upsertBenchmarkDefs(BENCHMARKS);
  const values = {
    schemeCode: preview.schemeCode,
    name: preview.name,
    amc: preview.amc,
    sebiCategory: preview.sebiCategory,
    peerGroup: preview.peerGroup,
    assetClass: preview.assetClass,
    benchmarkKey,
    monthlySip: input.monthlySip ?? null,
    unitsHeld: input.unitsHeld ?? null,
    isActive: true,
    removedAt: null,
  };
  await db()
    .insert(funds)
    .values({ ...values, addedAt: new Date() })
    .onConflictDoUpdate({ target: funds.schemeCode, set: values });
  return preview;
}

/** Soft delete: history stays, the fund drops out of new reports, and it can be re-added later. */
export async function removeFund(schemeCode: string): Promise<boolean> {
  const rows = await db()
    .update(funds)
    .set({ isActive: false, removedAt: new Date() })
    .where(eq(funds.schemeCode, schemeCode))
    .returning({ schemeCode: funds.schemeCode });
  return rows.length > 0;
}
