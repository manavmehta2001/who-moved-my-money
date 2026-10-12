/** A signed percentage that never relies on colour alone: arrow + word for screen readers + colour. */
export function Pct({ value, title, className = "", countUp = false, digits = 2 }: { value: number | null | undefined; title?: string; className?: string; countUp?: boolean; digits?: number }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={`num flat ${className}`} title={title}>
        —<span className="sr-only"> not available</span>
      </span>
    );
  }
  const shown = (Math.abs(value) * 100).toFixed(digits);
  const isZero = Number(shown) === 0;
  const dir = isZero ? "flat" : value > 0 ? "up" : "down";
  return (
    <span className={`num ${dir} ${className}`} title={title}>
      <span aria-hidden="true">{dir === "up" ? "▲ " : dir === "down" ? "▼ " : ""}</span>
      <span className="sr-only">{dir === "up" ? "up " : dir === "down" ? "down " : ""}</span>
      <span data-countup={countUp ? shown : undefined}>{shown}</span>%
    </span>
  );
}

/** Percentage-point gap: "0.25 pp ahead" / "1.10 pp behind". */
export function Gap({ value, title }: { value: number | null; title?: string }) {
  if (value === null) return <span className="num flat">—</span>;
  const shown = (Math.abs(value) * 100).toFixed(2);
  if (Number(shown) === 0) return <span className="num flat" title={title}>level</span>;
  return (
    <span className={`num ${value > 0 ? "up" : "down"}`} title={title}>
      {shown} pp {value > 0 ? "ahead" : "behind"}
    </span>
  );
}
