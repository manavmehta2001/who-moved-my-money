"use client";

import { useRef, type ReactNode } from "react";
import { gsap, MOTION_OK, SplitText, useGSAP } from "@/lib/gsap";

function seenKey(week: string) {
  return `wmm-seen-${week}`;
}

function firstView(week: string): boolean {
  try {
    if (sessionStorage.getItem(seenKey(week))) return false;
    sessionStorage.setItem(seenKey(week), "1");
    return true;
  } catch {
    return true;
  }
}

/**
 * The page's one orchestrated moment. Everything is server-rendered in its final state, so with reduced motion
 * (or no JavaScript) nothing moves and nothing is hidden. Otherwise, in one timeline: the accent eases from
 * neutral to the verdict colour, the verdict settles word by word, the dial needle sweeps, then the
 * "who moved my money" bars fill in order. Sparklines draw once when scrolled into view.
 */
export function CheckinMotion({ state, week, children }: { state: string; week: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const root = ref.current;
        if (!root) return;
        const cs = getComputedStyle(root);
        const accent = cs.getPropertyValue("--accent").trim();
        const tint = cs.getPropertyValue("--accent-tint").trim();
        const neutral = cs.getPropertyValue("--neutral").trim();
        const sunk = cs.getPropertyValue("--surface-sunk").trim();
        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
          onComplete: () => {
            // Hand the colours back to CSS so a theme change still recolours the page.
            root.style.removeProperty("--accent");
            root.style.removeProperty("--accent-tint");
          },
        });

        tl.fromTo(root, { "--accent": neutral, "--accent-tint": sunk }, { "--accent": accent, "--accent-tint": tint, duration: 1 }, 0);

        const verdict = root.querySelector("[data-anim=verdict]");
        if (verdict) {
          const split = SplitText.create(verdict, { type: "words", aria: "auto" });
          tl.from(split.words, { yPercent: 35, opacity: 0, duration: 0.55, stagger: 0.045 }, 0.15);
        }

        const needle = root.querySelector<SVGGElement>("[data-anim=needle]");
        if (needle) {
          const angle = Number(needle.dataset.angle ?? 0);
          tl.fromTo(needle, { rotation: -90, svgOrigin: "100 100" }, { rotation: angle, svgOrigin: "100 100", duration: 1.2, ease: "power3.out" }, 0.45);
        }
        const fill = root.querySelector<SVGPathElement>("[data-anim=dial-fill]");
        if (fill) {
          tl.fromTo(fill, { strokeDasharray: "0 100" }, { strokeDasharray: `${fill.dataset.score} 100`, duration: 1.2, ease: "power3.out" }, 0.45);
        }

        if (firstView(week)) {
          root.querySelectorAll<HTMLElement>("[data-countup]").forEach((el) => {
            const target = el.dataset.countup ?? "0";
            const decimals = target.includes(".") ? target.split(".")[1].length : 0;
            const counter = { v: 0 };
            tl.to(counter, { v: Number(target), duration: 1.1, ease: "power2.out", onUpdate: () => (el.textContent = counter.v.toFixed(decimals)) }, 0.45);
          });
        }

        const parts = root.querySelectorAll("[data-anim=part]");
        if (parts.length) tl.from(parts, { scaleX: 0, duration: 0.5, ease: "power3.out", stagger: 0.09 }, ">-0.6");

        root.querySelectorAll("[data-anim=spark]").forEach((el) => {
          gsap.from(el, { drawSVG: "0%", duration: 1.3, ease: "power1.inOut", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
        });
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} data-verdict={state}>
      {children}
    </div>
  );
}
