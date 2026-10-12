import { z } from "zod";
import { fetchJson, fetchText } from "@/lib/http";
import type { Headline } from "@/db/types";

export type RawArticle = { title: string; url: string; source: string; publishedAt: string };

export interface NewsProvider {
  name: string;
  fetch(fromIso: string, toIso: string): Promise<RawArticle[]>;
}

const MARKET_QUERY_TERMS = ["Nifty", "Sensex", "RBI", "FII", "inflation", "rupee"];

/* ---------- GNews ---------- */

const gnewsSchema = z.object({
  articles: z.array(
    z.looseObject({
      title: z.string(),
      url: z.string(),
      publishedAt: z.string(),
      source: z.looseObject({ name: z.string().nullish() }).nullish(),
    }),
  ),
});

export function gnewsProvider(apiKey: string): NewsProvider {
  return {
    name: "GNews",
    async fetch(fromIso, toIso) {
      const params = new URLSearchParams({
        q: MARKET_QUERY_TERMS.join(" OR "),
        lang: "en",
        country: "in",
        max: "10",
        sortby: "relevance",
        from: fromIso,
        to: toIso,
        apikey: apiKey,
      });
      const parsed = gnewsSchema.parse(await fetchJson(`https://gnews.io/api/v4/search?${params}`, { retries: 1 }));
      return parsed.articles.map((a) => ({ title: a.title, url: a.url, source: a.source?.name ?? "GNews", publishedAt: a.publishedAt }));
    },
  };
}

/* ---------- NewsData.io ---------- */

const newsDataSchema = z.object({
  status: z.string(),
  results: z
    .array(
      z.looseObject({
        title: z.string().nullish(),
        link: z.string().nullish(),
        source_name: z.string().nullish(),
        source_id: z.string().nullish(),
        pubDate: z.string().nullish(),
      }),
    )
    .nullish(),
});

export function newsDataProvider(apiKey: string): NewsProvider {
  return {
    name: "NewsData.io",
    async fetch() {
      // The free /latest endpoint only reaches back ~48 hours; Google News RSS fills the rest of the week.
      const params = new URLSearchParams({
        apikey: apiKey,
        country: "in",
        category: "business",
        language: "en",
        q: MARKET_QUERY_TERMS.join(" OR "),
      });
      const parsed = newsDataSchema.parse(await fetchJson(`https://newsdata.io/api/1/latest?${params}`, { retries: 1 }));
      if (parsed.status !== "success") throw new Error(`NewsData.io returned status "${parsed.status}"`);
      return (parsed.results ?? []).flatMap((r) =>
        r.title && r.link && r.pubDate
          ? [{ title: r.title, url: r.link, source: r.source_name ?? r.source_id ?? "NewsData.io", publishedAt: `${r.pubDate.replace(" ", "T")}Z` }]
          : [],
      );
    },
  };
}

/* ---------- Google News RSS (no key) ---------- */

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? decodeEntities(m[1]) : null;
}

export function parseGoogleNewsRss(xml: string): RawArticle[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.flatMap((item) => {
    const rawTitle = tag(item, "title");
    const url = tag(item, "link");
    const pub = tag(item, "pubDate");
    const source = tag(item, "source") ?? "Google News";
    if (!rawTitle || !url || !pub) return [];
    const published = new Date(pub);
    if (Number.isNaN(published.getTime())) return [];
    // Google appends " - Source Name" to every title.
    const suffix = ` - ${source}`;
    const title = rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle;
    return [{ title, url, source, publishedAt: published.toISOString() }];
  });
}

export const googleNewsRssProvider: NewsProvider = {
  name: "Google News RSS",
  async fetch() {
    const q = `(${MARKET_QUERY_TERMS.join(" OR ")}) when:7d`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
    return parseGoogleNewsRss(await fetchText(url, { retries: 2 }));
  },
};

export function configuredNewsProvider(env: { NEWSDATA_API_KEY?: string; GNEWS_API_KEY?: string }): NewsProvider | null {
  if (env.GNEWS_API_KEY) return gnewsProvider(env.GNEWS_API_KEY);
  if (env.NEWSDATA_API_KEY) return newsDataProvider(env.NEWSDATA_API_KEY);
  return null;
}

