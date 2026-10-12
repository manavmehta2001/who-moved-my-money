import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";
import { GlossaryProvider } from "@/components/glossary/Glossary";
import { SiteNav } from "@/components/SiteNav";
import { THEME_INIT_SCRIPT, ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap" });
// Atkinson Hyperlegible was designed by the Braille Institute for low-vision readers: chosen for non-experts.
const body = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"], display: "swap", adjustFontFallback: false });

export const metadata: Metadata = {
  title: { default: "Who moved my money?", template: "%s · Who moved my money?" },
  description: "Meera's Saturday mutual fund check-in: did the market, funds like hers, or her fund itself move her money this week?",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceeea" },
    { media: "(prefers-color-scheme: dark)", color: "#141a22" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <GlossaryProvider>
          <div className="page">
            <header className="site-header">
              <Link href="/" className="brand">
                <span className="brand-mark" aria-hidden="true" />
                Who moved my money?
              </Link>
              <ThemeToggle />
              <SiteNav />
            </header>
            <main id="main">{children}</main>
            <footer className="site-footer">
              <p>This is an educational tool, not investment advice. Not SEBI-registered advice.</p>
              <p>
                NAVs from mfapi.in and AMFI · benchmarks from index funds (mfapi.in) and Yahoo Finance · news from GNews and Google News · written by Google Gemini.
              </p>
            </footer>
          </div>
        </GlossaryProvider>
      </body>
    </html>
  );
}
