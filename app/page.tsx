import Link from "next/link";

import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import { getActiveSessionSummary } from "@/lib/events";
import { formatDate } from "@/lib/format";

// Live database reads on every request — nothing is prerendered at build time,
// so `next build` never needs a database connection.
export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "One calendar, not a PDF",
    body: "Registration windows, lectures, examinations, breaks and deadlines live in a database and are published to one page that everyone reads.",
  },
  {
    title: "Dates that move, visibly",
    body: "When the Senate extends a semester, the event shows what changed and when — instead of leaving a stale date next to a correction posted elsewhere.",
  },
  {
    title: "Aimed at the right people",
    body: "Announcements can target the whole university, a single faculty, a department or one level, so staff-only notices stay off the public page.",
  },
];

export default async function HomePage() {
  const session = await getActiveSessionSummary();

  return (
    <div className="space-y-12">
      <section className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Lagos State University
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          The academic calendar everyone can trust.
        </h1>
        <p className="mt-3 text-base text-slate-600">
          Acadex is an academic calendar management system: the university
          registry creates and publishes sessions, semesters and events, students
          and staff read the same authoritative version, and every reschedule
          leaves a visible trail.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/calendar" className={buttonPrimary}>
            View the calendar
          </Link>
          <Link href="/login" className={buttonSecondary}>
            Sign in
          </Link>
        </div>
      </section>

      {session ? (
        <section
          aria-labelledby="active-session-heading"
          className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="active-session-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Active session: {session.name}
            </h2>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
              {session.startDate <= new Date() ? "In progress" : "Starts soon"}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-600">
            {formatDate(session.startDate)} – {formatDate(session.endDate)} ·{" "}
            {session.publishedEvents} published{" "}
            {session.publishedEvents === 1 ? "event" : "events"}
          </p>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {session.semesters.map((semester) => (
              <div
                key={semester.id}
                className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-200"
              >
                <dt className="text-sm font-semibold text-slate-800">
                  {SEMESTER_LABELS[semester.type as SemesterType] ?? semester.type}
                </dt>
                <dd className="text-sm text-slate-600">
                  {formatDate(semester.startDate)} – {formatDate(semester.endDate)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="features-heading">
        <h2 id="features-heading" className="sr-only">
          What Acadex does
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <h3 className="text-sm font-semibold text-slate-900">
                {feature.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
