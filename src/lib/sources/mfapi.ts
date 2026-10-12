import { z } from "zod";
import { fetchJson, HttpError } from "@/lib/http";
import { parseDdMmYyyy, type IsoDate } from "@/lib/dates";

const BASE = "https://api.mfapi.in/mf";

const schemeResponseSchema = z.object({
  meta: z.looseObject({
    fund_house: z.string().nullish(),
    scheme_type: z.string().nullish(),
    scheme_category: z.string().nullish(),
    scheme_code: z.union([z.number(), z.string()]).nullish(),
    scheme_name: z.string().nullish(),
  }),
  data: z.array(z.object({ date: z.string(), nav: z.string() })),
  status: z.string().optional(),
});

const searchResponseSchema = z.array(
  z.object({ schemeCode: z.union([z.number(), z.string()]), schemeName: z.string() }),
);

export type NavPoint = { date: IsoDate; nav: number };

export type SchemeData = {
  schemeCode: string;
  name: string;
  amc: string;
  category: string;
  schemeType: string;
  /** Oldest first, invalid/zero NAVs dropped. */
  navs: NavPoint[];
};

export class SchemeNotFoundError extends Error {
  constructor(readonly schemeCode: string) {
    super(`No scheme found with code ${schemeCode}`);
    this.name = "SchemeNotFoundError";
  }
}

export function isValidSchemeCode(code: string): boolean {
  return /^\d{3,7}$/.test(code.trim());
}

export function parseNavPoints(data: Array<{ date: string; nav: string }>): NavPoint[] {
  const byDate = new Map<IsoDate, number>();
  for (const row of data) {
    const date = parseDdMmYyyy(row.date);
    const nav = Number(row.nav);
    if (date && Number.isFinite(nav) && nav > 0) byDate.set(date, nav);
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, nav]) => ({ date, nav }));
}

export async function fetchScheme(schemeCode: string): Promise<SchemeData> {
  const code = schemeCode.trim();
  if (!isValidSchemeCode(code)) throw new SchemeNotFoundError(code);
  let raw: unknown;
  try {
    raw = await fetchJson(`${BASE}/${code}`, { timeoutMs: 20_000 });
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) throw new SchemeNotFoundError(code);
    throw e;
  }
  const parsed = schemeResponseSchema.parse(raw);
  const name = parsed.meta.scheme_name?.trim() ?? "";
  // mfapi answers unknown codes with HTTP 200, empty meta and no data.
  if (!name || parsed.data.length === 0) throw new SchemeNotFoundError(code);
  return {
    schemeCode: code,
    name,
    amc: parsed.meta.fund_house?.trim() ?? "",
    category: parsed.meta.scheme_category?.trim() ?? "",
    schemeType: parsed.meta.scheme_type?.trim() ?? "",
    navs: parseNavPoints(parsed.data),
  };
}

export async function searchSchemes(query: string): Promise<Array<{ schemeCode: string; schemeName: string }>> {
  const q = query.trim();
  if (q.length < 2) return [];
  const raw = await fetchJson(`${BASE}/search?q=${encodeURIComponent(q)}`, { timeoutMs: 10_000, retries: 1 });
  return searchResponseSchema.parse(raw).map((r) => ({ schemeCode: String(r.schemeCode), schemeName: r.schemeName.trim() }));
}
