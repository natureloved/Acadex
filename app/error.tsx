"use client";

/**
 * Error boundary for the whole app.
 *
 * Two deliberate constraints:
 *
 *  - **Nothing internal is shown.** The error message and stack are logged to
 *    the console for whoever is debugging, and the *digest* (a hash Next.js
 *    generates for the server-side error) is the only thing rendered, so a
 *    visitor can quote it without the page disclosing file paths, SQL or a
 *    database name. `scripts/verify-phase6.mts` asserts that an error page
 *    contains no stack trace.
 *  - **A real way out.** `reset()` re-renders the segment, and there are links
 *    back to the calendar and home, so a failure is not a dead end.
 */
import Link from "next/link";
import { useEffect } from "react";

import { buttonPrimary, buttonSecondary } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The console is the only place the detail goes. A logging service would be
    // wired in here in a deployment.
    console.error("Unhandled error while rendering:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-rose-700">
        Something went wrong
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        That page could not be loaded
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        The problem has been logged. Any change you were making was either saved
        completely or not at all - nothing is left half-written.
      </p>

      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-slate-500">
          Reference: {error.digest}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={buttonPrimary}>
          Try again
        </button>
        <Link href="/calendar" className={buttonSecondary}>
          Back to the calendar
        </Link>
      </div>
    </div>
  );
}
