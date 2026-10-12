import { WEATHER_WORDS } from "@/lib/sources/news";
import { allowedPercentages, type FactSheet } from "./factSheet";
import { reportOutputSchema, type ReportOutput } from "./schema";

/** Percentages in prose may differ from the fact sheet by at most this many percentage points. */
export const PERCENT_TOLERANCE = 0.05;

const ABBREVIATIONS = /\b(?:U\.S|U\.K|Rs|vs|e\.g|i\.e|Inc|Ltd|Co|No|Mr|Mrs|Ms|Dr|St|approx)\./gi;
const DOUBLE_NEGATIVE = /\b(fell|dropped|declined|lost|slipped|down|dipped|shed|trailed|lagged|behind)\s+(?:by\s+)?[-−]\s?\d/i;
const BANNED_ADVICE = /\b(buy|buying|sell|selling|redeem|redeeming|redemption|switch|switching)\b/i;

/** Counts sentences, ignoring full stops inside numbers ("1.82%") and common abbreviations. */
export function countSentences(text: string): number {
  const cleaned = text
    .replace(ABBREVIATIONS, (m) => m.replace(/\./g, ""))
    .replace(/(\d)\.(\d)/g, "$1,$2")
    .trim();
  return cleaned.split(/[.!?]+(?=\s|$|["'”’)])/).filter((s) => /[A-Za-z]/.test(s)).length;
}

/** Every number written as a percentage or percentage points, in absolute value. */
export function extractPercentages(text: string): number[] {
  const re = /([+\-−]?\d+(?:\.\d+)?)\s*(%|per\s?cent\b|percentage points?\b|pp\b)/gi;
  return [...text.matchAll(re)].map((m) => Math.abs(Number(m[1].replace("−", "-"))));
}

export type GuardResult = { ok: true; output: ReportOutput; errors: [] } | { ok: false; output: ReportOutput | null; errors: string[] };

export function checkReport(raw: unknown, sheet: FactSheet): GuardResult {
  const parsed = reportOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, output: null, errors: [`The JSON did not match the required shape: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`] };
  }
  const out = parsed.data;
  const errors: string[] = [];

  if (out.verdict !== sheet.verdict) errors.push(`"verdict" must be exactly "${sheet.verdict}" (you wrote "${out.verdict}").`);

  const expected = sheet.funds.map((f) => f.schemeCode);
  const got = out.funds.map((f) => f.schemeCode);
  const missing = expected.filter((c) => !got.includes(c));
  const extra = got.filter((c) => !expected.includes(c));
  if (missing.length) errors.push(`Missing funds: ${missing.join(", ")}. Write one entry per fund in the fact sheet.`);
  if (extra.length) errors.push(`Unknown schemeCodes: ${extra.join(", ")}. Use only the codes in the fact sheet.`);
  if (new Set(got).size !== got.length) errors.push("Each fund must appear exactly once.");

  const headlineIds = new Set(sheet.headlines.map((h) => h.id));
  for (const f of out.funds) {
    const n = countSentences(f.summary);
    if (n !== 3) errors.push(`Summary for ${f.schemeCode} has ${n} sentences; it must have exactly 3.`);
    const badIds = f.citedHeadlineIds.filter((id) => !headlineIds.has(id));
    if (badIds.length) errors.push(`Summary for ${f.schemeCode} cites headline ids that don't exist: ${badIds.join(", ")}.`);
  }

  const allowedAll = allowedPercentages(sheet);
  const texts: Array<[string, string, number[]]> = [
    ["headline", out.headline, allowedAll],
    ["verdictReason", out.verdictReason, allowedAll],
    ...out.funds.map((f) => [`summary for ${f.schemeCode}`, f.summary, allowedPercentages(sheet, f.schemeCode)] as [string, string, number[]]),
  ];
  for (const [where, text, allowed] of texts) {
    for (const v of extractPercentages(text)) {
      if (!allowed.some((a) => Math.abs(a - v) <= PERCENT_TOLERANCE + 1e-9)) {
        errors.push(`The ${where} says ${v}% but no such number is in the fact sheet. Use only fact-sheet numbers.`);
      }
    }
    const dn = DOUBLE_NEGATIVE.exec(text);
    if (dn) errors.push(`The ${where} writes "${dn[0]}…". Drop the minus sign after "${dn[1]}"; the verb already says it went down.`);
    const advice = BANNED_ADVICE.exec(text);
    if (advice) errors.push(`The ${where} uses the word "${advice[1]}". Never tell Meera to buy, sell, redeem or switch; say "keep an eye on" or "talk to your advisor".`);
    const weather = WEATHER_WORDS.exec(text);
    if (weather) errors.push(`The ${where} uses the word "${weather[0]}". No weather or nature words at all.`);
  }

  return errors.length ? { ok: false, output: out, errors } : { ok: true, output: out, errors: [] };
}
