import Link from "next/link";

import { CategoryChip, RoleBadge, buttonSecondary } from "@/components/ui";
import { approveEventAction } from "@/lib/actions/admin-events";
import { requireRole } from "@/lib/auth";
import { getActiveSessionSummary, getAdminStats } from "@/lib/events";
import { formatDate, formatDateRange } from "@/lib/format";
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
  tone?: "default" | "published" | "pending" | "draft";
}) {
  const containerClasses =
    tone === "published"
      ? "border-emerald-200 bg-emerald-50/40"
      : tone === "pending"
        ? "border-amber-300 bg-amber-50/50 shadow-xs"
        : tone === "draft"
          ? "border-slate-200 bg-slate-50/60"
          : "border-slate-200 bg-white";

  const valueClasses =
    tone === "published"
      ? "text-emerald-800"
      : tone === "pending"
        ? "text-amber-900 font-extrabold"
        : tone === "draft"
          ? "text-slate-700"
          : "text-slate-900 font-extrabold";

  return (
    <div className={`rounded-xl border p-4 shadow-2xs transition hover:shadow-xs ${containerClasses}`}>
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-600">
        {label}
      </dt>
      <dd className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${valueClasses}`}>
        {value}
      </dd>
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}

const QUICK_LINKS = [
  { href: "/admin/events/new", label: "Create an event", hint: "Draft or publish in one step" },
  { href: "/admin/events?status=PENDING", label: "Pending approvals", hint: "Departmental submissions" },
  { href: "/admin/events?status=DRAFT", label: "Review drafts", hint: "Internal drafts in progress" },
  { href: "/admin/venues", label: "Venues", hint: "Lecture theatres and auditoriums" },
  { href: "/admin/import", label: "Import CSV", hint: "Bulk-load an approved calendar" },
  { href: "/admin/sessions", label: "Sessions", hint: "Semesters and active session" },
  { href: "/admin/categories", label: "Categories", hint: "Colours and event buckets" },
  { href: "/admin/audit", label: "Audit log", hint: "Immutable change record" },
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
        Manage the academic calendar: review submissions, publish dates, configure venues, and inspect audit logs.
      </p>

      {/* ---- Signed in as --------------------------------------------- */}
      <section
        aria-labelledby="signed-in-heading"
        className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs"
      >
        <h2
          id="signed-in-heading"
          className="text-xs font-bold uppercase tracking-wider text-slate-600"
        >
          Administrator Context
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-base font-bold text-slate-900">{user.name}</span>
          <RoleBadge role={user.role} />
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-slate-500 font-medium">Email:</dt>
            <dd className="text-slate-800">{user.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500 font-medium">Faculty:</dt>
            <dd className="text-slate-800">{user.facultyName ?? "Unassigned"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500 font-medium">Department:</dt>
            <dd className="text-slate-800">{user.departmentName ?? "Unassigned"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500 font-medium">Level:</dt>
            <dd className="text-slate-800">{user.level ?? "Unassigned"}</dd>
          </div>
        </dl>
      </section>

      {/* ---- Key numbers Bento Grid ----------------------------------- */}
      <section aria-labelledby="stats-heading" className="mt-8">
        <h2 id="stats-heading" className="sr-only">
          Calendar statistics
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Total events"
            value={stats.total}
            hint={`${stats.sessionCount} session(s), ${stats.userCount} user(s)`}
          />
          <StatCard
            label="Published"
            value={stats.published}
            tone="published"
            hint="Visible on public calendar"
          />
          <StatCard
            label="Pending Approval"
            value={stats.pending}
            tone={stats.pending > 0 ? "pending" : "default"}
            hint={stats.pending > 0 ? "Staff submissions to review" : "Queue is clear"}
          />
          <StatCard
            label="Draft"
            value={stats.draft}
            tone="draft"
            hint="Internal work in progress"
          />
          <StatCard
            label="Upcoming (30 days)"
            value={stats.upcoming30Days}
            hint={
              stats.upcoming30Days === 0
                ? "No event in next 30 days"
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

      {/* ---- Pending Approvals Queue (FR13) --------------------------- */}
      {stats.pendingApprovals.length > 0 ? (
        <section
          aria-labelledby="pending-heading"
          className="mt-8 rounded-lg border border-amber-300 bg-amber-50/50 p-5 shadow-sm"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="pending-heading"
                className="flex items-center gap-2 text-base font-bold text-amber-950"
              >
                <span className="flex size-2 rounded-full bg-amber-500 animate-pulse" />
                Pending Departmental Submissions ({stats.pendingApprovals.length})
              </h2>
              <p className="mt-0.5 text-xs text-amber-800">
                Departmental staff events awaiting administrator review and approval before publication.
              </p>
            </div>
            <Link
              href="/admin/events?status=PENDING"
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              View all &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto rounded-md border border-amber-200 bg-white">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-amber-100/60 text-xs uppercase text-amber-900">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">Event</th>
                  <th className="px-3.5 py-2.5 font-semibold">Dates</th>
                  <th className="px-3.5 py-2.5 font-semibold">Venue / Scope</th>
                  <th className="px-3.5 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.pendingApprovals.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <CategoryChip name={item.category.name} color={item.category.color} />
                        <Link
                          href={`/admin/events/${item.id}`}
                          className="font-semibold text-slate-900 hover:text-blue-700"
                        >
                          {item.title}
                        </Link>
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-xs text-slate-600">
                      {formatDateRange(item.startAt, item.endAt)}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-slate-600">
                      {item.venue ? item.venue.name : (item.location || "Whole University")}
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <form action={approveEventAction}>
                          <input type="hidden" name="eventId" value={item.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white transition-all duration-150 hover:bg-emerald-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                          >
                            Approve
                          </button>
                        </form>
                        <Link
                          href={`/admin/events/${item.id}`}
                          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-all duration-150 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          Review
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---- Quick links ---------------------------------------------- */}
      <section aria-labelledby="quick-heading" className="mt-8">
        <h2
          id="quick-heading"
          className="text-xs font-bold uppercase tracking-wider text-slate-500"
        >
          Manage
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="group block rounded-xl border border-slate-200 bg-white p-4 transition-all duration-150 hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-sm active:scale-[0.98]"
              >
                <span className="block text-sm font-semibold text-slate-900 group-hover:text-blue-700">
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
          className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs"
        >
          <h2
            id="session-heading"
            className="text-xs font-bold uppercase tracking-wider text-slate-500"
          >
            Active session
          </h2>
          <p className="mt-2 text-base font-bold text-slate-900">{session.name}</p>
          <p className="text-sm text-slate-600">
            {formatDate(session.startDate)} - {formatDate(session.endDate)} ·{" "}
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
              No upcoming events are scheduled: no published event starts on or
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
