"use client";

import { useState } from "react";
import { SheetTrigger } from "./Sheet";

export type HoldingRow = {
  code: string;
  shortName: string;
  amc: string;
  category: string;
  group: "equity" | "debt" | "international" | "other";
  flagged: boolean;
  value: number | null;
  gainPct: number | null;
  weekChange: number | null;
  ret1w: number | null;
  ret1m: number | null;
  retYtd: number | null;
  gap1w: number | null;
  driver: "Market" | "Category" | "Fund" | null;
};

type SortKey = "value" | "ret1w" | "ret1m" | "retYtd" | "gap1w";
type Filter = "all" | "equity" | "debt" | "international" | "watch";

const FILTERS: Array<[Filter, string]> = [
  ["all", "All"],
  ["equity", "Equity"],
  ["debt", "Debt"],
  ["international", "International"],
  ["watch", "Watch"],
];

const AVATAR = ["#21305e", "#0b8048", "#b45309", "#6941c6", "#c2410c", "#0369a1"];
const inr = (x: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(x);
const signedInr = (x: number) => `${x >= 0 ? "+" : "−"}${inr(Math.abs(x))}`;

function initials(amc: string) {
  const w = amc.split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="faint">—</span>;
  if (Math.abs(v) < 0.00005) return <span className="num flat">0.00%</span>;
  const up = v > 0;
  return (
    <span className={`num ${up ? "up" : "down"}`}>
      <span aria-hidden="true">{up ? "▲ " : "▼ "}</span>
      <span className="sr-only">{up ? "up " : "down "}</span>
      {Math.abs(v * 100).toFixed(2)}%
    </span>
  );
}

function SortHead({ k, label, sort, onSort, className }: { k: SortKey; label: string; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="sort" onClick={() => onSort(k)}>
        {label}
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
          <path d="M5 1L9 5H1z" fill={active && sort.dir === 1 ? "currentColor" : "var(--rule-strong)"} />
          <path d="M5 11L1 7h8z" fill={active && sort.dir === -1 ? "currentColor" : "var(--rule-strong)"} />
        </svg>
      </button>
    </th>
  );
}

/** INDmoney-style holdings table: pill filters, sortable columns, fund-house initials. Rows open the fund sheet. */
export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "value", dir: -1 });

  const counts: Record<Filter, number> = {
    all: rows.length,
    equity: rows.filter((r) => r.group === "equity").length,
    debt: rows.filter((r) => r.group === "debt").length,
    international: rows.filter((r) => r.group === "international").length,
    watch: rows.filter((r) => r.flagged).length,
  };
  const shown = rows
    .filter((r) => (filter === "all" ? true : filter === "watch" ? r.flagged : r.group === filter))
    .sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x === null) return 1;
      if (y === null) return -1;
      return (x - y) * sort.dir;
    });

  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: -1 }));

  return (
    <>
      <div className="pills" role="group" aria-label="Filter holdings">
        {FILTERS.filter(([f]) => f === "all" || counts[f] > 0).map(([f, label]) => (
          <button key={f} type="button" className="pill" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}
            <span className="pill-count">{counts[f]}</span>
          </button>
        ))}
      </div>
      <div className="table-scroll ind-table-wrap">
        <table className="ind-table">
          <caption className="sr-only">Your funds with current value and returns. Column headers sort the table.</caption>
          <thead>
            <tr>
              <th scope="col">Fund</th>
              <SortHead k="value" label="Current value" sort={sort} onSort={onSort} />
              <SortHead k="ret1w" label="1W" sort={sort} onSort={onSort} />
              <SortHead k="ret1m" label="1M" sort={sort} onSort={onSort} className="hide-sm" />
              <SortHead k="retYtd" label="YTD" sort={sort} onSort={onSort} className="hide-sm" />
              <SortHead k="gap1w" label="vs category" sort={sort} onSort={onSort} className="hide-sm" />
              <th scope="col" className="hide-sm">
                Moved by
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.code} data-anim="row">
                <td>
                  <div className="fund-cell">
                    <span className="amc-logo" style={{ background: hue(r.amc) }} aria-hidden="true">
                      {initials(r.amc)}
                    </span>
                    <span className="fund-names">
                      <span className="amc-name">{r.amc}</span>
                      <SheetTrigger id={r.code} className="fund-open" label={`${r.shortName}: open full analysis`}>
                        {r.shortName}
                      </SheetTrigger>
                      <span className="fund-meta">
                        <span className="tag">{r.category}</span>
                        {r.flagged && <span className="tag watch">Watch</span>}
                      </span>
                    </span>
                  </div>
                </td>
                <td>
                  <span className="num strong amount">{r.value !== null ? inr(r.value) : "—"}</span>
                  {r.gainPct !== null && (
                    <span className="cell-sub">
                      <Pct v={r.gainPct} />
                    </span>
                  )}
                </td>
                <td>
                  <Pct v={r.ret1w} />
                  {r.weekChange !== null && <span className={`cell-sub num amount ${r.weekChange >= 0 ? "up" : "down"}`}>{signedInr(r.weekChange)}</span>}
                </td>
                <td className="hide-sm">
                  <Pct v={r.ret1m} />
                </td>
                <td className="hide-sm">
                  <Pct v={r.retYtd} />
                </td>
                <td className="hide-sm">
                  {r.gap1w === null ? (
                    <span className="faint">—</span>
                  ) : Math.abs(r.gap1w) < 0.00005 ? (
                    <span className="flat num">level</span>
                  ) : (
                    <span className={`num ${r.gap1w > 0 ? "up" : "down"}`}>
                      {r.gap1w > 0 ? "+" : "−"}
                      {Math.abs(r.gap1w * 100).toFixed(2)} pp<span className="sr-only">{r.gap1w > 0 ? " ahead" : " behind"}</span>
                    </span>
                  )}
                </td>
                <td className="hide-sm">{r.driver ? <span className={r.driver === "Fund" ? "tag watch" : "tag"}>{r.driver}</span> : <span className="faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
