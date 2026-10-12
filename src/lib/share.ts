import type { CheckinView } from "@/lib/data/views";
import { formatDisplayDate } from "@/lib/dates";

function sp(x: number | null): string {
  if (x === null) return "n/a";
  const abs = Math.abs(x * 100).toFixed(2);
  return Number(abs) === 0 ? "0.00%" : `${x > 0 ? "+" : "−"}${abs}%`;
}

/** The short text that goes to Meera's CA on WhatsApp (and the "Copy summary" button). */
export function shareText(view: CheckinView, appUrl: string | undefined): string {
  const r = view.report;
  const lines = [
    `Who moved my money? Week ending ${formatDisplayDate(r.weekEnding)}`,
    `Verdict: ${r.verdict}. ${r.verdictReason}`,
    "",
    ...view.funds.map((f) => {
      const s = f.latest;
      const vs = s.benchRet1w !== null ? `market ${sp(s.benchRet1w)}, similar funds ${sp(s.catRet1w)}` : `similar funds ${sp(s.catRet1w)}`;
      return `• ${f.shortName}: ${sp(s.fundRet1w)} this week (${vs})`;
    }),
  ];
  if (appUrl) lines.push("", `Full check-in: ${appUrl.replace(/\/$/, "")}/?week=${r.weekEnding}`);
  return lines.join("\n");
}
