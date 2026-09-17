import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-[var(--paper-2)]">
      <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-[var(--ink-2)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="27" height="27" rx="7" fill="var(--green)" />
              <path d="M4.5 9.5h21" stroke="#F7F2E7" strokeWidth="2" strokeLinecap="round" />
              <path d="M9.5 1.5v8M20.5 1.5v8" stroke="#F7F2E7" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="10.5" cy="18.5" r="2.6" fill="#F7F2E7" />
            </svg>
            <span className="font-['Fraunces'] font-semibold text-sm text-[var(--ink)]">Acadex</span>
            <span className="font-['Spline_Sans_Mono'] text-[11px] text-[var(--ink-3)]">· Academic Calendar Management</span>
          </div>
          <div className="flex items-center gap-4 font-['Spline_Sans_Mono'] text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
            <Link href="/" className="hover:text-[var(--green)]">Overview</Link>
            <Link href="/calendar" className="hover:text-[var(--green)]">Calendar</Link>
            <Link href="/subscribe" className="hover:text-[var(--green)]">Feeds</Link>
            <Link href="/calendar/print" className="hover:text-[var(--green)]">Print</Link>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
          Lagos State University academic calendar system. Seeded dates are demonstration records derived from official LASU senate announcements.
        </p>
      </div>
    </footer>
  );
}
