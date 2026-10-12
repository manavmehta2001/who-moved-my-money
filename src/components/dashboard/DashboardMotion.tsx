"use client";

import { useRef, type ReactNode } from "react";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

const inrFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function firstView(week: string): boolean {
  try {
    const key = `wmm-seen-${week}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

/**
 * One orchestrated load moment. Everything is server-rendered in its final state, so reduced motion (or no
 * JavaScript) shows the finished dashboard. Otherwise: the accent eases to the verdict colour, the value
 * counts up (first view only), the value chart and allocation donut draw, the dial sweeps, rows settle in.
 * Elements inside side sheets are left alone; they animate when a sheet opens.
 */
export function DashboardMotion({ state, week, children }: { state: string; week: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const root = ref.current;
        if (!root) return;
        const q = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)].filter((el) => !el.closest("dialog"));
        const cs = getComputedStyle(root);
        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
          onComplete: () => {
            root.style.removeProperty("--accent");
            root.style.removeProperty("--accent-tint");
          },
        });

        tl.fromTo(
          root,
          { "--accent": cs.getPropertyValue("--neutral").trim(), "--accent-tint": cs.getPropertyValue("--surface-sunk").trim() },
          { "--accent": cs.getPropertyValue("--accent").trim(), "--accent-tint": cs.getPropertyValue("--accent-tint").trim(), duration: 0.9 },
          0,
        );

        tl.from(q(".card"), { y: 10, opacity: 0, duration: 0.45, stagger: 0.05 }, 0);

        const verdict = q("[data-anim=verdict]");
        if (verdict.length) tl.from(verdict, { scale: 0.92, opacity: 0, duration: 0.4, transformOrigin: "left center" }, 0.25);

        if (firstView(week)) {
          for (const el of q("[data-countup-inr]")) {
            const target = Number(el.dataset.countupInr ?? 0);
            const c = { v: target * 0.92 };
            tl.to(c, { v: target, duration: 1, ease: "power3.out", onUpdate: () => (el.textContent = inrFormat.format(Math.round(c.v))) }, 0.15);
          }
        }

        const line = q("[data-anim=value-line]");
        if (line.length) tl.from(line, { drawSVG: "0%", duration: 1.1, ease: "power1.inOut" }, 0.3);
        const area = q("[data-anim=value-area]");
        if (area.length) tl.from(area, { opacity: 0, duration: 0.6 }, 0.9);

        const donut = q("[data-anim=donut]");
        if (donut.length) tl.from(donut, { drawSVG: "0%", duration: 0.5, stagger: 0.12, ease: "power2.inOut" }, 0.35);

        const needle = q("[data-anim=needle]")[0] as unknown as SVGGElement | undefined;
        if (needle) {
          tl.fromTo(needle, { rotation: -90, svgOrigin: "100 100" }, { rotation: Number(needle.dataset.angle ?? 0), svgOrigin: "100 100", duration: 1.1, ease: "power3.out" }, 0.4);
        }
        const fill = q("[data-anim=dial-fill]")[0];
        if (fill) tl.fromTo(fill, { strokeDasharray: "0 100" }, { strokeDasharray: `${fill.dataset.score} 100`, duration: 1.1, ease: "power3.out" }, 0.4);

        const rows = q("[data-anim=row]");
        if (rows.length) tl.from(rows, { opacity: 0, x: -8, duration: 0.35, stagger: 0.06 }, 0.45);
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
