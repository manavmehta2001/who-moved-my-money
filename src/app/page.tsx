import { Suspense } from "react";
import Link from "next/link";
import { getCheckinView, type CheckinView } from "@/lib/data/views";
import { isAdmin } from "@/lib/auth/passcode";
import { formatDisplayDate } from "@/lib/dates";
import { shareText } from "@/lib/share";
import { GlossaryText } from "@/components/glossary/Glossary";
import { GenerateNow } from "@/components/admin/GenerateNow";
import { CheckinMotion } from "@/components/checkin/CheckinMotion";
import { FundSection } from "@/components/checkin/FundSection";
import { MarketStrip } from "@/components/checkin/MarketStrip";
import { ShareButtons } from "@/components/checkin/ShareButtons";
import { WorryDial } from "@/components/checkin/WorryDial";

export default function CheckinPage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="muted">Opening this Saturday&rsquo;s check-in…</p>}>
      <Checkin searchParams={props.searchParams} />
    </Suspense>
  );
}

function VerdictSentence({ view }: { view: CheckinView }) {
  const v = view.report.verdict;
  const watched = view.funds.filter((f) => f.flagged).map((f) => f.shortName);
  return (
    <h1 className="verdict-sentence" data-anim="verdict">
      {v === "One fund worth watching" ? (
        <>
          <span className="verdict-phrase">{watched[0] ? `${v}:` : `${v}.`}</span>
          {watched[0] ? ` ${watched[0]}.` : ""}
        </>
      ) : v === "No action needed" ? (
        <>
          <span className="verdict-phrase">{v}</span> this week.
        </>
      ) : (
        <>
          <span className="verdict-phrase">{v}</span> this week.
        </>
      )}
    </h1>
  );
}

async function Checkin({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { week } = await searchParams;
  const [view, admin] = await Promise.all([getCheckinView(typeof week === "string" ? week : undefined), isAdmin()]);

  if (!view) {
    return (
      <section className="empty" aria-labelledby="empty-title">
        <h1 id="empty-title" className="page-title">
          Your first check-in arrives Saturday morning.
        </h1>
        <p className="lede">Every Saturday at about 7 AM this page explains who moved your money: the market, funds like yours, or your fund itself. Can&rsquo;t wait?</p>
        <GenerateNow isAdmin={admin} label="Generate it now" />
      </section>
    );
  }

  const r = view.report;
  const cited = new Set(view.funds.flatMap((f) => f.citedHeadlineIds));

  return (
    <CheckinMotion state={view.state} week={r.weekEnding}>
      <section className="hero" aria-labelledby="verdict">
        <div>
          <p className="hero-week">
            Week ending Friday {formatDisplayDate(r.weekEnding)}
            {!view.isLatest && (
              <>
                {" · "}
                <Link href="/">See the latest week</Link>
              </>
            )}
          </p>
          <div id="verdict">
            <VerdictSentence view={view} />
          </div>
          <p className="hero-headline">{r.content.headline}</p>
          <p className="hero-reason">
            <GlossaryText text={r.verdictReason} extraTerms={r.content.jargonUsed} skip={view.funds.map((f) => f.shortName)} />
          </p>
          <p style={{ marginTop: "var(--space-3)", display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {r.writtenBy === "gemini" ? <span className="badge">Written by Gemini from checked numbers</span> : <span className="badge">Written without AI this week</span>}
          </p>
        </div>
        <WorryDial score={r.worryScore} />
      </section>

      {view.removedSince.length > 0 && (
        <p className="alert info" style={{ marginTop: "var(--space-4)" }}>
          Since this report, you removed {view.removedSince.join(", ")}. It won&rsquo;t appear in future check-ins.
        </p>
      )}

      <div className="funds">
        {view.funds.map((f, i) => (
          <FundSection key={f.schemeCode} f={f} jargon={r.content.jargonUsed} index={i} />
        ))}
      </div>

      <MarketStrip moves={view.indexMoves} headlines={view.headlines} cited={cited} provider={view.newsProvider} />

      <section aria-labelledby="share-title" style={{ marginTop: "var(--space-6)" }}>
        <h2 id="share-title" style={{ fontSize: "var(--step-1)" }}>
          Ask my CA friend
        </h2>
        <p className="muted prose">Instead of screenshotting NAVs, send this week&rsquo;s summary in one tap.</p>
        <ShareButtons text={shareText(view, process.env.NEXT_PUBLIC_APP_URL)} />
      </section>

      {view.isLatest && (
        <section aria-label="Refresh this report" style={{ marginTop: "var(--space-6)" }}>
          <p className="faint" style={{ marginBottom: "var(--space-2)" }}>
            Generated {r.generatedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST.
          </p>
          <GenerateNow isAdmin={admin} label="Regenerate this week's report" quiet />
        </section>
      )}
    </CheckinMotion>
  );
}
