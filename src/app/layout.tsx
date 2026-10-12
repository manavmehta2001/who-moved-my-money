import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import { AdminProvider } from "@/components/admin/AdminProvider";
import { GlossaryProvider } from "@/components/glossary/Glossary";
import { SiteNav } from "@/components/SiteNav";
import { THEME_INIT_SCRIPT, ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Who moved my money?", template: "%s · Who moved my money?" },
  description: "Meera's mutual fund dashboard: what moved each fund this week — the market, its category, or the fund itself.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#131a24" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AdminProvider>
          <GlossaryProvider>
            <header className="app-header">
              <div className="app-header-inner">
                <Link href="/" className="brand">
                  <span className="brand-mark" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 11.5l3.5-3.5 2.5 2.5L14 4.5" />
                      <path d="M10 4.5h4v4" />
                    </svg>
                  </span>
                  Who moved my money?
                </Link>
                <SiteNav />
                <div className="header-tools">
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main id="main" className="container">
              {children}
            </main>
            <footer className="site-footer">
              <p>This is an educational tool, not investment advice. Not SEBI-registered advice.</p>
              <p>NAVs: mfapi.in and AMFI · Benchmarks: index funds via mfapi.in and Yahoo Finance · News: GNews and Google News · Analyst note: Google Gemini.</p>
            </footer>
          </GlossaryProvider>
        </AdminProvider>
      </body>
    </html>
  );
}
