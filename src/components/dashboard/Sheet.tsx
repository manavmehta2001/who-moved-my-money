"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, MOTION_OK } from "@/lib/gsap";

const OPEN_EVENT = "wmm-open-sheet";

/** Opens the side sheet with this id (decoupled so table rows stay server-rendered). */
export function openSheet(id: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
}

export function SheetTrigger({ id, className, children, label }: { id: string; className?: string; children: ReactNode; label?: string }) {
  return (
    <button type="button" className={className} onClick={() => openSheet(id)} aria-haspopup="dialog" aria-label={label}>
      {children}
    </button>
  );
}

/**
 * A right-hand side sheet for one fund's full analysis. Slides in; its "who moved my money" bars fill as it
 * opens (the dashboard's one responsive motion for a user action). Robust to Escape and paused frames.
 */
export function Sheet({ id, title, subtitle, children }: { id: string; title: string; subtitle?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) return;
      const d = ref.current;
      if (!d || d.open) return;
      gsap.killTweensOf(d);
      gsap.set(d, { xPercent: 0 });
      d.showModal();
      d.scrollTop = 0;
      if (!window.matchMedia(MOTION_OK).matches) return;
      gsap.fromTo(d, { xPercent: 100 }, { xPercent: 0, duration: 0.35, ease: "power3.out" });
      const parts = d.querySelectorAll("[data-anim=part]");
      if (parts.length) gsap.fromTo(parts, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power3.out", stagger: 0.08, delay: 0.25 });
      const spark = d.querySelector("[data-anim=spark]");
      if (spark) gsap.fromTo(spark, { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.9, ease: "power1.inOut", delay: 0.3 });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [id]);

  const close = () => {
    const d = ref.current;
    if (!d?.open) return;
    gsap.killTweensOf(d);
    if (!window.matchMedia(MOTION_OK).matches) return d.close();
    const done = () => {
      if (d.open) d.close();
    };
    gsap.to(d, { xPercent: 100, duration: 0.25, ease: "power2.in", onComplete: done });
    window.setTimeout(done, 400);
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        if (!e.cancelable) return;
        e.preventDefault();
        close();
      }}
      onClose={() => {
        const d = ref.current;
        if (d) {
          gsap.killTweensOf(d);
          gsap.set(d, { xPercent: 0 });
        }
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="sheet-head">
        <div>
          <h2 id={`${id}-title`} className="sheet-title">
            {title}
          </h2>
          {subtitle}
        </div>
        <button type="button" className="icon-button" onClick={close} aria-label={`Close ${title}`}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
