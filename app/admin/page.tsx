import Link from "next/link";

import { RoleBadge, buttonSecondary } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getActiveSessionSummary, getAdminStats } from "@/lib/events";
import { formatDate } from "@/lib/format";
import { listAuditEntries } from "@/lib/services/events";

export const metadata = {
  title: "Admin dashboard",
};

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "published" | "draft";
}) {
  const valueClasses =
    tone === "published"
      ? "text-emerald-700"
      : tone === "draft"
        ? "text-amber-700"
        : "text-slate-900";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className={`mt-1 text-3xl font-bold tabular-nums ${valueClasses}`}>
        {value}
      </dd>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const QUICK_LINKS = [
  { href: "/admin/events/new", label: "Create an event", hint: "Draft or publish in one step" },
  { href: "/admin/events?status=DRAFT", label: "Review drafts", hint: "Work that is not public yet" },
  { href: "/admin/import", label: "Import a CSV", hint: "Bulk-load an approved calendar" },
  { href: "/admin/sessions", label: "Sessions", hint: "Semesters and the active session" },
  { href: "/admin/categories", label: "Categories", hint: "Colours and buckets" },
  { href: "/admin/audit", label: "Audit log", hint: "Who changed what" },
];

/**
 * Administrator dashboard.
 *
 * Authorisation is enforced by the admin layout as well as here.
 */
export default async function AdminPage() {
  const user = await requireRole("ADMIN");

  const [stats, session, recent] = await Promise.all([
    getAdminStats(),
    getActiveSessionSummary(),
    listAuditEntries({ limit: 10 }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Admin dashboard
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Manage the calendar: create and publish events, keep sessions and categories
        tidy, and check what changed and when.
      </p>

      {/* ---- Signed in as --------------------------------------------- */}
      <section
        aria-labelledby="signed-in-heading"
        className="mt-6 rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2
          id="signed-in-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Signed in as
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold text-slate-900">{user.name}</span>
          <RoleBadge role={user.role} />
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-slate-500">Email:</dt>
            <dd className="text-slate-800">{user.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Faculty:</dt>
            <dd className="text-slate-800">{user.facultyName ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Department:</dt>
            <dd className="text-slate-800">{user.departmentName ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Level:</dt>
            <dd className="text-slate-800">{user.level ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {/* ---- Key numbers ---------------------------------------------- */}
      <section aria-labelledby="stats-heading" className="mt-8">
        <h2 id="stats-heading" className="sr-only">
          Calendar statistics
        </h2>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total events"
            value={stats.total}
            hint={`${stats.sessionCount} session(s), ${stats.userCount} user(s)`}
          />
          <StatCard
            label="Published"
            value={stats.published}
            tone="published"
            hint="Visible on the public calendar"
          />
          <StatCard
            label="Draft"
            value={stats.draft}
            tone="draft"
            hint="Not yet visible to students"
          />
          <StatCard
            label="Upcoming (30 days)"
            value={stats.upcoming30Days}
            hint={
              stats.upcoming30Days === 0
                ? "No published event starts in the next 30 days"
                : "Starts within 30 days"
            }
          />
        </dl>

        {stats.cancelled > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {stats.cancelled} cancelled {stats.cancelled === 1 ? "event" : "events"}{" "}
            are also recorded.
          </p>
        ) : null}
      </section>

      {/* ---- Quick links ---------------------------------------------- */}
      <section aria-labelledby="quick-heading" className="mt-8">
        <h2
          id="quick-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-500"
        >
          Manage
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50/40"
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {link.label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-600">{link.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Active session ------------------------------------------- */}
      {session ? (
        <section
          aria-labelledby="session-heading"
          className="mt-8 rounded-lg border border-slate-200 bg-white p-5"
        >
          <h2
            id="session-heading"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Active session
          </h2>
          <p className="mt-2 text-base font-semibold text-slate-900">{session.name}</p>
          <p className="text-sm text-slate-600">
            {formatDate(session.startDate)} &ndash; {formatDate(session.endDate)} ·{" "}
            {session.publishedEvents} published event(s)
          </p>

          {stats.nextEvent ? (
            <p className="mt-3 text-sm text-slate-700">
              Next scheduled event:{" "}
              <Link
                href={`/calendar/${stats.nextEvent.id}`}
                className="font-medium text-blue-700 hover:underline"
              >
                {stats.nextEvent.title}
              </Link>{" "}
              on {formatDate(stats.nextEvent.startAt)}.
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No upcoming events are scheduled — no published event starts on or
              after today.
            </p>
          )}
        </section>
      ) : null}

      {/* ---- Recent activity ------------------------------------------ */}
      <section aria-labelledby="recent-heading" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2
            id="recent-heading"
            className="text-sm font-semibold uppercase tracking-wide text-slate-500"
          >
            Recent activity
          </h2>
          <Link href="/admin/audit" className="text-sm font-medium text-blue-700 hover:underline">
            Full audit log
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Nothing has been recorded yet.
          </p>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="font-mono text-xs text-slate-600">{entry.action}</span>
                <span className="text-slate-700">{entry.actorName ?? "system"}</span>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="ml-auto text-xs text-slate-500"
                >
                  {formatDate(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/calendar" className={buttonSecondary}>
          View public calendar
        </Link>
        <Link href="/staff" className={buttonSecondary}>
          Staff view
        </Link>
      </div>
    </div>
  );
}
