import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { AdminProvider } from "@/components/admin/AdminProvider";
import { GlossaryProvider } from "@/components/glossary/Glossary";
import { SideRail } from "@/components/shell/SideRail";
import { Ticker } from "@/components/shell/Ticker";
import { TopBar } from "@/components/shell/TopBar";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Who moved my money?", template: "%s · Who moved my money?" },
  description: "Meera's mutual fund dashboard: what moved each fund this week — the market, its category, or the fund itself.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1118" },
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
            <div className="shell">
              <SideRail />
              <div className="shell-main">
                <header className="app-header">
                  <TopBar />
                  <Suspense fallback={<div className="ticker" aria-hidden="true" />}>
                    <Ticker />
                  </Suspense>
                </header>
                <main id="main" className="container">
                  {children}
                </main>
                <footer className="site-footer">
                  <p>This is an educational tool, not investment advice. Not SEBI-registered advice.</p>
                  <p>NAVs: mfapi.in and AMFI · Benchmarks: index funds via mfapi.in and Yahoo Finance · News: GNews and Google News · Analyst note: Google Gemini.</p>
                </footer>
              </div>
            </div>
          </GlossaryProvider>
        </AdminProvider>
      </body>
    </html>
  );
}
