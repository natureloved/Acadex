import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonPrimary, inputClasses, labelClasses } from "@/components/ui";
import { listFacultiesWithDepartments } from "@/lib/academics";
import { registerAction } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-messages";
import { LEVELS } from "@/lib/constants";
import { firstParam } from "@/lib/params";

export const metadata = {
  title: "Create a student account",
};

/**
 * Student self-registration.
 *
 * The department is a single grouped select rather than a faculty select plus a
 * dependent department select: the dependent pair would need client-side
 * JavaScript to filter, and the server derives the faculty from the chosen
 * department anyway, which removes the possibility of an inconsistent pair.
 */
export default async function RegisterPage(props: PageProps<"/register">) {
  const searchParams = await props.searchParams;

  const user = await getCurrentUser();
  if (user) redirect("/calendar");

  const message = authErrorMessage(firstParam(searchParams.error));
  const faculties = await listFacultiesWithDepartments();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-['Fraunces'] text-2xl font-medium tracking-tight text-[var(--ink)] sm:text-3xl">
        Create a student account
      </h1>
      <p className="mt-1.5 text-sm text-[var(--ink-2)]">
        Self-registration is for students. Staff and administrator accounts are
        created by the registry.
      </p>

      {message ? (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-600/30"
        >
          {message}
        </p>
      ) : null}

      <form action={registerAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className={labelClasses}>
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className={`${inputClasses} mt-1`}
          />
        </div>

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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className={labelClasses}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={`${inputClasses} mt-1`}
            />
            <p className="mt-1 text-xs text-slate-500">
              At least 8 characters, with a letter and a number.
            </p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className={labelClasses}>
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={`${inputClasses} mt-1`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="departmentId" className={labelClasses}>
            Faculty and department
          </label>
          <select
            id="departmentId"
            name="departmentId"
            required
            defaultValue=""
            className={`${inputClasses} mt-1`}
          >
            <option value="" disabled>
              Select your department
            </option>
            {faculties.map((faculty) => (
              <optgroup key={faculty.id} label={faculty.name}>
                {faculty.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="level" className={labelClasses}>
            Level
          </label>
          <select
            id="level"
            name="level"
            required
            defaultValue=""
            className={`${inputClasses} mt-1`}
          >
            <option value="" disabled>
              Select your level
            </option>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level} Level
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={`${buttonPrimary} w-full`}>
          Create account
        </button>
      </form>

      <p className="mt-5 text-sm text-[var(--ink-2)]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[var(--green)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
