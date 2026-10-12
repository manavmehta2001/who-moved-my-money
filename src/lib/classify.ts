/**
 * Turns AMFI/mfapi category strings into stable peer groups and benchmark suggestions.
 * AMFI publishes the same SEBI category under several spellings ("Equity Scheme - Mid Cap Fund" and
 * "Equity Schemes - Mid Cap Fund"), so peers must be grouped on a normalised name.
 */

export type AssetClass = "equity" | "debt" | "hybrid" | "other";

export type CategoryInfo = {
  /** Readable, normalised SEBI category, e.g. "Equity: Mid Cap". */
  category: string;
  family: "Equity" | "Debt" | "Hybrid" | "Index" | "Overseas FoF" | "Domestic FoF" | "ETF" | "Solution" | "Other";
};

const FAMILY_RULES: Array<[RegExp, CategoryInfo["family"]]> = [
  [/exchange traded|\betfs?\b/i, "ETF"],
  [/index funds?/i, "Index"],
  [/fof overseas|fund of funds investing overseas|overseas fund of funds/i, "Overseas FoF"],
  [/fof domestic|fund of funds scheme \(domestic\)/i, "Domestic FoF"],
  [/^equity/i, "Equity"],
  [/^(debt|income\/debt|income|gilt|money market)/i, "Debt"],
  [/^hybrid/i, "Hybrid"],
  [/^solution|children|retirement/i, "Solution"],
];

const SUB_ALIASES: Array<[RegExp, string]> = [
  [/^elss.*$/i, "ELSS"],
  [/^(sectoral\/ ?thematic|sectoral|thematic)$/i, "Sectoral/Thematic"],
  [/balanced advantage|dynamic asset allocation/i, "Balanced Advantage"],
  [/^banking and psu( debt)?$/i, "Banking and PSU"],
  [/^multi asset allocation$/i, "Multi Asset Allocation"],
  [/^equity savings$/i, "Equity Savings"],
];

/** AMFI's older "Income/Debt Oriented Schemes - … Term Fund" names for the SEBI debt categories. Checked against NAVAll.txt on 12 Oct 2026. */
const DEBT_ALIASES: Array<[RegExp, string]> = [
  [/^ultra short to short term$/i, "Low Duration"],
  [/^ultra short term$/i, "Ultra Short Duration"],
  [/^short term$/i, "Short Duration"],
  [/^medium to long term$/i, "Medium to Long Duration"],
  [/^medium term$/i, "Medium Duration"],
  [/^long term$/i, "Long Duration"],
  [/^dynamic term$/i, "Dynamic Bond"],
  [/^floating interest rates$/i, "Floater"],
  [/^10-year constant maturity gilt$/i, "Gilt with 10 Year Constant Duration"],
];

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function stripSchemeTypeWrapper(raw: string): string {
  const m = /^(?:Open Ended|Close Ended|Interval Fund) Schemes?\((.*)\)\s*$/i.exec(raw.trim());
  return (m ? m[1] : raw).replace(/\s+/g, " ").trim();
}

