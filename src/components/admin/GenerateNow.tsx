"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasscodeForm } from "./PasscodeForm";

type Phase = "idle" | "passcode" | "running" | "done" | "error";

/** "Generate this week's report now" — for demos; examiners shouldn't have to wait for Saturday. */
export function GenerateNow({ isAdmin, label = "Generate this week's report now", quiet = false }: { isAdmin: boolean; label?: string; quiet?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setPhase("running");
    setMessage("Fetching NAVs, comparing with similar funds and asking Gemini to write it up. This takes about half a minute.");
    try {
      const res = await fetch("/api/admin/run-report", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; verdict?: string; writtenBy?: string };
      if (res.status === 401) {
        setPhase("passcode");
        setMessage(null);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setPhase("done");
      setMessage(`Done: ${body.verdict}.${body.writtenBy === "template" ? " (Written without AI this week.)" : ""}`);
      router.refresh();
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  if (phase === "passcode" || (!isAdmin && phase === "idle")) {
    return phase === "passcode" ? (
      <PasscodeForm intro="Generating a report needs the admin passcode." onSuccess={run} />
    ) : (
      <button type="button" className={quiet ? "button quiet" : "button"} onClick={() => setPhase("passcode")}>
        {label}
      </button>
    );
  }

  return (
    <div className="form-row">
      <div>
        <button type="button" className={quiet ? "button quiet" : "button"} onClick={run} disabled={phase === "running"}>
          {phase === "running" ? "Generating…" : label}
        </button>
      </div>
      <p role="status" aria-live="polite" className={phase === "error" ? "alert" : "muted"}>
        {message}
      </p>
    </div>
  );
}
