import { describe, expect, it } from "vitest";
import { buildPeerGroups, parseNavAll } from "./amfi";
import { parseNavPoints } from "./mfapi";
import { parseGoogleNewsRss, selectHeadlines } from "./news";

const NAVALL = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Mid Cap Fund)

HDFC Mutual Fund

118989;INF179K01XQ0;-;HDFC Mid Cap Fund;Direct Plan;Growth Option;219.816;09-Oct-2026
118988;INF179K01XP2;INF179K01XR8;HDFC Mid Cap Fund;Direct Plan;IDCW Option;70.1;09-Oct-2026
105758;INF179K01CR2;-;HDFC Mid Cap Fund;Regular Plan;Growth Option;200.1;09-Oct-2026

Open Ended Schemes(Equity Schemes - Mid Cap Fund)

Kotak Mahindra Mutual Fund

119775;INF174K01LS2;-;Kotak Midcap Fund;Direct Plan;Growth;150.5;09-Oct-2026
111111;INF000000000;-;Old Merged Midcap Fund;Direct Plan;Growth;N.A.;02-May-2022
`;

describe("parseNavAll", () => {
  const rows = parseNavAll(NAVALL);

  it("parses rows with their AMC, category and dates", () => {
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ schemeCode: "118989", amc: "HDFC Mutual Fund", category: "Equity Scheme - Mid Cap Fund", plan: "Direct Plan", option: "Growth Option", nav: 219.816, navDate: "2026-10-09" });
    expect(rows[4].nav).toBeNull();
  });

  it("builds one peer group across both category spellings, Direct-Growth only, live schemes only", () => {
    const groups = buildPeerGroups(rows, "2026-10-09");
    expect(groups.get("Equity: Mid Cap")?.map((r) => r.schemeCode)).toEqual(["118989", "119775"]);
  });
});

describe("parseNavPoints", () => {
  it("sorts oldest first, converts DD-MM-YYYY, drops bad and zero NAVs, dedupes dates", () => {
    const pts = parseNavPoints([
      { date: "09-10-2026", nav: "105.14" },
      { date: "08-10-2026", nav: "104.01" },
      { date: "07-10-2026", nav: "0.00000" },
      { date: "31-02-2026", nav: "100" },
      { date: "08-10-2026", nav: "104.01" },
    ]);
    expect(pts).toEqual([
      { date: "2026-10-08", nav: 104.01 },
      { date: "2026-10-09", nav: 105.14 },
    ]);
  });
});

describe("news", () => {
  const rss = `<rss><channel>
    <item><title>Sensex, Nifty fall after RBI hikes repo rate - Mint</title><link>https://news.google.com/a</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate><source url="https://livemint.com">Mint</source></item>
    <item><title>Sensex &amp; Nifty fall after RBI hikes repo rate - ET</title><link>https://news.google.com/b</link><pubDate>Fri, 09 Oct 2026 11:00:00 GMT</pubDate><source url="https://et.com">ET</source></item>
    <item><title>Monsoon rainfall lifts FMCG stocks - BS</title><link>https://news.google.com/c</link><pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate><source url="https://bs.com">BS</source></item>
    <item><title>Rupee hits record low as FIIs pull out - Reuters</title><link>https://news.google.com/d</link><pubDate>Wed, 07 Oct 2026 10:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item>
    <item><title>Rupee hits record low as FIIs pull out - Reuters</title><link>https://news.google.com/e</link><pubDate>Wed, 30 Sep 2026 10:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item>
  </channel></rss>`;

  it("parses items and strips the source suffix", () => {
    const items = parseGoogleNewsRss(rss);
    expect(items[0]).toMatchObject({ title: "Sensex, Nifty fall after RBI hikes repo rate", source: "Mint" });
    expect(items[1].title).toBe("Sensex & Nifty fall after RBI hikes repo rate");
  });

  it("keeps the week only, dedupes near-identical titles, drops weather stories, numbers ids", () => {
    const picked = selectHeadlines(parseGoogleNewsRss(rss), "2026-10-03T00:00:00Z", "2026-10-10T00:00:00Z");
    expect(picked.map((h) => h.title)).toEqual(["Sensex & Nifty fall after RBI hikes repo rate", "Rupee hits record low as FIIs pull out"]);
    expect(picked.map((h) => h.id)).toEqual(["h1", "h2"]);
  });
});
