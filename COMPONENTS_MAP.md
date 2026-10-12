# Components map — Who Moved My Money?

How data flows from public sources to Meera's Saturday check-in. Live app: https://who-moved-my-money.vercel.app

## Architecture

```mermaid
flowchart LR
  subgraph Sources["Public data sources"]
    MF["mfapi.in<br/>NAV history + search"]
    AMFI["AMFI NAVAll.txt<br/>categories + daily NAVs"]
    YF["Yahoo Finance<br/>index levels"]
    NEWS["GNews / NewsData.io<br/>+ Google News RSS"]
  end

  subgraph Jobs["Ingestion jobs (Vercel Cron + scripts)"]
    DAILY["Daily NAV job<br/>/api/cron/daily-nav"]
    SAT["Saturday job<br/>/api/cron/saturday-report"]
    BF["Backfill<br/>npm run backfill · /api/admin/backfill"]
    ADD["Add fund<br/>POST /api/funds"]
  end

  subgraph DB["Neon Postgres (Drizzle)"]
    T_FUNDS[("funds")]
    T_NAV[("nav_history")]
    T_BM[("benchmarks +<br/>benchmark_history")]
    T_PEERS[("category_peers")]
    T_SNAP[("weekly_snapshots")]
    T_MC[("market_context")]
    T_REP[("reports")]
    T_JOBS[("job_runs")]
  end

  subgraph Engine["Deterministic engine (no AI)"]
    RET["Returns<br/>week · 1M · YTD"]
    CAT["Category average"]
    DEC["Who moved my money?<br/>market · funds like yours · choices"]
    VER["Verdict engine<br/>flags · drift · worry score"]
  end

  subgraph AI["Gemini Flash (writer only)"]
    FS["Fact sheet<br/>rounded numbers + headlines"]
    GEM["Gemini<br/>JSON responseSchema"]
    GUARD["Hallucination guard<br/>3 sentences · % ±0.05 pp · verdict"]
    TPL["Template fallback<br/>'written without AI'"]
  end

  subgraph UI["Next.js pages"]
    P_HOME["/ This Saturday"]
    P_FUNDS["/funds My funds"]
    P_HIST["/history Past Saturdays"]
    P_STAT["/status Data status"]
  end

  MF --> BF & ADD & SAT
  AMFI --> DAILY & SAT & BF & ADD
  YF --> DAILY & SAT & BF
  NEWS --> SAT

  DAILY --> T_NAV & T_BM
  BF --> T_NAV & T_BM & T_PEERS & T_SNAP
  ADD --> T_FUNDS & T_NAV & T_PEERS & T_SNAP
  SAT --> T_NAV & T_BM & T_PEERS & T_MC
  DAILY & SAT & BF & ADD --> T_JOBS

  T_NAV & T_BM & T_PEERS --> RET --> CAT --> DEC --> T_SNAP
  T_SNAP --> VER
  VER & T_MC --> FS --> GEM --> GUARD
  GUARD -- "passes" --> T_REP
  GUARD -- "fails twice" --> TPL --> T_REP

  T_REP & T_SNAP & T_MC --> P_HOME
  T_FUNDS --> P_FUNDS
  T_REP & T_SNAP --> P_HIST
  T_JOBS & T_NAV & T_BM & T_MC & T_REP --> P_STAT
```

## Components

