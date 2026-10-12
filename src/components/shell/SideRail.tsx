"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const I = {
  portfolio: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15l5-5 4 4 7-7" />
      <path d="M15 7h5v5" />
    </svg>
  ),
  funds: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  status: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l3-7 4 14 3-7h4" />
    </svg>
  ),
};

const LINKS: Array<{ href: string; label: string; icon: ReactNode }> = [
  { href: "/", label: "Portfolio", icon: I.portfolio },
  { href: "/funds", label: "My Funds", icon: I.funds },
  { href: "/history", label: "Performance", icon: I.history },
  { href: "/status", label: "Data", icon: I.status },
];

/** Left icon rail on desktop; the same links become a bottom tab bar on phones. */
export function SideRail() {
  const path = usePathname();
  return (
    <aside className="rail">
      <Link href="/" className="rail-logo" aria-label="Who moved my money? home">
        <span className="logo-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 11.5l3.5-3.5 2.5 2.5L14 4.5" />
            <path d="M10 4.5h4v4" />
          </svg>
        </span>
        <span className="logo-word">
          WMM
          <small>money</small>
        </span>
      </Link>
      <nav className="rail-nav" aria-label="Main">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className="rail-item" aria-current={active ? "page" : undefined}>
              <span className="rail-icon">{l.icon}</span>
              <span className="rail-label">{l.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="rail-foot">
        <ThemeToggle compact />
        <span className="avatar" title="Meera">
          M
        </span>
      </div>
    </aside>
  );
}
