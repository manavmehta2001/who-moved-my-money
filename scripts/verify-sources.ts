import "./_env";
import { fetchScheme, searchSchemes, SchemeNotFoundError } from "@/lib/sources/mfapi";
import { fetchNavAll, buildPeerGroups } from "@/lib/sources/amfi";
import { fetchYahooDaily } from "@/lib/sources/yahoo";
import { BENCHMARKS } from "@/lib/sources/benchmarkCatalog";
import { configuredNewsProvider, fetchWeekHeadlines, googleNewsRssProvider } from "@/lib/sources/news";
import { peerGroupFor, suggestBenchmark } from "@/lib/classify";
import { addDays, todayIST } from "@/lib/dates";
import { geminiModel } from "@/lib/env";
import { chatJson, modelExists } from "@/lib/gemini/openrouter";
import { SEED_FUNDS } from "./seedFunds";

// Hits every external source the app depends on, prints a sample, and exits non-zero if a required one fails.
// Optional sources (a news API key, Gemini before a key exists, a Yahoo symbol) are reported but don't fail the run.

type Outcome = "pass" | "fail" | "warn" | "skip";
const results: Array<{ name: string; outcome: Outcome; note: string }> = [];

async function check(name: string, required: boolean, fn: () => Promise<string>) {
  try {
    const note = await fn();
    results.push({ name, outcome: "pass", note });
    console.log(`✓ ${name}\n    ${note.replace(/\n/g, "\n    ")}`);
  } catch (e) {
    const note = e instanceof Error ? e.message : String(e);
    results.push({ name, outcome: required ? "fail" : "warn", note });
    console.log(`${required ? "✗" : "!"} ${name}\n    ${note}`);
  }
}

function skip(name: string, note: string) {
  results.push({ name, outcome: "skip", note });
  console.log(`- ${name}\n    skipped: ${note}`);
}

