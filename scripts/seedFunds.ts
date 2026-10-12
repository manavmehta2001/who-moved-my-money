/**
 * Meera's portfolio from the brief. Each code was looked up with mfapi search and checked for live NAVs
 * on 12 Oct 2026 (latest NAV dated 09-10-2026). The verified mfapi name is in each comment.
 */
export const SEED_FUNDS: Array<{ schemeCode: string; role: string; monthlySip: number }> = [
  // "HDFC Nifty 50 Index Fund - Direct Plan - Growth Option" — Other Scheme - Index Funds, history from 01-01-2013
  { schemeCode: "119063", role: "Large-cap index fund", monthlySip: 10000 },
  // "HDFC Mid Cap Fund - Direct Plan - Growth Option" — Equity Scheme - Mid Cap Fund, history from 01-01-2013
  { schemeCode: "118989", role: "Mid-cap fund", monthlySip: 7500 },
  // "Nippon India Small Cap Fund - Direct Plan - Growth Option" — Equity Scheme - Small Cap Fund, history from 02-01-2013
  { schemeCode: "118778", role: "Small-cap fund", monthlySip: 5000 },
  // "ICICI Prudential Short Term Fund - Direct Plan - Growth" — Debt Scheme - Short Duration Fund, history from 02-01-2013.
  // (HSBC Short Duration Fund 120062 was rejected: its last NAV is 25-11-2022, the scheme was merged.)
  { schemeCode: "120754", role: "Short-duration debt fund", monthlySip: 5000 },
  // "Edelweiss US Technology Equity Fund of Fund - Direct Plan - Growth" — Other Scheme - FoF Overseas, history from 09-03-2020
  { schemeCode: "148063", role: "International fund of funds", monthlySip: 2500 },
];
