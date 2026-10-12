"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "./AdminProvider";

type Phase = "idle" | "running" | "done" | "error";

/** "Generate this week's report now" — for demos; examiners shouldn't have to wait for Saturday. */
export function GenerateNow({ label = "Refresh report", className = "button secondary small" }: { label?: string; className?: string }) {
  const router = useRouter();
  const { adminFetch } = useAdmin();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setPhase("running");
    setMessage("Refreshing NAVs, comparing with the category and writing the analyst note…");
    try {
      const res = await adminFetch("/api/admin/run-report", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; verdict?: string; writtenBy?: string };
      if (res.status === 401) {
        setPhase("idle");
        setMessage(null);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setPhase("done");
      setMessage(`Updated: ${body.verdict}.${body.writtenBy === "template" ? " (Written without AI this week.)" : ""}`);
      router.refresh();
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)" }}>
      <button type="button" className={className} onClick={run} disabled={phase === "running"}>
        <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6" />
          <path d="M16.5 3.5v3.6h-3.6" />
        </svg>
        {phase === "running" ? "Refreshing…" : label}
      </button>
      <span role="status" aria-live="polite" className={phase === "error" ? "alert" : "faint"}>
        {message}
      </span>
    </span>
  );
}
