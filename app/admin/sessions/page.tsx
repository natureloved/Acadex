import Link from "next/link";

import {
  buttonPrimary,
  buttonSecondary,
  inputClasses,
  labelClasses,
  PageHeading,
} from "@/components/ui";
import {
  activateSessionAction,
  createSemesterAction,
  createSessionAction,
  deleteSessionAction,
  updateSemesterAction,
  updateSessionAction,
} from "@/lib/actions/admin-sessions";
import { SEMESTER_LABELS, SEMESTER_TYPES, type SemesterType } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { firstParam } from "@/lib/params";
import { listSessionsForAdmin } from "@/lib/services/sessions";
import { toDateInputValue } from "@/lib/services/shared";

export const metadata = { title: "Sessions" };
export const dynamic = "force-dynamic";

const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-rose-800 ring-1 ring-rose-300 transition-all duration-150 hover:bg-rose-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600";

/**
 * Sessions and semesters.
 *
 * Exactly one session may be active: that is the session the dashboard reports
 * on, and the rule is enforced inside the service layer, not by hiding buttons.
 */
export default async function AdminSessionsPage(
  props: PageProps<"/admin/sessions">,
) {
  const searchParams = await props.searchParams;

  const saved = firstParam(searchParams.saved);
  const error = firstParam(searchParams.error);

  const sessions = await listSessionsForAdmin();
  const today = toDateInputValue(new Date());

  return (
    <div>
      <PageHeading
        title="Sessions and semesters"
        description="A session owns two semesters, and every event belongs to one of them."
      />

      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
        >
          {error}
        </p>
      ) : null}

      {saved ? (
        <p
          role="status"
          className="mb-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          {saved}
        </p>
      ) : null}

      {/* ---- New session ------------------------------------------------ */}
      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Add a session</h2>
        <form
          action={createSessionAction}
          className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label htmlFor="new-name" className={labelClasses}>
              Name
            </label>
            <input
              id="new-name"
              name="name"
              required
              placeholder="2027/2028"
              pattern="\d{4}/\d{4}"
              className={`${inputClasses} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="new-start" className={labelClasses}>
              Starts
            </label>
            <input
              id="new-start"
              name="startDate"
              type="date"
              required
              defaultValue={today}
              className={`${inputClasses} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="new-end" className={labelClasses}>
              Ends
            </label>
            <input
              id="new-end"
              name="endDate"
              type="date"
              required
              defaultValue={today}
              className={`${inputClasses} mt-1`}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                name="isActive"
                className="size-4 rounded border-slate-300"
              />
              Make it the active session
            </label>
          </div>
          <div className="flex items-end">
            <button type="submit" className={buttonPrimary}>
              Add session
            </button>
          </div>
        </form>
      </section>

      {/* ---- Existing sessions ------------------------------------------ */}
      <div className="space-y-6">
        {sessions.map((session) => {
          const canDelete = !session.isActive && session.eventCount === 0;

          return (
            <article
              key={session.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
                <h2 className="text-base font-bold text-slate-900">{session.name}</h2>
                {session.isActive ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-300">
                    Archived
                  </span>
                )}
                <p className="text-sm text-slate-600">
                  {formatDate(session.startDate)} - {formatDate(session.endDate)}
                  {" · "}
                  {session.eventCount} event{session.eventCount === 1 ? "" : "s"}
                </p>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {!session.isActive ? (
                    <form action={activateSessionAction}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 transition-all duration-150 hover:bg-slate-100 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Make active
                      </button>
                    </form>
                  ) : null}

                  <form action={deleteSessionAction}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button
                      type="submit"
                      disabled={!canDelete}
                      title={
                        canDelete
                          ? undefined
                          : session.isActive
                            ? "The active session cannot be deleted"
                            : "Sessions with events cannot be deleted"
                      }
                      className={`${DANGER_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </header>

              <div className="space-y-5 p-5">
                {session.semesters.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">
                    No semesters yet. Events cannot be created until this session has
                    a semester.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            Semester
                          </th>
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Runs
                          </th>
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Events
                          </th>
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Adjust dates
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.semesters.map((semester) => (
                          <tr
                            key={semester.id}
                            className="border-b border-slate-100 align-top last:border-b-0"
                          >
                            <td className="py-3 pr-3 font-medium text-slate-800">
                              {SEMESTER_LABELS[semester.type as SemesterType] ??
                                semester.type}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                              {formatDate(semester.startDate)} -{" "}
                              {formatDate(semester.endDate)}
                            </td>
                            <td className="px-3 py-3 tabular-nums text-slate-700">
                              {semester.eventCount}
                            </td>
                            <td className="px-3 py-3">
                              <details>
                                <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:underline">
                                  Edit
                                </summary>
                                <form
                                  action={updateSemesterAction}
                                  className="mt-2 flex flex-wrap items-end gap-2"
                                >
                                  <input
                                    type="hidden"
                                    name="semesterId"
                                    value={semester.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="sessionId"
                                    value={session.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="type"
                                    value={semester.type}
                                  />
                                  <div>
                                    <label
                                      className={labelClasses}
                                      htmlFor={`sem-start-${semester.id}`}
                                    >
                                      Starts
                                    </label>
                                    <input
                                      id={`sem-start-${semester.id}`}
                                      name="startDate"
                                      type="date"
                                      required
                                      defaultValue={toDateInputValue(semester.startDate)}
                                      className={inputClasses}
                                    />
                                  </div>
                                  <div>
                                    <label
                                      className={labelClasses}
                                      htmlFor={`sem-end-${semester.id}`}
                                    >
                                      Ends
                                    </label>
                                    <input
                                      id={`sem-end-${semester.id}`}
                                      name="endDate"
                                      type="date"
                                      required
                                      defaultValue={toDateInputValue(semester.endDate)}
                                      className={inputClasses}
                                    />
                                  </div>
                                  <button type="submit" className={buttonSecondary}>
                                    Save
                                  </button>
                                </form>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <form
                  action={createSemesterAction}
                  className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4"
                >
                  <input type="hidden" name="sessionId" value={session.id} />
                  <div>
                    <label className={labelClasses} htmlFor={`type-${session.id}`}>
                      Add semester
                    </label>
                    <select
                      id={`type-${session.id}`}
                      name="type"
                      className={inputClasses}
                      defaultValue="FIRST"
                    >
                      {SEMESTER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {SEMESTER_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClasses} htmlFor={`start-${session.id}`}>
                      Starts
                    </label>
                    <input
                      id={`start-${session.id}`}
                      name="startDate"
                      type="date"
                      required
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses} htmlFor={`end-${session.id}`}>
                      Ends
                    </label>
                    <input
                      id={`end-${session.id}`}
                      name="endDate"
                      type="date"
                      required
                      className={inputClasses}
                    />
                  </div>
                  <button type="submit" className={buttonSecondary}>
                    Add semester
                  </button>
                </form>

                <details className="border-t border-slate-200 pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:underline">
                    Edit session details
                  </summary>
                  <form
                    action={updateSessionAction}
                    className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                  >
                    <input type="hidden" name="sessionId" value={session.id} />
                    <div>
                      <label className={labelClasses} htmlFor={`name-${session.id}`}>
                        Name
                      </label>
                      <input
                        id={`name-${session.id}`}
                        name="name"
                        required
                        defaultValue={session.name}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className={labelClasses} htmlFor={`s-start-${session.id}`}>
                        Starts
                      </label>
                      <input
                        id={`s-start-${session.id}`}
                        name="startDate"
                        type="date"
                        required
                        defaultValue={toDateInputValue(session.startDate)}
                        className={inputClasses}
                      />
                    </div>
                    <div>
                      <label className={labelClasses} htmlFor={`s-end-${session.id}`}>
                        Ends
                      </label>
                      <input
                        id={`s-end-${session.id}`}
                        name="endDate"
                        type="date"
                        required
                        defaultValue={toDateInputValue(session.endDate)}
                        className={inputClasses}
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                          type="checkbox"
                          name="isActive"
                          defaultChecked={session.isActive}
                          className="size-4 rounded border-slate-300"
                        />
                        Active session
                      </label>
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className={buttonSecondary}>
                        Save session
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-slate-600">
        Looking for a session&rsquo;s events?{" "}
        <Link href="/admin/events" className="font-medium text-blue-700 hover:underline">
          Filter the event list
        </Link>
        .
      </p>
    </div>
  );
}
