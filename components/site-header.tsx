import Link from "next/link";

import { RoleBadge } from "@/components/ui";
import { logoutAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/services/notifications";

/**
 * Site header : server rendered, matching the exact Fraunces/Sora/Spline aesthetic.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();

  // Only signed-in users have notices, and only they pay for the count query.
  const unread = user ? await unreadCount(user.id) : 0;

  const navLink =
    "relative text-[14.5px] font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink)] py-1 after:content-[''] after:absolute after:left-0 after:right-full after:bottom-[-2px] after:h-[1.5px] after:bg-[var(--green)] after:transition-all hover:after:right-0";

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_88%,transparent)] backdrop-blur-[14px]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 transition-transform active:scale-[0.98]">
            <svg width="28" height="28" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="27" height="27" rx="7" fill="var(--green)" />
              <path d="M4.5 9.5h21" stroke="#F7F2E7" strokeWidth="2" strokeLinecap="round" />
              <path d="M9.5 1.5v8M20.5 1.5v8" stroke="#F7F2E7" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="10.5" cy="18.5" r="2.6" fill="#F7F2E7" />
              <circle cx="19" cy="18.5" r="2.6" stroke="#F7F2E7" strokeWidth="1.6" fill="none" />
            </svg>
            <span className="font-['Fraunces'] text-[22px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              Acadex
            </span>
          </Link>

          <nav aria-label="Main" className="hidden sm:flex items-center gap-6">
            {user ? (
              <Link href="/calendar" className={navLink}>
                Calendar
              </Link>
            ) : null}
            {user ? (
              <Link href="/notifications" className={navLink}>
                Notifications
                {unread > 0 ? (
                  <span
                    aria-label={`${unread} unread notification${unread === 1 ? "" : "s"}`}
                    className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--green)] px-1.5 py-0.5 font-['Spline_Sans_Mono'] text-[10px] font-semibold text-[#FBF8F0]"
                  >
                    {unread}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {user?.role === "ADMIN" ? (
              <Link href="/admin" className={navLink}>
                Admin
              </Link>
            ) : null}
            {user?.role === "ADMIN" || user?.role === "STAFF" ? (
              <Link href="/staff" className={navLink}>
                Staff
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-xs font-['Spline_Sans_Mono'] text-[var(--ink-2)] sm:inline">
                {user.name}
              </span>
              <RoleBadge role={user.role} />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--card)] px-3.5 py-1 text-xs font-semibold text-[var(--ink)] transition hover:bg-[#EAF5EE] hover:border-[var(--green)] hover:text-[#165A3D] active:scale-[0.98]"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-xs font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] px-2 py-1"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-full bg-[var(--green)] px-4 py-1.5 text-xs font-semibold text-[#FBF8F0] shadow-sm transition hover:bg-[var(--green-deep)] active:scale-[0.98]"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
