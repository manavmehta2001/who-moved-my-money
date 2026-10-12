"use client";

import { useId, useState, type FormEvent } from "react";

/** Asks for the admin passcode once; the server remembers it in an httpOnly cookie. */
export function PasscodeForm({ onSuccess, intro }: { onSuccess: () => void; intro?: string }) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: value }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "That didn't work.");
      setValue("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-row" noValidate>
      {intro && <p className="muted">{intro}</p>}
      <div className="field">
        <label htmlFor={`${id}-pc`}>Admin passcode</label>
        <input
          id={`${id}-pc`}
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          required
        />
        {error && (
          <p id={`${id}-err`} className="alert" role="alert">
            {error}
          </p>
        )}
      </div>
      <div>
        <button className="button" type="submit" disabled={busy || value.length === 0}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </div>
    </form>
  );
}
