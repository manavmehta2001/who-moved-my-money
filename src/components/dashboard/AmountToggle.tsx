"use client";

import { useState } from "react";

/** The eye button on the portfolio card: blurs every rupee amount on the page (for screenshots or a shared screen). */
export function AmountToggle() {
  const [hidden, setHidden] = useState(false);
  function toggle() {
    const next = !hidden;
    setHidden(next);
    if (next) document.documentElement.dataset.hideAmounts = "";
    else delete document.documentElement.dataset.hideAmounts;
  }
  return (
    <button type="button" className="eye" onClick={toggle} aria-pressed={hidden} aria-label="Hide amounts">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}
