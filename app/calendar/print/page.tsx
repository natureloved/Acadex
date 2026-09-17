import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PrintButton } from "@/components/print-button";
import { CategoryChip, EmptyState, inputClasses, labelClasses } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import {
  getPrintPeriod,
  getSemesterOptions,
  getSessionOptions,
  listAgenda,
  viewerFrom,
} from "@/lib/events";
import { formatDate, formatDateRange, formatMonthHeading, monthKey } from "@/lib/format";
import { firstParam } from "@/lib/params";
import type { EventCard } from "@/lib/events";

export const metadata = {
  title: "Calendar print view",
  description:
    "A clean, printable view of a LASU academic session or semester, grouped by month.",
};

// The view reflects published data and the reader's audience, so it is rendered
// per request rather than prerendered.
export const dynamic = "force-dynamic";

/**
 * Print / PDF view.
 *
 * Rendered on the server with no client JavaScript except the print button, and
 * stripped of the site header, footer and buttons by the `@media print` rules in
 * globals.css. The result is a page a registry clerk can print, or "Save as PDF"
 * from the browser's own dialog : which is why no PDF library is needed.
 *
 * Audience filtering still applies: this is a public route, so an anonymous
 * visitor printing the calendar gets the whole-university dates and nothing else.
 */
export default async function CalendarPrintPage(props: PageProps<"/calendar/print">) {
  const searchParams = await props.searchParams;

  const sessionId = firstParam(searchParams.session);
  const semesterId = firstParam(searchParams.semester);

  const period = await getPrintPeriod(sessionId, semesterId);
  if (!period) notFound();

  const viewer = await getCurrentUser();
  if (!viewer) {
    redirect("/login?next=/calendar/print");
  }

  const [events, sessions, semesters] = await Promise.all([
    listAgenda({
      sessionId: period.sessionId,
      semesterId: period.semesterId ?? undefined,
      range: "all",
      viewer: viewerFrom(viewer),
    }),
    getSessionOptions(),
    getSemesterOptions(),
  ]);

  // Group into month buckets; `listAgenda` already returns them oldest first.
  const byMonth = new Map<string, { label: string; events: EventCard[] }>();
  for (const event of events) {
    const key = monthKey(event.startAt);
    const bucket = byMonth.get(key);
    if (bucket) {
      bucket.events.push(event);
    } else {
      byMonth.set(key, { label: formatMonthHeading(event.startAt), events: [event] });
    }
  }

  const generatedOn = formatDate(new Date());

  return (
    <div className="max-w-3xl">
      {/* ---- On-screen controls (hidden when printed) ------------------- */}
      <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/calendar" className="text-sm font-medium text-blue-700 hover:underline">
            ← Back to the calendar
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            Choose a session or semester, then print the page or save it as a PDF.
            The header, footer and these controls are left out of the printout.
          </p>
        </div>
        <PrintButton />
      </div>

      <form method="get" action="/calendar/print" className="no-print mb-8 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="print-session" className={labelClasses}>
              Session
            </label>
            <select
              id="print-session"
              name="session"
              defaultValue={period.kind === "session" ? period.sessionId : ""}
              className={`${inputClasses} mt-1`}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.isActive ? " (current)" : " (archived)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="print-semester" className={labelClasses}>
              Semester (optional: overrides the session)
            </label>
            <select
              id="print-semester"
              name="semester"
              defaultValue={period.semesterId ?? ""}
              className={`${inputClasses} mt-1`}
            >
              <option value="">Whole session</option>
              {semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.session.name} /{" "}
                  {SEMESTER_LABELS[semester.type as SemesterType] ?? semester.type}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          className="mt-3 inline-flex items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-blue-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 shadow-2xs"
        >
          Show this period
        </button>
      </form>

      {/* ---- The document ---------------------------------------------- */}
      <header className="border-b-2 border-slate-800 pb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Lagos State University
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Academic Calendar: {period.title}
        </h1>
        <p className="mt-1 text-sm text-slate-700">
          {period.kind === "semester" ? "Semester dates: " : "Session dates: "}
          {period.subtitle}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {events.length} published {events.length === 1 ? "event" : "events"} ·
          Generated on {generatedOn} from Acadex. Draft entries and internal
          notices are not included.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No published events in this period"
            body="Nothing has been published for the selected session or semester yet. Try the other period, or view the calendar online."
            action={{ href: "/calendar", label: "View the calendar" }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {[...byMonth.entries()].map(([key, bucket]) => (
            <section key={key} aria-labelledby={`print-month-${key}`} className="break-inside-avoid">
              <h2
                id={`print-month-${key}`}
                className="border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide text-slate-700"
              >
                {bucket.label}
              </h2>
              <ul className="mt-2 space-y-2">
                {bucket.events.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap gap-x-4 gap-y-1 border-b border-dotted border-slate-200 pb-2 text-sm break-inside-avoid"
                  >
                    <span className="w-40 shrink-0 font-semibold text-slate-900">
                      {formatDateRange(event.startAt, event.endAt)}
                      {event.allDay ? (
                        <span className="ml-1 font-normal text-slate-500">(all day)</span>
                      ) : null}
                    </span>
                    <span className="min-w-0 grow">
                      <span className="block font-medium text-slate-900">
                        {event.title}
                        {event.version > 1 ? (
                          <span className="ml-2 text-xs font-semibold uppercase text-amber-700">
                            Rescheduled
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2">
                        <CategoryChip
                          name={event.category.name}
                          color={event.category.color}
                        />
                        {event.location ? (
                          <span className="text-xs text-slate-600">{event.location}</span>
                        ) : null}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-8 border-t border-slate-300 pt-3 text-xs text-slate-500">
        <p>
          Acadex - Academic Calendar Management System · {period.title} · printed{" "}
          {generatedOn}
        </p>
        <p className="mt-1">
          Dates that move are re-published here. Check the online calendar for the
          current approved version before acting on any date.
        </p>
      </footer>
    </div>
  );
}