/* ---------- Selection ---------- */

const RELEVANCE: Array<[RegExp, number]> = [
  [/\b(nifty|sensex)\b/i, 3],
  [/\b(rbi|repo rate|monetary policy|mpc)\b/i, 3],
  [/\b(fii|fpi|foreign (portfolio )?investors?|dii)\b/i, 3],
  [/\b(inflation|cpi|wpi|gdp|fiscal)\b/i, 2],
  [/\b(rupee|forex|dollar)\b/i, 2],
  [/\b(crude|oil|fed|us yields?|bond yields?|treasury)\b/i, 2],
  [/\b(mid ?cap|small ?cap|large ?cap|stock market|markets?|equities)\b/i, 1],
  [/\b(sebi|mutual funds?|sip)\b/i, 1],
];

const NOISE = /\b(horoscope|cricket|bollywood|recipe|stocks to buy|buy or sell|top picks|multibagger|target price)\b/i;

// The product deliberately carries no weather content, so weather-driven headlines are dropped before Gemini sees them.
export const WEATHER_WORDS =
  /\b(weather\w*|monsoon\w*|rain(s|y|fall|ing|ed)?|cyclon\w*|storm\w*|flood\w*|drought\w*|heat ?waves?|imd|el ni[nñ]o|la ni[nñ]a|forecast\w*|sunny|sunshine|cloud\w*|thunder\w*|snow\w*|sky|skies|wind(y|s)?|fog\w*|hail\w*|breez\w*|climat\w*|tornado\w*|hurricane\w*|typhoon\w*)\b/i;

function words(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
}

function similar(a: Set<string>, b: Set<string>): boolean {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 && inter / union >= 0.5;
}

function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Keeps the most market-relevant, de-duplicated headlines inside the window. */
export function selectHeadlines(articles: RawArticle[], fromIso: string, toIso: string, limit = 10): Headline[] {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const scored = articles
    .filter((a) => {
      const t = new Date(a.publishedAt).getTime();
      return Number.isFinite(t) && t >= from && t <= to && !NOISE.test(a.title) && !WEATHER_WORDS.test(a.title);
    })
    .map((a) => ({ a, score: RELEVANCE.reduce((s, [re, w]) => s + (re.test(a.title) ? w : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || new Date(y.a.publishedAt).getTime() - new Date(x.a.publishedAt).getTime());

  const kept: Array<{ a: RawArticle; w: Set<string> }> = [];
  const seenUrls = new Set<string>();
  for (const { a } of scored) {
    const key = normaliseUrl(a.url);
    const w = words(a.title);
    if (seenUrls.has(key) || kept.some((k) => similar(k.w, w))) continue;
    seenUrls.add(key);
    kept.push({ a, w });
    if (kept.length >= limit) break;
  }
  return kept
    .sort((x, y) => new Date(y.a.publishedAt).getTime() - new Date(x.a.publishedAt).getTime())
    .map(({ a }, i) => ({ id: `h${i + 1}`, title: a.title, source: a.source, url: a.url, publishedAt: a.publishedAt }));
}

export type NewsResult = { headlines: Headline[]; providerLabel: string; errors: string[] };

/** Keyed provider first; Google News RSS tops up (or replaces it) so a week always has 8–10 headlines when news exists. */
export async function fetchWeekHeadlines(
  env: { NEWSDATA_API_KEY?: string; GNEWS_API_KEY?: string },
  fromIso: string,
  toIso: string,
): Promise<NewsResult> {
  const errors: string[] = [];
  const used: string[] = [];
  let articles: RawArticle[] = [];
  const primary = configuredNewsProvider(env);
  if (primary) {
    try {
      const got = await primary.fetch(fromIso, toIso);
      articles = got;
      used.push(primary.name);
    } catch (e) {
      errors.push(`${primary.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (selectHeadlines(articles, fromIso, toIso).length < 8) {
    try {
      articles = articles.concat(await googleNewsRssProvider.fetch(fromIso, toIso));
      used.push(googleNewsRssProvider.name);
    } catch (e) {
      errors.push(`${googleNewsRssProvider.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { headlines: selectHeadlines(articles, fromIso, toIso), providerLabel: used.join(" + ") || "none", errors };
}
