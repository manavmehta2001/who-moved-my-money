// Generates docs/components-map.svg: a swimlane "components map" (actors × Trigger → Output).
// Run: node scripts/components-map.mjs  (then the PNG is rendered from the SVG with headless Chrome)
import { writeFileSync } from "node:fs";

const W = 2000;
const TITLE = "Who Moved My Money? · Meera’s Fund Check-in — Components Map";
const X0 = 24;
const ACTOR_W = 234;
const COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];
const COL_W = (W - 24 - X0 - ACTOR_W) / COLS.length;
const HEAD_Y = 94;
const HEAD_H = 70;
const LANE_H = 152;
const BOX_W = 244;
const BOX_H = 112;
const NAVY = "#1f2a44";

const LANES = [
  { name: "Meera", sub: ["(Investor)"], bg: "#eef0fd" },
  { name: "Scheduler", sub: ["(Vercel Cron)"], bg: "#fdf0eb" },
  { name: "System", sub: ["(Next.js + Neon)"], bg: "#fef9e7" },
  { name: "AI Model", sub: ["(Gemini Flash)"], bg: "#e9f7ef" },
  { name: "Services", sub: ["(mfapi, AMFI, Yahoo,", "GNews, WhatsApp)"], bg: "#fcedf2" },
  { name: "Dashboard", sub: ["(Meera + CA friend)"], bg: "#ebf2fd" },
];

const STYLE = {
  indigo: { fill: "#e3e5fb", stroke: "#5b5bd6" },
  white: { fill: "#ffffff", stroke: "#5b8def" },
  peach: { fill: "#fde3d9", stroke: "#e8784b" },
  yellow: { fill: "#fef0c2", stroke: "#e0b21a" },
  green: { fill: "#d6f2e1", stroke: "#2e9e5b" },
  pink: { fill: "#f9d7e6", stroke: "#d9427f" },
  red: { fill: "#fde1db", stroke: "#e2533e" },
};

// [id, lane, col, style, lines]
const BOXES = [
  ["mTrig", 0, 0, "indigo", ["Opens the dashboard,", "adds a fund or taps", "“Refresh report”"]],
  ["mIn", 0, 1, "white", ["Scheme code + optional", "SIP, units held and", "benchmark choice"]],
  ["cron", 1, 0, "peach", ["Daily 11:30 PM NAV job", "+ Saturday 7 AM report", "(CRON_SECRET)"]],
  ["sIn", 2, 1, "yellow", ["Validates code (zod),", "live preview, backfills", "12 weeks of history"]],
  ["sCtx", 2, 2, "yellow", ["Neon: NAVs, similar", "funds, benchmark proxy", "+ 12 weekly snapshots"]],
  ["sProc", 2, 3, "yellow", ["Engine (no AI): returns,", "category avg, market →", "category → fund split,", "verdict + worry score"]],
  ["guard", 2, 4, "yellow", ["Guard: 3 sentences,", "every % within ±0.05 pp,", "same verdict → retry", "once, else template"]],
  ["sOut", 2, 5, "yellow", ["Saves report + model,", "tokens, retries and", "job_runs in Neon"]],
  ["gem", 3, 4, "green", ["Gemini writes the", "analyst note from a", "rounded fact sheet", "(JSON schema)"]],
  ["svcIn", 4, 1, "pink", ["mfapi + AMFI NAVs,", "Yahoo index levels,", "GNews + RSS headlines"]],
  ["svcOut", 4, 5, "pink", ["Vercel serves the app;", "“Send to my CA” opens", "a WhatsApp summary"]],
  ["dash", 5, 5, "red", ["Dashboard: value,", "holdings, verdict,", "allocation, fund sheets"]],
];

const laneTop = (i) => HEAD_Y + HEAD_H + i * LANE_H;
const colLeft = (c) => X0 + ACTOR_W + c * COL_W;
const box = {};
for (const [id, lane, col] of BOXES) {
  const x = colLeft(col) + (COL_W - BOX_W) / 2;
  const y = laneTop(lane) + (LANE_H - BOX_H) / 2;
  box[id] = { x, y, cx: x + BOX_W / 2, cy: y + BOX_H / 2, r: x + BOX_W, b: y + BOX_H };
}

