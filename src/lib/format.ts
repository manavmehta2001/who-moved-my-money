/** Decimal return → "1.82%" (always 2 decimals, no sign). */
export function pct(x: number, digits = 2): string {
  return `${(Math.abs(x) * 100).toFixed(digits)}%`;
}

/** Decimal return → "+1.82%" / "−1.82%" with a real minus sign. */
export function signedPct(x: number, digits = 2): string {
  const s = (Math.abs(x) * 100).toFixed(digits);
  if (Number(s) === 0) return `${(0).toFixed(digits)}%`;
  return `${x > 0 ? "+" : "−"}${s}%`;
}

/** Decimal difference → "2.10 percentage points". */
export function pp(x: number, digits = 2): string {
  return `${(Math.abs(x) * 100).toFixed(digits)} percentage points`;
}

export function round4(x: number | null | undefined): number | null {
  return x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10_000) / 10_000;
}

export function inr(x: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(x);
}
