import { connection } from "next/server";
import { getTicker } from "@/lib/data/ticker";
import { formatDisplayDate } from "@/lib/dates";

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Market strip: index level, day change and % change, from stored Yahoo closes. */
export async function Ticker() {
  await connection();
  const items = await getTicker();
  if (items.length === 0) return null;
  return (
    <div className="ticker" role="region" aria-label="Market indices, latest close">
      <ul>
        {items.map((t) => {
          const up = t.change >= 0;
          return (
            <li key={t.key} title={`${t.label} close on ${formatDisplayDate(t.asOf)} · ${t.source}${t.currency !== "INR" ? ` · in ${t.currency}` : ""}`}>
              <span className="ticker-name">{t.label}</span>
              <span className="num ticker-level">{nf.format(t.level)}</span>
              <span className={`num ${up ? "up" : "down"}`}>
                {up ? "+" : "−"}
                {nf.format(Math.abs(t.change))} (<span aria-hidden="true">{up ? "▲" : "▼"}</span>
                <span className="sr-only">{up ? "up " : "down "}</span>
                {(Math.abs(t.changePct) * 100).toFixed(2)}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
