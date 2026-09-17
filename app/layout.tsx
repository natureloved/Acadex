import type { Metadata } from "next";

import { AppChrome } from "@/components/app-chrome";
import { AppFooter } from "@/components/app-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Acadex : Academic Calendar Management, beautifully run",
    template: "%s · Acadex",
  },
  description:
    "Acadex helps registrars, deans, and departments draft, approve, and publish academic calendars : semesters, exams, holidays, and registration windows : so everyone sees the same, current dates.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" id="top">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="flex min-h-full flex-col font-['Sora',sans-serif] bg-[var(--paper)] text-[var(--ink)]">
        <div className="grain" aria-hidden="true" />
        <AppChrome header={<SiteHeader />} footer={<AppFooter />}>
          {children}
        </AppChrome>
      </body>
    </html>
  );
}
