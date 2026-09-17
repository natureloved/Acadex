import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonPrimary, inputClasses, labelClasses } from "@/components/ui";
import { loginAction } from "@/lib/actions/auth";
import { getCurrentUser, safeInternalPath } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-messages";
import { firstParam } from "@/lib/params";

export const metadata = {
  title: "Sign in",
};

/**
 * Demo accounts created by prisma/seed.ts.
 *
 * Rendered only outside production : see the guard around the panel below.
 */
const DEMO_ACCOUNTS = [
  { role: "Administrator", email: "admin@acadex.lasu.edu.ng" },
  { role: "Staff", email: "staff@acadex.lasu.edu.ng" },
  { role: "Student", email: "student@acadex.lasu.edu.ng" },
];

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;

  const user = await getCurrentUser();
  const next = safeInternalPath(searchParams.next);
  const message = authErrorMessage(firstParam(searchParams.error));

  // Someone who is already signed in should not see a login form.
  if (user) redirect(next);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-['Fraunces'] text-2xl font-medium tracking-tight text-[var(--ink)] sm:text-3xl">
        Sign in
      </h1>
      <p className="mt-1.5 text-sm text-[var(--ink-2)]">
        Sign in to access your academic calendar and campus notices.
      </p>

      {message ? (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-600/30"
        >
          {message}
        </p>
      ) : null}

      {/* A server action handles the submit, so this form works with
          JavaScript disabled; only the password check happens server-side. */}
      <form action={loginAction} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />

        <div>
          <label htmlFor="email" className={labelClasses}>
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`${inputClasses} mt-1`}
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClasses}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={`${inputClasses} mt-1`}
          />
        </div>

        <button type="submit" className={`${buttonPrimary} w-full`}>
          Sign in
        </button>
      </form>

      <p className="mt-5 text-sm text-[var(--ink-2)]">
        New student?{" "}
        <Link href="/register" className="font-semibold text-[var(--green)] hover:underline">
          Create an account
        </Link>
      </p>

      {/*
        Demo credentials are a development affordance, not documentation: a
        deployed instance must never advertise a working administrator password.
        The test is NODE_ENV rather than a bespoke flag, so a production build
        cannot ship with the panel switched on by accident.
      */}
      {process.env.NODE_ENV !== "production" ? (
        <aside className="mt-8 rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--card)] p-5 shadow-2xs">
          <h2 className="font-['Spline_Sans_Mono'] text-xs font-semibold uppercase tracking-wider text-[var(--green)]">
            Demo accounts (LASU 2026/2027 Seed Data)
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-2)]">
            Password for every demo account:{" "}
            <code className="rounded bg-[var(--paper-2)] border border-[var(--line)] px-1.5 py-0.5 font-['Spline_Sans_Mono'] text-[0.8rem] font-semibold text-[var(--ink)]">
              Password123!
            </code>
          </p>
          <ul className="mt-2.5 space-y-1.5 text-xs text-[var(--ink)]">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold text-[var(--ink)]">{account.role}:</span>
                <code className="font-['Spline_Sans_Mono'] text-[var(--ink-2)]">{account.email}</code>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}
