import { fetchNavAll, type AmfiScheme } from "@/lib/sources/amfi";
import { fetchScheme, isValidSchemeCode, SchemeNotFoundError } from "@/lib/sources/mfapi";
import { assetClassFor, normaliseCategory, peerGroupFor, planInfo, suggestBenchmark, type AssetClass } from "@/lib/classify";
import { benchmarkLabel } from "@/lib/sources/benchmarkCatalog";
import type { IsoDate } from "@/lib/dates";

const AMFI_TTL_MS = 6 * 60 * 60 * 1000;
let amfiCache: { at: number; rows: AmfiScheme[]; byCode: Map<string, AmfiScheme> } | null = null;

/** NAVAll.txt is ~1.5 MB; keep one parsed copy per server instance for a few hours. */
export async function amfiSnapshot(force = false) {
  if (!force && amfiCache && Date.now() - amfiCache.at < AMFI_TTL_MS) return amfiCache;
  const rows = await fetchNavAll();
  amfiCache = { at: Date.now(), rows, byCode: new Map(rows.map((r) => [r.schemeCode, r])) };
  return amfiCache;
}

export type FundPreview = {
  schemeCode: string;
  name: string;
  amc: string;
  /** Official category from AMFI when available, else mfapi's. */
  sebiCategory: string;
  categoryLabel: string;
  peerGroup: string;
  assetClass: AssetClass;
  suggestedBenchmark: string | null;
  suggestedBenchmarkLabel: string | null;
  latestNav: number;
  latestNavDate: IsoDate;
  historyStart: IsoDate;
  isDirect: boolean;
  isGrowth: boolean;
  warnings: string[];
};

export class FundLookupError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid_code" | "not_found" | "source_down",
  ) {
    super(message);
    this.name = "FundLookupError";
  }
}

export async function lookupFund(code: string): Promise<FundPreview> {
  const schemeCode = code.trim();
  if (!isValidSchemeCode(schemeCode)) {
    throw new FundLookupError("A scheme code is a number of 3 to 7 digits, like 118989.", "invalid_code");
  }
  let scheme;
  try {
    scheme = await fetchScheme(schemeCode);
  } catch (e) {
    if (e instanceof SchemeNotFoundError) throw new FundLookupError(`We couldn't find a fund with scheme code ${schemeCode}. Check the number, or use "Find a scheme code" below.`, "not_found");
    throw new FundLookupError("The mutual fund data service isn't responding right now. Try again in a minute.", "source_down");
  }
  if (scheme.navs.length === 0) throw new FundLookupError(`Scheme ${schemeCode} has no NAV history, so we can't track it.`, "not_found");

  let amfiRow: AmfiScheme | undefined;
  try {
    amfiRow = (await amfiSnapshot()).byCode.get(schemeCode);
  } catch {
    amfiRow = undefined;
  }

  const sebiCategory = amfiRow?.category || scheme.category;
  const plan = planInfo(scheme.name, amfiRow?.plan, amfiRow?.option);
  const latest = scheme.navs[scheme.navs.length - 1];
  const warnings: string[] = [];
  if (!plan.isGrowth) warnings.push("This looks like an IDCW (dividend) or bonus option, not a growth plan. Its NAV drops when payouts happen, so returns will look worse than they really are.");
  else if (!plan.isDirect) warnings.push("This is a Regular plan. Similar funds are compared using Direct plans, which have lower costs, so this fund may look slightly behind.");
  if (!amfiRow) warnings.push("AMFI's latest list doesn't include this scheme. It may have been merged or closed.");
  const ageDays = (Date.now() - new Date(`${latest.date}T00:00:00Z`).getTime()) / 86_400_000;
  if (ageDays > 10) warnings.push(`The latest NAV is from ${latest.date}. This fund may no longer be updated.`);

  const suggested = suggestBenchmark(sebiCategory, scheme.name);
  return {
    schemeCode,
    name: scheme.name,
    amc: scheme.amc || amfiRow?.amc || "",
    sebiCategory,
    categoryLabel: normaliseCategory(sebiCategory).category,
    peerGroup: peerGroupFor(sebiCategory, scheme.name),
    assetClass: assetClassFor(sebiCategory, scheme.name),
    suggestedBenchmark: suggested,
    suggestedBenchmarkLabel: benchmarkLabel(suggested),
    latestNav: latest.nav,
    latestNavDate: latest.date,
    historyStart: scheme.navs[0].date,
    isDirect: plan.isDirect,
    isGrowth: plan.isGrowth,
    warnings,
  };
}
