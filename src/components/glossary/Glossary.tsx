"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { GLOSSARY } from "@/lib/glossary";
import { gsap, MOTION_OK } from "@/lib/gsap";

type Ctx = { open: (term: string) => void };
const GlossaryContext = createContext<Ctx>({ open: () => {} });

function canonical(term: string): string {
  return Object.keys(GLOSSARY).find((k) => k.toLowerCase() === term.toLowerCase()) ?? term;
}

/** One drawer for the whole app; any dotted-underlined term opens it at that term. */
export function GlossaryProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState<string | null>(null);

  const open = useCallback((term: string) => {
    const key = canonical(term);
    setCurrent(key);
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) {
      gsap.killTweensOf(d);
      gsap.set(d, { xPercent: 0 });
      d.showModal();
      if (window.matchMedia(MOTION_OK).matches) gsap.fromTo(d, { xPercent: 100 }, { xPercent: 0, duration: 0.35, ease: "power3.out" });
    }
    requestAnimationFrame(() => d.querySelector(`[data-term="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" }));
  }, []);

  const close = () => {
    const d = dialogRef.current;
    if (!d?.open) return;
    gsap.killTweensOf(d);
    if (!window.matchMedia(MOTION_OK).matches) return d.close();
    const done = () => {
      if (d.open) d.close();
    };
    gsap.to(d, { xPercent: 100, duration: 0.25, ease: "power2.in", onComplete: done });
    // Background tabs can pause animation frames; the drawer must still close.
    window.setTimeout(done, 400);
  };

  // However the dialog closed (button, backdrop, Escape, or the browser itself), leave it ready to open cleanly.
  const onClosed = () => {
    const d = dialogRef.current;
    if (!d) return;
    gsap.killTweensOf(d);
    gsap.set(d, { xPercent: 0 });
  };

  const terms = Object.entries(GLOSSARY).filter(([k], i, all) => all.findIndex(([, v]) => v === GLOSSARY[k]) === i);

  return (
    <GlossaryContext.Provider value={{ open }}>
      {children}
      <dialog
        ref={dialogRef}
        className="glossary"
        aria-labelledby="glossary-title"
        onCancel={(e) => {
          // Chrome only lets a page delay Escape-to-close after a user gesture; otherwise it closes natively.
          if (!e.cancelable) return;
          e.preventDefault();
          close();
        }}
        onClose={onClosed}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="glossary-head">
          <h2 id="glossary-title">Plain words</h2>
          <button type="button" className="icon-button" onClick={close}>
            Close
          </button>
        </div>
        <dl>
          {terms.map(([term, text]) => (
            <div key={term} data-term={term} className={current && GLOSSARY[current] === text ? "current" : undefined}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </dialog>
    </GlossaryContext.Provider>
  );
}

export function Term({ t, children }: { t: string; children?: ReactNode }) {
  const { open } = useContext(GlossaryContext);
  return (
    <button type="button" className="term" onClick={() => open(t)} aria-haspopup="dialog" title={GLOSSARY[canonical(t)]}>
      {children ?? t}
    </button>
  );
}

/**
 * Wraps the first mention of each glossary term (plus any extra terms Gemini listed) in a <Term>.
 * Words inside `skip` phrases (fund names like "HDFC Nifty 50 Index Fund") are never underlined.
 */
export function GlossaryText({ text, extraTerms = [], skip = [] }: { text: string; extraTerms?: string[]; skip?: string[] }) {
  const known = new Set(Object.keys(GLOSSARY).map((k) => k.toLowerCase()));
  const terms = [...new Set([...Object.keys(GLOSSARY), ...extraTerms.filter((t) => known.has(t.toLowerCase()))])].sort((a, b) => b.length - a.length);
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const lower = text.toLowerCase();
  const skipRanges: Array<[number, number]> = [];
  for (const phrase of skip) {
    const p = phrase.toLowerCase();
    if (!p) continue;
    for (let i = lower.indexOf(p); i >= 0; i = lower.indexOf(p, i + p.length)) skipRanges.push([i, i + p.length]);
  }
  const seen = new Set<string>();
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (skipRanges.some(([a, b]) => start < b && start + m[0].length > a)) continue;
    const key = canonical(m[0]);
    const definition = GLOSSARY[key];
    if (!definition || seen.has(definition)) continue;
    seen.add(definition);
    parts.push(text.slice(last, m.index));
    parts.push(
      <Term key={`${m.index}-${key}`} t={key}>
        {m[0]}
      </Term>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
