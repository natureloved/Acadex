import Link from "next/link";
import { redirect } from "next/navigation";

import { EventAgendaItem } from "@/components/event-agenda-item";
import { MonthGrid } from "@/components/month-grid";
import {
  buttonPrimary,
  buttonSecondary,
  EmptyState,
  inputClasses,
  labelClasses,
  PageHeading,
} from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import {
  getCategoryOptions,
  getSemesterOptions,
  getSessionOptions,
  listAgenda,
  viewerFrom,
} from "@/lib/events";
import { formatMonthHeading, monthKey } from "@/lib/format";
import { firstParam } from "@/lib/params";
import type { EventCard } from "@/lib/events";

export const metadata = {
  title: "Academic calendar",
  description:
    "Every published date on the LASU academic calendar: interactive monthly grid and upcoming agenda view.",
};

/**
 * Public calendar.
 *
 * Supports both an interactive 7-column Month Grid (default) and chronological
 * Agenda List view. Filtering works with no client JavaScript required: the browser
 * navigates with GET query parameters, keeping every view bookmarkable and shareable.
 */
export default async function CalendarPage(props: PageProps<"/calendar">) {
  const searchParams = await props.searchParams;

  const viewRaw = firstParam(searchParams.view);
  const view = viewRaw === "agenda" ? "agenda" : "month";

  const sessionId = firstParam(searchParams.session);
  const semesterId = firstParam(searchParams.semester);
  const categorySlug = firstParam(searchParams.category);
  const query = firstParam(searchParams.q);
  const rangeRaw = firstParam(searchParams.range);
  const range = rangeRaw === "past" || rangeRaw === "all" ? rangeRaw : "upcoming";
  const forbidden = firstParam(searchParams.error) === "forbidden";
  const welcome = firstParam(searchParams.welcome) === "1";
  const selectedDay = firstParam(searchParams.day);

  // Month navigation
  const monthParam = firstParam(searchParams.month);
  const now = new Date();
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();

  if (monthParam) {
    const parts = monthParam.split("-");
    const parsedYear = Number(parts[0]);
    const parsedMonth = Number(parts[1]);
    if (!Number.isNaN(parsedYear) && !Number.isNaN(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
      year = parsedYear;
      monthIndex = parsedMonth - 1;
    }
  }

  const viewer = await getCurrentUser();
  if (!viewer) {
    redirect("/login?next=/calendar");
  }

  const [events, sessions, semesters, categories] = await Promise.all([
    listAgenda({
      sessionId,
      semesterId,
      categorySlug,
      q: query,
      range,
      viewer: viewerFrom(viewer),
    }),
    getSessionOptions(),
    getSemesterOptions(),
    getCategoryOptions(),
  ]);

  // The concluded session, linked from the default view so the archive is
  // never more than one click away.
  const archiveSession = sessions.find((session) => !session.isActive);

  // Group into month buckets for agenda view.
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

  // Helper to build view switch URLs preserving filters
  const currentParamsMap: Record<string, string> = {};
  if (sessionId) currentParamsMap.session = sessionId;
  if (semesterId) currentParamsMap.semester = semesterId;
  if (categorySlug) currentParamsMap.category = categorySlug;
  if (query) currentParamsMap.q = query;
  if (rangeRaw) currentParamsMap.range = rangeRaw;
  if (monthParam) currentParamsMap.month = monthParam;

  function buildViewHref(targetView: "month" | "agenda") {
    const p = new URLSearchParams(currentParamsMap);
    p.set("view", targetView);
    return `/calendar?${p.toString()}`;
  }

  // "Print / save as PDF" keeps whichever session or semester the reader is
  // looking at, so what they print is what they were reading.
  const printParams = new URLSearchParams();
  if (sessionId) printParams.set("session", sessionId);
  if (semesterId) printParams.set("semester", semesterId);
  const printHref = printParams.size
    ? `/calendar/print?${printParams.toString()}`
    : "/calendar/print";

  return (
    <div>
      <PageHeading
        title="Academic calendar"
        description="Published dates across every LASU academic session: upcoming events first. Draft events are never shown here."
      />

      {/* ---- View Switcher & Actions --------------------------------- */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-xs">
        <div className="flex items-center rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-1">
          <Link
            href={buildViewHref("month")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              view === "month"
                ? "bg-[var(--green)] text-[#FFFFFF] font-bold shadow-xs"
                : "text-[var(--ink)] hover:text-[var(--ink)]"
            }`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
              <path
                fillRule="evenodd"
                d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                clipRule="evenodd"
              />
            </svg>
            Month Grid
          </Link>
          <Link
            href={buildViewHref("agenda")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              view === "agenda"
                ? "bg-[var(--green)] text-[#FFFFFF] font-bold shadow-xs"
                : "text-[var(--ink)] hover:text-[var(--ink)]"
            }`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
              <path
                fillRule="evenodd"
                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Agenda List
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/subscribe" className={buttonSecondary}>
            Subscribe to feed
          </Link>
          <a href="/ics/public.ics" className={buttonSecondary}>
            Public .ics
          </a>
          <Link href={printHref} className={buttonSecondary}>
            Print / PDF
          </Link>
        </div>
      </div>

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
      <form method="get" action="/calendar" className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-xs">
        <input type="hidden" name="view" value={view} />
        {monthParam ? <input type="hidden" name="month" value={monthParam} /> : null}

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
                  {semester.session.name} -{" "}
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
            <Link href={buildViewHref(view)} className={buttonSecondary}>
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
            href={`/calendar?session=${archiveSession.id}&range=all&view=${view}`}
            className="font-medium text-blue-700 hover:underline"
          >
            Browse the {archiveSession.name} archive
          </Link>
          .
        </p>
      ) : null}

      {/* ---- Calendar Views ------------------------------------------- */}
      {view === "month" ? (
        <MonthGrid
          events={events}
          year={year}
          monthIndex={monthIndex}
          selectedDay={selectedDay}
          filterParams={currentParamsMap}
        />
      ) : events.length === 0 ? (
        <EmptyState
          title="No events match those filters"
          body="Try a different session, period or category, or clear the filters to see what is coming up."
          action={{ href: "/calendar?view=agenda", label: "Show upcoming events" }}
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
              <ul className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)] shadow-xs">
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