export function normaliseCategory(raw: string): CategoryInfo {
  const clean = stripSchemeTypeWrapper(raw).replace(/[’']/g, "");
  const family = FAMILY_RULES.find(([re]) => re.test(clean))?.[1] ?? "Other";
  const dash = clean.indexOf(" - ");
  let sub = dash >= 0 ? clean.slice(dash + 3).trim() : clean;
  sub = sub.replace(/\s+funds?$/i, "").trim();
  const alias = SUB_ALIASES.find(([re]) => re.test(sub)) ?? (family === "Debt" ? DEBT_ALIASES.find(([re]) => re.test(sub)) : undefined);
  if (alias) sub = alias[1];
  else sub = titleCase(sub.toLowerCase()).replace(/\bAnd\b/g, "and").replace(/\bTo\b/g, "to").replace(/\bPsu\b/g, "PSU");

  switch (family) {
    case "Index":
      return { family, category: "Index fund" };
    case "Overseas FoF":
      return { family, category: "Overseas fund of funds" };
    case "Domestic FoF":
      return { family, category: "Domestic fund of funds" };
    case "Equity":
    case "Debt":
    case "Hybrid":
      return { family, category: `${family}: ${sub}` };
    default:
      return { family, category: `${family}: ${sub}` };
  }
}

type IndexMatcher = { key: string; label: string; include: RegExp; exclude?: RegExp };

/** Ordered: first match wins. Excludes keep strategy/factor variants out of the plain-index peer set. */
export const INDEX_MATCHERS: IndexMatcher[] = [
  { key: "niftynext50", label: "Nifty Next 50", include: /next\s*50/i, exclude: /equal|value|quality|momentum|alpha|low\s*vol/i },
  { key: "nifty500", label: "Nifty 500", include: /\bnifty\s*500\b/i, exclude: /momentum|value|quality|low\s*vol|multi\s*cap|equal|flexi\s*cap|alpha|manufacturing|infrastructure|shariah/i },
  { key: "nifty50", label: "Nifty 50", include: /\bnifty\s*50\b/i, exclude: /next|equal|value|quality|momentum|low\s*vol|alpha|shariah|dividend|esg|\b50\s*:/i },
  { key: "sensex", label: "BSE Sensex", include: /\bsensex\b/i, exclude: /next/i },
  { key: "midcap150", label: "Nifty Midcap 150", include: /mid\s*cap\s*150/i, exclude: /quality|momentum|alpha|value|low\s*vol/i },
  { key: "smallcap250", label: "Nifty Smallcap 250", include: /small\s*cap\s*250/i, exclude: /quality|momentum|value|alpha|low\s*vol/i },
  { key: "nasdaq100", label: "Nasdaq 100", include: /nasdaq\s*-?\s*100/i },
  { key: "sp500", label: "S&P 500", include: /s\s*&\s*p\s*500/i, exclude: /top\s*50/i },
];

export function matchIndex(schemeName: string): IndexMatcher | null {
  return INDEX_MATCHERS.find((m) => m.include.test(schemeName) && !(m.exclude && m.exclude.test(schemeName))) ?? null;
}

const US_EQUITY = /\bU\.?\s?S\.?\b|nasdaq|s\s*&\s*p\s*500|americ/i;
const EX_US = /\bex[-\s]?u\.?\s?s\b/i;
const DEBTISH_NAME = /treasury|bond|debt|gilt|\bsdl\b|g-?sec|psu|corporate|crisil|money market|liquid/i;

export function isDebtLikeName(name: string): boolean {
  return DEBTISH_NAME.test(name);
}

export function peerGroupFor(categoryRaw: string, schemeName: string): string {
  const info = normaliseCategory(categoryRaw);
  if (info.family === "Index") {
    const m = matchIndex(schemeName);
    return m ? `Index fund: ${m.label}` : `Index fund: ${isDebtLikeName(schemeName) ? "debt" : "other"}`;
  }
  if (info.family === "Overseas FoF") {
    if (isDebtLikeName(schemeName)) return "Overseas fund of funds: debt";
    return US_EQUITY.test(schemeName) && !EX_US.test(schemeName) ? "Overseas fund of funds: US equity" : "Overseas fund of funds: other";
  }
  return info.category;
}

export function assetClassFor(categoryRaw: string, schemeName: string): AssetClass {
  const { family } = normaliseCategory(categoryRaw);
  if (family === "Equity") return "equity";
  if (family === "Debt") return "debt";
  if (family === "Hybrid") return "hybrid";
  if (family === "Index" || family === "Overseas FoF" || family === "ETF" || family === "Domestic FoF") {
    return isDebtLikeName(schemeName) ? "debt" : "equity";
  }
  return "other";
}

/** Suggests a benchmark key from the `benchmarks` table, or null when no public benchmark exists. */
export function suggestBenchmark(categoryRaw: string, schemeName: string): string | null {
  const info = normaliseCategory(categoryRaw);
  if (info.family === "Index" || info.family === "ETF") {
    const m = matchIndex(schemeName);
    if (m && ["nifty50", "nifty500", "midcap150", "smallcap250", "nasdaq100", "sp500"].includes(m.key)) return m.key;
    return null;
  }
  if (info.family === "Overseas FoF") {
    if (isDebtLikeName(schemeName)) return null;
    if (EX_US.test(schemeName)) return null;
    if (/nasdaq|tech/i.test(schemeName)) return "nasdaq100";
    if (US_EQUITY.test(schemeName)) return "sp500";
    return null;
  }
  if (info.family === "Equity") {
    const sub = info.category.toLowerCase();
    if (/large (and|&) mid cap/.test(sub)) return "nifty500";
    if (/large cap/.test(sub)) return "nifty50";
    if (/mid cap/.test(sub)) return "midcap150";
    if (/small cap/.test(sub)) return "smallcap250";
    // Flexi/multi cap, ELSS, focused, value, contra, sectoral: the broad market is the fairest public yardstick.
    return "nifty500";
  }
  return null;
}

const NOT_GROWTH = /idcw|dividend|bonus|payout|reinvest|segregated|income distribution/i;

export type PlanInfo = { isDirect: boolean; isRegular: boolean; isGrowth: boolean };

/** Uses AMFI's Plan/Option columns when present, otherwise the scheme name. */
export function planInfo(schemeName: string, plan = "", option = ""): PlanInfo {
  const isDirect = /direct/i.test(plan || schemeName);
  const isGrowth = /growth/i.test(option || schemeName) && !NOT_GROWTH.test(`${schemeName} ${option}`);
  return { isDirect, isRegular: !isDirect, isGrowth };
}
