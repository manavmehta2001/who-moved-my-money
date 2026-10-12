"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "This Saturday" },
  { href: "/funds", label: "My funds" },
  { href: "/history", label: "Past Saturdays" },
  { href: "/status", label: "Data status" },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
