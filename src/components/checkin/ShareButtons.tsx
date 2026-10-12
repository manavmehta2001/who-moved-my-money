"use client";

import { useState } from "react";

/** Replaces Meera's habit of screenshotting NAVs to her CA friend: one tap sends a clean summary on WhatsApp. */
export function ShareButtons({ text }: { text: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <div className="share">
      <a className="button" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        Send to my CA
        <span className="sr-only"> on WhatsApp (opens in a new tab)</span>
      </a>
      <button type="button" className="button secondary" onClick={copy}>
        Copy summary
      </button>
      <span role="status" aria-live="polite" className="faint" style={{ alignSelf: "center" }}>
        {copied === "ok" ? "Copied." : copied === "fail" ? "Couldn't copy. Select the text instead." : ""}
      </span>
    </div>
  );
}
