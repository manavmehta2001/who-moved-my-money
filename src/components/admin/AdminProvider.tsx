"use client";

import { createContext, useCallback, useContext, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

type Ctx = { adminFetch: (input: string, init?: RequestInit) => Promise<Response> };
const AdminContext = createContext<Ctx>({ adminFetch: (input, init) => fetch(input, init) });

/**
 * No passcode box on any page: protected actions just run. If the server answers 401, a small dialog asks for
 * the passcode once (remembered in an httpOnly cookie on this device) and the action is retried.
 */
export function AdminProvider({ children }: { children: ReactNode }) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setValue("");
    setError(null);
    if (dialogRef.current?.open) dialogRef.current.close();
  };

  const askPasscode = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        dialogRef.current?.showModal();
      }),
    [],
  );

  const adminFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      const first = await fetch(input, init);
      if (first.status !== 401) return first;
      const ok = await askPasscode();
      return ok ? fetch(input, init) : first;
    },
    [askPasscode],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: value }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "That didn't work.");
      finish(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminContext.Provider value={{ adminFetch }}>
      {children}
      <dialog ref={dialogRef} className="modal" aria-labelledby={`${id}-title`} onClose={() => resolveRef.current && finish(false)}>
        <form onSubmit={submit} className="form-row" noValidate>
          <h2 id={`${id}-title`} className="card-title">
            Confirm it&rsquo;s you
          </h2>
          <p className="faint">Changing funds or regenerating a report needs the admin passcode. You&rsquo;ll only be asked once on this device.</p>
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
            />
            {error && (
              <p id={`${id}-err`} className="alert" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="button quiet" onClick={() => finish(false)}>
              Cancel
            </button>
            <button type="submit" className="button" disabled={busy || value.length === 0}>
              {busy ? "Checking…" : "Continue"}
            </button>
          </div>
        </form>
      </dialog>
    </AdminContext.Provider>
  );
}

export function useAdmin(): Ctx {
  return useContext(AdminContext);
}
