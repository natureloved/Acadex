import Link from "next/link";

import { buttonPrimary, buttonSecondary } from "@/components/ui";

export const metadata = { title: "Page not found" };

/**
 * 404 page.
 *
 * The wording matters more than it looks: a link to an event can stop working
 * *on purpose* in Acadex - a withdrawn date disappears from the calendar, and a
 * draft never appears at all - so the page says so instead of implying the user
 * made a mistake.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        That page is not here
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        The address may have a typo, or the link may be out of date. Dates that
        were withdrawn are removed from the calendar, so an event link can stop
        working on purpose.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/calendar" className={buttonPrimary}>
          View the calendar
        </Link>
        <Link href="/" className={buttonSecondary}>
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