| Component | File path | Responsibility | Inputs | Outputs | External dependency |
|---|---|---|---|---|---|
| Env validation | `src/lib/env.ts`, `src/instrumentation.ts` | Fail fast on boot with a readable message if required env vars are missing | `process.env` | Typed config | zod |
| DB schema & migrations | `src/db/schema.ts`, `src/db/migrations/` | The 9 tables from the brief (plus peer group, asset class, latency columns) | — | Tables, types | Neon Postgres, Drizzle ORM |
| DB client | `src/db/client.ts` | Neon serverless HTTP connection | `DATABASE_URL` | Drizzle instance | `@neondatabase/serverless` |
| Queries & job log | `src/db/queries.ts` | Chunked upserts, series reads, peer-group replace, `withJobRun` (job_runs rows with timings/warnings/errors) | Rows | Rows, job_runs | Neon |
| HTTP helper | `src/lib/http.ts` | Timeouts, retries with backoff, concurrency limit (≤5) | URL | Response | `fetch` |
| Dates | `src/lib/dates.ts` | Asia/Kolkata dates, Fridays, month/year arithmetic, source date formats | Dates | ISO dates | — |
| mfapi client | `src/lib/sources/mfapi.ts` | Scheme meta + NAV history; search; unknown-code detection | Scheme code / query | `SchemeData` | mfapi.in |
| AMFI client | `src/lib/sources/amfi.ts` | Parse NAVAll.txt; build Direct-Growth peer groups | NAVAll.txt | Schemes, peer groups | AMFI |
| Classifier | `src/lib/classify.ts` | Normalise AMFI's duplicate category names; peer group per fund; asset class; benchmark suggestion; plan/option detection | Category, scheme name | Peer group, benchmark key | — |
| Benchmark catalogue | `src/lib/sources/benchmarkCatalog.ts` | Verified index-fund proxies (TRI approx.) + Yahoo fallbacks + market strip | — | Benchmark definitions | — |
| Yahoo client | `src/lib/sources/yahoo.ts` | Daily index closes (drops today's partial bar) | Symbol | Points | Yahoo Finance |
| News client | `src/lib/sources/news.ts` | Provider interface (GNews / NewsData.io), Google News RSS top-up, dedupe, relevance ranking, weather filter | Date window, keys | 8–10 headlines with ids | GNews, NewsData.io, Google News |
| Fund lookup | `src/lib/funds/lookup.ts` | Live preview for the add form; warnings (IDCW, Regular, stale, missing from AMFI) | Scheme code | `FundPreview` | mfapi, AMFI |
| Fund registry | `src/lib/funds/register.ts` | Add / re-activate / soft-delete funds | Code, benchmark, SIP, units | `funds` row | Neon |
| Ingest | `src/lib/jobs/ingest.ts` | Benchmark sync, peer refresh, fund + peer history, AMFI daily upsert | Active funds | nav_history, benchmark_history, category_peers | mfapi, AMFI, Yahoo |
| Backfill | `src/lib/jobs/backfill.ts`, `scripts/backfill.ts`, `/api/admin/backfill` | Full history + 12 weekly snapshots (+ latest report); resumable | — | Rows | as Ingest |
| Returns | `src/lib/engine/returns.ts` | Week / 1M / YTD from the last NAV on or before each date; YTD-from-launch flag | Series, week | Returns | — |
| Category average | `src/lib/engine/categoryAverage.ts` | Equal-weighted peer mean, excluding self, missing data and implausible values | Peer series | Average + count | — |
| Decomposition | `src/lib/engine/decomposition.ts` | market / funds like yours / your fund's choices; dominant driver | Fund, benchmark, category returns | Parts summing to the fund return | — |
| Verdict engine | `src/lib/engine/verdict.ts`, `src/config/verdict.ts` | Flags (persistence, noise band, debt vs similar funds), allocation drift, portfolio verdict, worry score | Weekly facts, holdings | Verdict, reason, score | — |
| Snapshots | `src/lib/engine/snapshots.ts`, `src/lib/jobs/snapshots.ts` | Per fund per week: returns, split, flags, provenance; idempotent upsert | Stored series | weekly_snapshots | Neon |
| Market context | `src/lib/jobs/marketContext.ts` | Weekly index moves + headlines, fetched once per week | Week | market_context | Yahoo, news |
| Fact sheet | `src/lib/gemini/factSheet.ts` | Compact JSON of rounded numbers for Gemini; allowed-percentage lists | Snapshots, verdict, news | `FactSheet` | — |
| Prompt & schema | `src/lib/gemini/prompt.ts`, `src/lib/gemini/schema.ts` | System instruction; zod + Gemini `responseSchema` | Fact sheet | Prompt, schema | — |
| Hallucination guard | `src/lib/gemini/hallucinationGuard.ts` | JSON shape, 3 sentences, verdict, % within ±0.05 pp per fund, headline ids, advice/weather words | Gemini output, fact sheet | ok / errors | — |
| Template fallback | `src/lib/gemini/templateFallback.ts` | Deterministic report that always passes the guard | Fact sheet | Report | — |
| Writer | `src/lib/gemini/writer.ts` | Gemini call → guard → one retry with errors → template; tokens, latency, retries | Fact sheet | `WrittenReport` | Gemini (`@google/genai`) |
| Report job | `src/lib/jobs/report.ts`, `scripts/report.ts` | Load snapshots, verdict, context, write, upsert `reports` | Week | reports | Neon, Gemini |
| Scheduled jobs | `src/lib/jobs/scheduled.ts`, `src/lib/jobs/runners.ts` | Daily NAV; Saturday report; one weekly run at a time | — | JSON result, job_runs | all sources |
| Cron routes | `src/app/api/cron/*/route.ts`, `vercel.json` | `CRON_SECRET`-protected entry points, `maxDuration` | Vercel Cron | JSON | Vercel |
| Admin & funds API | `src/app/api/admin/*`, `src/app/api/funds/*`, `src/lib/auth/passcode.ts`, `src/lib/api.ts` | Passcode session (HMAC cookie), run-now, backfill, add/remove/patch funds, rate-limited lookup | HTTP | JSON | — |
| Status API | `src/app/api/status/check/route.ts` | Live health check of Neon, mfapi, AMFI, Yahoo, news, Gemini | HTTP | Check list | all sources |
| Page data | `src/lib/data/views.ts` | Server-side view models for the four pages | Neon | Views | Neon |
| Check-in page | `src/app/page.tsx`, `src/components/checkin/*` | Verdict, worry dial, per-fund summary + waterfall + sparkline + table, market strip, share | Check-in view | HTML | — |
| Motion | `src/lib/gsap.ts`, `src/components/checkin/CheckinMotion.tsx` | One load timeline, scroll-drawn sparklines, reduced-motion final states | DOM | Animation | GSAP (ScrollTrigger, SplitText, DrawSVG) |
| Share | `src/lib/share.ts`, `src/components/checkin/ShareButtons.tsx` | WhatsApp text + copy summary | Check-in view | `wa.me` link | WhatsApp |
| Funds page | `src/app/funds/page.tsx`, `src/components/funds/FundsManager.tsx` | List, add with live preview, remove, scheme search | Funds view | API calls | — |
| History page | `src/app/history/page.tsx` | Past reports; 12-week "beating similar funds" strips | History view | HTML | — |
| Status page | `src/app/status/page.tsx`, `src/components/status/SourceCheck.tsx` | Freshness, benchmarks used, job runs, Gemini usage, live check | Status view | HTML | — |
| Glossary | `src/lib/glossary.ts`, `src/components/glossary/Glossary.tsx` | Dotted-underlined terms → one-sentence drawer | Text, `jargonUsed` | Drawer | — |
| Design tokens | `src/styles/tokens.css`, `src/app/globals.css` | Colours (verdict states, dark theme), type, spacing | — | CSS | Google Fonts (via `next/font`) |
| Source verification | `scripts/verify-sources.ts` | Live check of every source; non-zero exit on failure | Network | Report | all sources |
| Seed | `scripts/seed.ts`, `scripts/seedFunds.ts` | Meera's five verified funds | — | funds | mfapi, AMFI |

## The Saturday job, step by step

```mermaid
sequenceDiagram
  autonumber
  participant Cron as Vercel Cron, Saturday 7 AM IST
  participant API as /api/cron/saturday-report
  participant DB as Neon Postgres
  participant MF as mfapi.in
  participant AMFI as AMFI NAVAll.txt
  participant YF as Yahoo Finance
  participant News as GNews + Google News RSS
  participant Eng as Engine
  participant Gem as Gemini Flash
  participant G as Guard

  Cron->>API: GET with Authorization: Bearer CRON_SECRET
  API->>API: Reject if secret wrong (401)
  API->>DB: Any weekly run already in progress? (409 if so)
  API->>DB: Insert job_runs (running)
  API->>MF: NAV history for active funds + index-fund benchmarks
  MF-->>API: NAV series
  API->>YF: Last month of index levels
  YF-->>API: Closes (or fail → proxies used, warning logged)
  API->>AMFI: NAVAll.txt
  AMFI-->>API: Categories → refresh similar-fund lists
  API->>MF: History for similar funds with gaps (≤5 parallel, time-boxed)
  API->>DB: Upsert nav_history, benchmark_history, category_peers
  API->>Eng: Compute 12 weeks: returns, category averages, split, flags
  Eng->>DB: Upsert weekly_snapshots (same week → update, never duplicate)
  API->>DB: market_context for this week exists?
  alt not yet stored
    API->>News: Headlines for Mon–Fri
    News-->>API: Articles → dedupe, rank, keep 8–10
    API->>DB: Insert market_context (never re-fetched)
  end
  API->>Eng: Verdict engine → verdict, reason, worry score
  API->>Gem: Fact sheet (rounded numbers + headline ids)
  Gem-->>G: JSON report
  alt guard passes
    G-->>API: Accept
  else guard fails
    API->>Gem: Retry once with the specific errors
    Gem-->>G: JSON report
    alt still failing
      G-->>API: Use template ("written without AI this week")
    end
  end
  API->>DB: Upsert reports (model, tokens, latency, retries)
  API->>DB: Update job_runs (success / partial / error, details)
  API-->>Cron: 200 { verdict, writtenBy, worryScore }
```
