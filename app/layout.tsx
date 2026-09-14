import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Acadex — LASU Academic Calendar",
    template: "%s · Acadex",
  },
  description:
    "The single, always-current academic calendar for Lagos State University: sessions, semesters, registration windows, lectures, examinations and deadlines, with a visible change history when dates move.",
};

/**
 * Root layout.
 *
 * The Geist web fonts were removed deliberately: `next/font/google` downloads
 * font files at build time, which would break the "runs fully offline"
 * requirement and add ~50 KB to the critical path for a student on a slow
 * mobile connection. The system font stack in globals.css is used instead.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* Header reads the session cookie, so every route below it renders
            per-request rather than being prerendered at build time. */}
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl grow px-4 py-8">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-slate-500">
            <p>
              Acadex — Academic Calendar Management System. Final-year project,
              Lagos State University.
            </p>
            <p className="mt-1">
              Seeded calendar dates are demonstration data derived from published
              LASU announcements and must be verified against the official
              calendar before submission.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
