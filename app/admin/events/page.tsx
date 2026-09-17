import Link from "next/link";

import {
  buttonPrimary,
  buttonSecondary,
  CategoryChip,
  EmptyState,
  inputClasses,
  labelClasses,
  PageHeading,
  StatusBadge,
} from "@/components/ui";
import {
  EVENT_STATUSES,
  SCOPE_LABELS,
  SEMESTER_LABELS,
  STATUS_LABELS,
  type EventScope,
  type EventStatus,
  type SemesterType,
} from "@/lib/constants";
import {
  getCategoryOptions,
  getSemesterOptions,
  getSessionOptions,
} from "@/lib/events";
import { formatDateRange } from "@/lib/format";
import { firstParam } from "@/lib/params";
import { listEventsForAdmin } from "@/lib/services/events";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

/**
 * The registry's working list.
 *
 * A plain GET form drives the filters, so a filtered view is a shareable URL
 * and works without client JavaScript.
 */
export default async function AdminEventsPage(props: PageProps<"/admin/events">) {
  const searchParams = await props.searchParams;

  const sessionId = firstParam(searchParams.session);
  const semesterId = firstParam(searchParams.semester);
  const status = firstParam(searchParams.status);
  const categorySlug = firstParam(searchParams.category);
  const query = firstParam(searchParams.q);
  const deleted = firstParam(searchParams.deleted) === "1";

  const [events, sessions, semesters, categories] = await Promise.all([
    listEventsForAdmin({ sessionId, semesterId, status, categorySlug, q: query }),
    getSessionOptions(),
    getSemesterOptions(),
    getCategoryOptions(),
  ]);

  const drafts = events.filter((event) => event.status === "DRAFT").length;

  return (
    <div>
      <PageHeading
        title="Events"
        description="Every event across every session, newest dates first. Drafts are only visible here."
      >
        <Link href="/admin/events/new" className={buttonPrimary}>
          New event
        </Link>
      </PageHeading>

      {deleted ? (
        <p
          role="status"
          className="mb-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          Draft deleted. The removal is recorded in the audit log.
        </p>
      ) : null}

      <form
        method="get"
        action="/admin/events"
        className="mb-5 rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="q" className={labelClasses}>
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query ?? ""}
              className={`${inputClasses} mt-1`}
              placeholder="Title, venue or description"
            />
          </div>

          <div>
            <label htmlFor="session" className={labelClasses}>
              Session
            </label>
            <select
              id="session"
              name="session"
              defaultValue={sessionId ?? ""}
              className={`${inputClasses} mt-1`}
            >
              <option value="">All sessions</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.isActive ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="semester" className={labelClasses}>
              Semester
            </label>
            <select
              id="semester"
              name="semester"
              defaultValue={semesterId ?? ""}
              className={`${inputClasses} mt-1`}
            >
              <option value="">All semesters</option>
              {semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.session.name} /{" "}
                  {SEMESTER_LABELS[semester.type as SemesterType] ?? semester.type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="status" className={labelClasses}>
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status ?? ""}
              className={`${inputClasses} mt-1`}
            >
              <option value="">Any status</option>
              {EVENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value as EventStatus] ?? value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="category" className={labelClasses}>
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue={categorySlug ?? ""}
              className={`${inputClasses} mt-1`}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonPrimary}>
            Apply filters
          </button>
          <Link href="/admin/events" className={buttonSecondary}>
            Clear
          </Link>
          <p className="ml-auto text-sm text-slate-600">
            {events.length} shown
            {drafts > 0 ? ` / ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </form>

      {events.length === 0 ? (
        <EmptyState
          title="No events match those filters"
          body="Try another session or status, or create a new event."
          action={{ href: "/admin/events/new", label: "New event" }}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Event
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Dates
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Semester
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Audience
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Rev
                </th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="font-semibold text-slate-900 hover:text-blue-800 hover:underline"
                    >
                      {event.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <CategoryChip
                        name={event.category.name}
                        color={event.category.color}
                      />
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatDateRange(event.startAt, event.endAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {event.semester.session.name} /{" "}
                    {SEMESTER_LABELS[event.semester.type as SemesterType] ??
                      event.semester.type}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {SCOPE_LABELS[event.scope as EventScope] ?? event.scope}
                    {event.targetCount > 0 ? (
                      <span className="block text-xs text-slate-500">
                        {event.targetCount} target
                        {event.targetCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {event.visibility === "STAFF_ONLY" ? (
                      <span className="mt-1 block text-xs font-medium text-slate-600">
                        Staff only
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">
                    {event.version}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