async function main() {
  console.log(`Verifying data sources · ${todayIST()} (Asia/Kolkata)\n`);

  console.log("mfapi.in — seed funds");
  for (const f of SEED_FUNDS) {
    await check(`mfapi ${f.schemeCode} (${f.role})`, true, async () => {
      const s = await fetchScheme(f.schemeCode);
      const last = s.navs.at(-1)!;
      if (last.date < addDays(todayIST(), -10)) throw new Error(`${s.name}: latest NAV is ${last.date} — the scheme looks merged or closed`);
      return `${s.name}\n${s.category} · ${s.navs.length} NAVs from ${s.navs[0].date} · latest ₹${last.nav} on ${last.date}`;
    });
  }

  console.log("\nmfapi.in — benchmark proxy funds");
  for (const b of BENCHMARKS.filter((x) => x.sourceType === "mf_proxy")) {
    await check(`proxy ${b.key} → ${b.sourceRef}`, true, async () => {
      const s = await fetchScheme(b.sourceRef);
      if (s.navs.at(-1)!.date < addDays(todayIST(), -10)) throw new Error(`${s.name}: latest NAV is ${s.navs.at(-1)!.date}`);
      if (s.name.toLowerCase().replace(/\s+/g, " ") !== b.sourceName.toLowerCase().replace(/\s+/g, " ")) {
        throw new Error(`Name changed: expected "${b.sourceName}", got "${s.name}"`);
      }
      const last = s.navs.at(-1)!;
      return `${s.name} · ${s.navs.length} NAVs from ${s.navs[0].date} · latest ${last.date}`;
    });
  }

  console.log("\nmfapi.in — search and bad input");
  await check("mfapi search", true, async () => {
    const hits = await searchSchemes("Nifty Midcap 150 Index Fund Direct Growth");
    if (hits.length === 0) throw new Error("Search returned nothing");
    return hits.slice(0, 3).map((h) => `${h.schemeCode} ${h.schemeName}`).join("\n");
  });
  await check("mfapi unknown code is rejected", true, async () => {
    try {
      await fetchScheme("999999");
    } catch (e) {
      if (e instanceof SchemeNotFoundError) return "999999 → SchemeNotFoundError (mfapi answers 200 with empty meta)";
      throw e;
    }
    throw new Error("Unknown code was accepted");
  });

  console.log("\nAMFI NAVAll.txt");
  await check("AMFI NAVAll.txt parse + peer groups", true, async () => {
    const rows = await fetchNavAll();
    const latest = rows.reduce((m, r) => (r.navDate && r.navDate > m ? r.navDate : m), "0000-00-00");
    const groups = buildPeerGroups(rows, latest);
    const lines = [`${rows.length} schemes, latest NAV date ${latest}, ${groups.size} peer groups`];
    for (const f of SEED_FUNDS) {
      const row = rows.find((r) => r.schemeCode === f.schemeCode);
      if (!row) throw new Error(`Seed fund ${f.schemeCode} is missing from AMFI`);
      const group = peerGroupFor(row.category, row.schemeName);
      const peers = groups.get(group) ?? [];
      if (peers.length < 3) throw new Error(`Only ${peers.length} peers for "${group}" (${f.schemeCode})`);
      lines.push(`${f.schemeCode}: "${row.category}" → "${group}" (${peers.length} Direct-Growth peers) · benchmark ${suggestBenchmark(row.category, row.schemeName) ?? "none"}`);
    }
    return lines.join("\n");
  });

  console.log("\nYahoo Finance (secondary benchmark source)");
  for (const b of BENCHMARKS.filter((x) => x.sourceType === "yahoo")) {
    await check(`yahoo ${b.sourceRef} (${b.label})`, false, async () => {
      const { points, currency } = await fetchYahooDaily(b.sourceRef, "1mo");
      const last = points.at(-1)!;
      return `${points.length} closes · latest ${last.value.toFixed(2)} ${currency} on ${last.date}`;
    });
  }
  await check("yahoo NIFTYSMLCAP100.NS (Smallcap 100, expected unavailable)", false, async () => {
    try {
      await fetchYahooDaily("NIFTYSMLCAP100.NS", "1mo");
      return "Now available — consider switching the market strip to Smallcap 100";
    } catch {
      return "Still not available on Yahoo; market strip keeps Smallcap 250";
    }
  });

  console.log("\nNews");
  const newsEnv = { NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY || undefined, GNEWS_API_KEY: process.env.GNEWS_API_KEY || undefined };
  const to = new Date().toISOString();
  const from = new Date(`${addDays(todayIST(), -7)}T00:00:00+05:30`).toISOString();
  await check("Google News RSS (no key)", true, async () => {
    const items = await googleNewsRssProvider.fetch(from, to);
    if (items.length === 0) throw new Error("RSS returned no items");
    return `${items.length} items · e.g. "${items[0].title}" — ${items[0].source}`;
  });
  const provider = configuredNewsProvider(newsEnv);
  if (provider) {
    await check(`${provider.name} (keyed)`, false, async () => {
      const items = await provider.fetch(from, to);
      return `${items.length} items · e.g. "${items[0]?.title ?? "(none)"}"`;
    });
  } else skip("NewsData.io / GNews", "no NEWSDATA_API_KEY or GNEWS_API_KEY set; Google News RSS will be used");
  await check("Weekly headline selection", true, async () => {
    const r = await fetchWeekHeadlines(newsEnv, from, to);
    if (r.headlines.length < 5) throw new Error(`Only ${r.headlines.length} usable headlines`);
    return `${r.headlines.length} headlines via ${r.providerLabel}\n${r.headlines.slice(0, 4).map((h) => `${h.id}: ${h.title} — ${h.source}`).join("\n")}`;
  });

  console.log("\nGemini (via OpenRouter)");
  if (process.env.OPENROUTER_API_KEY) {
    await check(`OpenRouter lists ${geminiModel()}`, true, async () => {
      if (!(await modelExists(geminiModel()))) throw new Error(`${geminiModel()} is missing; pick the closest google/ model`);
      return "Model is listed";
    });
    await check(`Gemini ${geminiModel()} (Google-served only)`, true, async () => {
      const t = Date.now();
      const r = await chatJson({
        apiKey: process.env.OPENROUTER_API_KEY!,
        model: geminiModel(),
        system: "Answer in JSON.",
        user: 'Reply with {"ok": true}.',
        schemaName: "ping",
        schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
        maxTokens: 512,
      });
      return `${r.text.trim()} in ${Date.now() - t} ms · provider ${r.provider} · tokens ${r.tokensIn}/${r.tokensOut} · cost ${r.cost}`;
    });
  } else skip("Gemini via OpenRouter", "OPENROUTER_API_KEY not set");

  console.log("\nDatabase");
  if (process.env.DATABASE_URL) {
    await check("Neon Postgres", true, async () => {
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(process.env.DATABASE_URL!);
      const rows = (await sql`select version() as v, now() as t`) as Array<{ v: string; t: string }>;
      return `${rows[0].v.split(" ").slice(0, 2).join(" ")} · server time ${rows[0].t}`;
    });
  } else skip("Neon Postgres", "DATABASE_URL not set yet");

  const failed = results.filter((r) => r.outcome === "fail");
  const counts = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  console.log(`\n${counts("pass")} passed · ${failed.length} failed · ${counts("warn")} warnings · ${counts("skip")} skipped`);
  if (failed.length) {
    console.log("Failed:\n" + failed.map((f) => `  ${f.name}: ${f.note}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
