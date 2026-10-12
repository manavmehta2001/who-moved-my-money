import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { todayIST, type IsoDate } from "@/lib/dates";

const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.looseObject({ symbol: z.string(), currency: z.string().nullish(), exchangeTimezoneName: z.string().nullish() }),
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({
            quote: z.array(z.object({ close: z.array(z.number().nullable()).optional() })),
          }),
        }),
      )
      .nullable(),
    error: z.object({ code: z.string(), description: z.string() }).nullable().optional(),
  }),
});

export type IndexPoint = { date: IsoDate; value: number };

export type YahooRange = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

/** Daily closes for an index symbol (e.g. ^NSEI), oldest first, dated in the exchange's own timezone. */
export async function fetchYahooDaily(symbol: string, range: YahooRange = "2y"): Promise<{ currency: string; points: IndexPoint[] }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const parsed = chartSchema.parse(await fetchJson(url, { timeoutMs: 12_000, retries: 2, noRetryStatuses: [400, 401, 403, 404, 429] }));
  const result = parsed.chart.result?.[0];
  if (!result) throw new Error(`Yahoo returned no data for ${symbol}: ${parsed.chart.error?.description ?? "unknown error"}`);
  const tz = result.meta.exchangeTimezoneName ?? "Asia/Kolkata";
  const closes = result.indicators.quote[0]?.close ?? [];
  const byDate = new Map<IsoDate, number>();
  (result.timestamp ?? []).forEach((ts, i) => {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) return;
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts * 1000));
    byDate.set(date, close);
  });
  // Drop today's still-moving intraday bar so a weekly return never compares against a partial session.
  const today = todayIST();
  const points = [...byDate.entries()]
    .filter(([d]) => d < today)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }));
  if (points.length === 0) throw new Error(`Yahoo returned an empty series for ${symbol}`);
  return { currency: result.meta.currency ?? "INR", points };
}
