/** One-sentence plain explanations, shown when a dotted-underlined term is tapped. */
export const GLOSSARY: Record<string, string> = {
  NAV: "Net asset value: the price of one unit of a mutual fund, worked out once a day after markets close.",
  benchmark: "The market index a fund is measured against, like the Nifty 50 for large companies.",
  "the market": "Here, the fund's benchmark index: what the whole slice of the market it invests in did.",
  "category average": "The average return of all similar funds (same SEBI category, direct growth plans).",
  "similar funds": "Other funds in the same SEBI category, compared using their direct growth plans.",
  "funds like yours": "Other funds in the same SEBI category, compared using their direct growth plans.",
  "your fund's choices": "The part of the return that came from the fund manager's own picks, beyond what similar funds did.",
  YTD: "Year to date: the return since the last working day of last year.",
  "year to date": "The return since the last working day of last year.",
  "year-to-date": "The return since the last working day of last year.",
  "percentage points": "The plain difference between two percentages: 5% versus 3% is 2 percentage points.",
  "index fund": "A fund that simply copies a market index instead of picking stocks.",
  "debt fund": "A fund that lends money by holding bonds; it usually moves slowly and steadily.",
  "short-duration": "A debt fund that holds bonds maturing in roughly one to three years.",
  "credit event": "When a company that borrowed money is downgraded or can't repay, which hurts funds holding its bonds.",
  "repo rate": "The interest rate at which the RBI lends to banks; raising it usually pushes bond prices down.",
  RBI: "The Reserve Bank of India, the country's central bank.",
  FII: "Foreign institutional investors: big overseas funds buying or selling Indian shares.",
  FPI: "Foreign portfolio investors: overseas investors holding Indian shares and bonds.",
  "fund of funds": "A fund that invests in other funds, often ones abroad.",
  "mid-cap": "Mid-sized companies, ranked 101st to 250th in India by market value.",
  "mid cap": "Mid-sized companies, ranked 101st to 250th in India by market value.",
  "small-cap": "Smaller companies, ranked 251st and below in India by market value.",
  "small cap": "Smaller companies, ranked 251st and below in India by market value.",
  "large-cap": "India's 100 biggest companies by market value.",
  "large cap": "India's 100 biggest companies by market value.",
  "expense ratio": "The yearly fee a fund charges, taken out of its NAV a little each day.",
  "total return index": "An index that assumes dividends are reinvested, which is the fair way to compare a growth fund.",
  SIP: "A systematic investment plan: a fixed amount invested automatically every month.",
  "allocation": "How your money is split across your funds.",
  "Direct plan": "The version of a fund bought without a distributor, with lower fees.",
};

/** Glossary terms that appear in `text`, case-insensitive, longest first so "year-to-date" beats "YTD". */
export function termsIn(text: string): string[] {
  const found: string[] = [];
  for (const term of Object.keys(GLOSSARY).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]")}\\b`, "i");
    if (re.test(text)) found.push(term);
  }
  return found;
}

export function explain(term: string): string | null {
  const key = Object.keys(GLOSSARY).find((k) => k.toLowerCase() === term.toLowerCase().trim());
  return key ? GLOSSARY[key] : null;
}
