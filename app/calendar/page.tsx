import Link from "next/link";

import { EventAgendaItem } from "@/components/event-agenda-item";
import {
  buttonPrimary,
  buttonSecondary,
  EmptyState,
  inputClasses,
  labelClasses,
  PageHeading,
} from "@/components/ui";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import {
  getCategoryOptions,
  getSemesterOptions,
  getSessionOptions,
  listAgenda,
} from "@/lib/events";
import { formatMonthHeading, monthKey } from "@/lib/format";
import { firstParam } from "@/lib/params";
import type { EventCard } from "@/lib/events";

export const metadata = {
  title: "Academic calendar",
  description:
    "Every published date on the LASU academic calendar — upcoming events first, with the full session archive one click away.",
};

/**
 * Public calendar.
 *
 * A plain GET form performs the filtering, so the page works with no client
 * JavaScript at all: the browser navigates to /calendar?session=…&range=…&q=…
 * and the server renders the result. That keeps the page usable on a low-end
 * phone and makes every filtered view a shareable URL.
 *
 * The default view is `range=upcoming`: events that have not finished yet.
 * The archived 2025/2026 session never dominates the landing view, but it
 * stays reachable through the Session filter, the Semester filter, or the
 * "browse the archive" link below the filters.
 */
export default async function CalendarPage(props: PageProps<"/calendar">) {
  const searchParams = await props.searchParams;

  const sessionId = firstParam(searchParams.session);
  const semesterId = firstParam(searchParams.semester);
  const categorySlug = firstParam(searchParams.category);
  const query = firstParam(searchParams.q);
  const rangeRaw = firstParam(searchParams.range);
  const range = rangeRaw === "past" || rangeRaw === "all" ? rangeRaw : "upcoming";
  const forbidden = firstParam(searchParams.error) === "forbidden";
  const welcome = firstParam(searchParams.welcome) === "1";

  const [events, sessions, semesters, categories] = await Promise.all([
    listAgenda({ sessionId, semesterId, categorySlug, q: query, range }),
    getSessionOptions(),
    getSemesterOptions(),
    getCategoryOptions(),
  ]);

  // The concluded session, linked from the default view so the archive is
  // never more than one click away.
  const archiveSession = sessions.find((session) => !session.isActive);

  // Group into month buckets. `events` is already chronological (oldest first
  // for upcoming/all, newest first for past), so a Map preserves the order
  // without a second sort.
  const byMonth = new Map<string, { label: string; events: EventCard[] }>();
  for (const event of events) {
    const key = monthKey(event.startAt);
    const bucket = byMonth.get(key);
    if (bucket) {
      bucket.events.push(event);
    } else {
      byMonth.set(key, {
        label: formatMonthHeading(event.startAt),
        events: [event],
      });
    }
  }

  const hasFilters = Boolean(
    sessionId || semesterId || categorySlug || query || range !== "upcoming",
  );
  const isDefaultView = !hasFilters;

  const countLabel =
    range === "upcoming"
      ? "upcoming"
      : range === "past"
        ? "past"
        : "";

  return (
    <div>
      <PageHeading
        title="Academic calendar"
        description="Published dates across every LASU academic session — upcoming events first. Draft events are never shown here."
      />

      {forbidden ? (
        <p
          role="alert"
          className="mb-6 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
        >
          That area is restricted. You are signed in, but your role does not have
          access to it.
        </p>
      ) : null}

      {welcome ? (
        <p
          role="status"
          className="mb-6 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          Your account has been created. Welcome to Acadex.
        </p>
      ) : null}

      {/* ---- Filters -------------------------------------------------- */}
      <form method="get" action="/calendar" className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="filter-q" className={labelClasses}>
              Search
            </label>
            <input
              id="filter-q"
              type="search"
              name="q"
              defaultValue={query ?? ""}
              placeholder="e.g. examination"
              className={`${inputClasses} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="filter-session" className={labelClasses}>
              Session
            </label>
            <select
              id="filter-session"
              name="session"
              defaultValue={sessionId ?? ""}
              className={`${inputClasses} mt-1`}
            >
              <option value="">All sessions</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.isActive ? " (current)" : " (archived)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-range" className={labelClasses}>
              Period
            </label>
            <select
              id="filter-range"
              name="range"
              defaultValue={range}
              className={`${inputClasses} mt-1`}
            >
              <option value="upcoming">Upcoming and ongoing</option>
              <option value="past">Past events</option>
              <option value="all">Everything</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-semester" className={labelClasses}>
              Semester
            </label>
            <select
              id="filter-semester"
              name="semester"
              defaultValue={semesterId ?? ""}
              className={`${inputClasses} mt-1`}
            >
              <option value="">All semesters</option>
              {semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.session.name} —{" "}
                  {SEMESTER_LABELS[semester.type as SemesterType] ?? semester.type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-category" className={labelClasses}>
              Category
            </label>
            <select
              id="filter-category"
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="submit" className={buttonPrimary}>
            Apply filters
          </button>
          {hasFilters ? (
            <Link href="/calendar" className={buttonSecondary}>
              Clear
            </Link>
          ) : null}
          <p className="ml-auto text-sm text-slate-600" aria-live="polite">
            {events.length} {countLabel}{" "}
            {events.length === 1 ? "event" : "events"}
          </p>
        </div>
      </form>

      {/* ---- Archive shortcut ----------------------------------------- */}
      {isDefaultView && archiveSession ? (
        <p className="mb-6 text-sm text-slate-600">
          Showing events that have not finished yet. Looking for the{" "}
          {archiveSession.name} session?{" "}
          <Link
            href={`/calendar?session=${archiveSession.id}&range=all`}
            className="font-medium text-blue-700 hover:underline"
          >
            Browse the {archiveSession.name} archive
          </Link>
          .
        </p>
      ) : null}

      {/* ---- Agenda --------------------------------------------------- */}
      {events.length === 0 ? (
        <EmptyState
          title="No events match those filters"
          body="Try a different session, period or category, or clear the filters to see what is coming up."
          action={{ href: "/calendar", label: "Show upcoming events" }}
        />
      ) : (
        <div className="space-y-8">
          {[...byMonth.entries()].map(([key, bucket]) => (
            <section key={key} aria-labelledby={`month-${key}`}>
              <h2
                id={`month-${key}`}
                className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500"
              >
                {bucket.label}
              </h2>
              <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {bucket.events.map((event) => (
                  <EventAgendaItem key={event.id} event={event} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
