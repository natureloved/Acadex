import Link from "next/link";

import { RoleBadge } from "@/components/ui";
import { logoutAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/services/notifications";

/**
 * Site header — server rendered, so the signed-in user's name and role are
 * available on first paint without a client fetch.
 *
 * The "Sign out" control is a real form posting to a server action, which means
 * logging out works even with JavaScript disabled. The notification count is read
 * on the server for the same reason: a badge that only appeared after a client
 * fetch would be missing for anyone on a slow connection, and the page it links
 * to has to be usable without JavaScript anyway.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();

  // Only signed-in users have notices, and only they pay for the count query.
  const unread = user ? await unreadCount(user.id) : 0;

  const navLink =
    "rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-lg bg-blue-700 text-sm font-bold text-white"
          >
            Ax
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900">
            Acadex
          </span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1">
          <Link href="/calendar" className={navLink}>
            Calendar
          </Link>
          {user ? (
            <Link href="/notifications" className={navLink}>
              Notifications
              {/* At zero there is no badge at all: an empty chip is noise, and a
                  badge that is always present stops meaning "something is
                  waiting for you". */}
              {unread > 0 ? (
                <span
                  aria-label={`${unread} unread notification${unread === 1 ? "" : "s"}`}
                  className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 py-0.5 text-xs font-semibold text-white"
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

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-slate-700 sm:inline">
                {user.name}
              </span>
              <RoleBadge role={user.role} />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-100"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className={navLink}>
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-800"
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
