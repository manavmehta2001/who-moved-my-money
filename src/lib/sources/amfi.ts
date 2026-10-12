import { z } from "zod";
import { fetchText } from "@/lib/http";
import { parseDdMonYyyy, type IsoDate } from "@/lib/dates";
import { stripSchemeTypeWrapper, peerGroupFor, planInfo } from "@/lib/classify";

export const AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

export type AmfiScheme = {
  schemeCode: string;
  schemeName: string;
  amc: string;
  /** Category exactly as AMFI's section header has it, minus the "Open Ended Schemes(...)" wrapper. */
  category: string;
  schemeType: string;
  plan: string;
  option: string;
  nav: number | null;
  navDate: IsoDate | null;
};

const rowSchema = z.object({
  schemeCode: z.string().regex(/^\d+$/),
  schemeName: z.string().min(1),
  navRaw: z.string(),
  dateRaw: z.string(),
});

const HEADER_RE = /^(Open Ended|Close Ended|Interval Fund) Schemes?\(.*\)\s*$/i;

/** Parses NAVAll.txt. Handles both the 8-column (with Plan/Option) and older 6-column layouts. */
export function parseNavAll(text: string): AmfiScheme[] {
  const out: AmfiScheme[] = [];
  let category = "";
  let schemeType = "";
  let amc = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (HEADER_RE.test(line)) {
      schemeType = line.slice(0, line.indexOf("(")).trim();
      category = stripSchemeTypeWrapper(line);
      continue;
    }
    if (!line.includes(";")) {
      amc = line;
      continue;
    }
    const cols = line.split(";").map((c) => c.trim());
    if (cols[0] === "Scheme Code") continue;
    const eight = cols.length >= 8;
    const candidate = {
      schemeCode: cols[0],
      schemeName: cols[3] ?? "",
      navRaw: eight ? cols[6] : (cols[4] ?? ""),
      dateRaw: eight ? cols[7] : (cols[5] ?? ""),
    };
    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const nav = Number(parsed.data.navRaw);
    out.push({
      schemeCode: parsed.data.schemeCode,
      schemeName: parsed.data.schemeName,
      amc,
      category,
      schemeType,
      plan: eight ? cols[4] : "",
      option: eight ? cols[5] : "",
      nav: Number.isFinite(nav) && nav > 0 ? nav : null,
      navDate: parseDdMonYyyy(parsed.data.dateRaw),
    });
  }
  return out;
}

export async function fetchNavAll(): Promise<AmfiScheme[]> {
  const text = await fetchText(AMFI_NAV_URL, { timeoutMs: 30_000 });
  const rows = parseNavAll(text);
  if (rows.length < 1000) throw new Error(`AMFI NAVAll.txt looked truncated (${rows.length} schemes parsed)`);
  return rows;
}

/** Direct Plan – Growth schemes that published a NAV recently, grouped by peer group. */
export function buildPeerGroups(rows: AmfiScheme[], asOf: IsoDate, maxStaleDays = 10): Map<string, AmfiScheme[]> {
  const cutoff = new Date(`${asOf}T00:00:00Z`).getTime() - maxStaleDays * 86_400_000;
  const groups = new Map<string, AmfiScheme[]>();
  for (const r of rows) {
    if (!r.schemeType.toLowerCase().startsWith("open ended")) continue;
    if (!r.navDate || new Date(`${r.navDate}T00:00:00Z`).getTime() < cutoff) continue;
    const p = planInfo(r.schemeName, r.plan, r.option);
    if (!p.isDirect || !p.isGrowth) continue;
    const key = peerGroupFor(r.category, r.schemeName);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return groups;
}
