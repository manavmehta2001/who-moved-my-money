"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/** Top bar: app name and a pill search box that looks funds up by name or scheme code. */
export function TopBar() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/funds?search=${encodeURIComponent(term)}`);
  }

  return (
    <div className="topbar">
      <p className="topbar-title">
        Who moved my money? <span className="faint">· Meera&rsquo;s mutual funds</span>
      </p>
      <form className="search-pill" role="search" onSubmit={submit}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
        <label htmlFor="global-search" className="sr-only">
          Search funds by name or scheme code
        </label>
        <input id="global-search" type="search" placeholder="Search funds" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
    </div>
  );
}