// Orthogonal dashed connectors: arrays of points; the last segment gets the arrowhead.
const P = (b, side, off = 0) => ({
  top: [b.cx + off, b.y],
  bottom: [b.cx + off, b.b],
  left: [b.x, b.cy + off],
  right: [b.r, b.cy + off],
})[side];
const G = 8; // gap before the arrowhead touches a box
const ARROWS = [
  // Meera's trigger feeds her input; her input reaches the backend.
  [P(box.mTrig, "right"), [box.mIn.x - G, box.mTrig.cy]],
  [P(box.mIn, "bottom"), [box.mIn.cx, box.sIn.y - G]],
  // Cron fetches live data from the services…
  [P(box.cron, "bottom"), [box.cron.cx, box.svcIn.cy], [box.svcIn.x - G, box.svcIn.cy]],
  // …and kicks off the weekly engine run.
  [P(box.cron, "right"), [box.sProc.cx, box.cron.cy], [box.sProc.cx, box.sProc.y - G]],
  // Services data is stored as context.
  [P(box.svcIn, "right"), [box.sCtx.cx, box.svcIn.cy], [box.sCtx.cx, box.sCtx.b + G]],
  [P(box.sIn, "right"), [box.sCtx.x - G, box.sIn.cy]],
  [P(box.sCtx, "right"), [box.sProc.x - G, box.sCtx.cy]],
  // Engine → Gemini → guard → saved report.
  [P(box.sProc, "bottom"), [box.sProc.cx, box.gem.cy], [box.gem.x - G, box.gem.cy]],
  [P(box.gem, "top"), [box.gem.cx, box.guard.b + G]],
  [P(box.guard, "right"), [box.sOut.x - G, box.guard.cy]],
  [P(box.sOut, "bottom"), [box.sOut.cx, box.svcOut.y - G]],
  [P(box.svcOut, "bottom"), [box.svcOut.cx, box.dash.y - G]],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const H = laneTop(LANES.length) + 8;
const font = `"Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif`;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${font}'>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${NAVY}"/></marker></defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${W / 2}" y="62" text-anchor="middle" font-size="36" font-weight="700" fill="${NAVY}">${esc(TITLE)}</text>
`;
// Lanes
LANES.forEach((l, i) => {
  svg += `<rect x="${X0 + ACTOR_W}" y="${laneTop(i)}" width="${W - 24 - X0 - ACTOR_W}" height="${LANE_H}" fill="${l.bg}"/>\n`;
});
// Column separators
for (let c = 1; c < COLS.length; c++) svg += `<line x1="${colLeft(c)}" y1="${HEAD_Y + HEAD_H}" x2="${colLeft(c)}" y2="${laneTop(LANES.length)}" stroke="#d5d9e2" stroke-width="1"/>\n`;
// Header
svg += `<rect x="${X0}" y="${HEAD_Y}" width="${W - 48}" height="${HEAD_H + 10}" rx="10" fill="${NAVY}"/>\n`;
svg += `<rect x="${X0}" y="${HEAD_Y + HEAD_H}" width="${ACTOR_W}" height="${LANE_H * LANES.length}" fill="${NAVY}"/>\n`;
svg += `<text x="${X0 + ACTOR_W / 2}" y="${HEAD_Y + 43}" text-anchor="middle" font-size="22" fill="#ffffff">Actor</text>\n`;
COLS.forEach((c, i) => {
  if (i > 0) svg += `<line x1="${colLeft(i)}" y1="${HEAD_Y}" x2="${colLeft(i)}" y2="${HEAD_Y + HEAD_H}" stroke="#34405c" stroke-width="1"/>\n`;
  svg += `<text x="${colLeft(i) + COL_W / 2}" y="${HEAD_Y + 43}" text-anchor="middle" font-size="22" fill="#ffffff">${c}</text>\n`;
});
svg += `<line x1="${X0 + ACTOR_W}" y1="${HEAD_Y}" x2="${X0 + ACTOR_W}" y2="${HEAD_Y + HEAD_H}" stroke="#34405c" stroke-width="1"/>\n`;
// Actor labels
LANES.forEach((l, i) => {
  const top = laneTop(i);
  if (i > 0) svg += `<line x1="${X0}" y1="${top}" x2="${X0 + ACTOR_W}" y2="${top}" stroke="#34405c" stroke-width="1"/>\n`;
  const lines = 1 + l.sub.length;
  const startY = top + LANE_H / 2 - ((lines - 1) * 24) / 2 + 2;
  svg += `<text x="${X0 + ACTOR_W / 2}" y="${startY}" text-anchor="middle" font-size="23" font-weight="700" fill="#ffffff">${esc(l.name)}</text>\n`;
  l.sub.forEach((s, j) => {
    svg += `<text x="${X0 + ACTOR_W / 2}" y="${startY + 28 + j * 22}" text-anchor="middle" font-size="17" fill="#c9d1e3">${esc(s)}</text>\n`;
  });
});
// Arrows (under boxes)
for (const pts of ARROWS) {
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  svg += `<path d="${d}" fill="none" stroke="${NAVY}" stroke-width="2.2" stroke-dasharray="7 6" marker-end="url(#arrow)"/>\n`;
}
// Boxes
for (const [id, , , style, lines] of BOXES) {
  const b = box[id];
  const s = STYLE[style];
  svg += `<rect x="${b.x}" y="${b.y}" width="${BOX_W}" height="${BOX_H}" rx="12" fill="${s.fill}" stroke="${s.stroke}" stroke-width="2.4"/>\n`;
  const lh = 25;
  const y0 = b.cy - ((lines.length - 1) * lh) / 2 + 6;
  lines.forEach((t, j) => {
    svg += `<text x="${b.cx}" y="${y0 + j * lh}" text-anchor="middle" font-size="18" fill="${NAVY}">${esc(t)}</text>\n`;
  });
}
svg += `</svg>\n`;

writeFileSync(new URL("../docs/components-map.svg", import.meta.url), svg);
console.log(`docs/components-map.svg ${W}x${H}`);
