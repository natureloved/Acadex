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

/** Demo accounts created by prisma/seed.ts — remove for a real deployment. */
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
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        Sign in to manage the calendar or to see staff-only notices.
      </p>

      {message ? (
        <p
          role="alert"
          className="mt-5 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
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

      <p className="mt-4 text-sm text-slate-600">
        New student?{" "}
        <Link href="/register" className="font-semibold text-blue-700 hover:underline">
          Create an account
        </Link>
      </p>

      {/* Clearly marked as seed data so it is never mistaken for production. */}
      <aside className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Demo accounts (seed data)
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Password for every demo account:{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.8rem]">
            Password123!
          </code>
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{account.role}:</span>
              <code className="font-mono">{account.email}</code>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
