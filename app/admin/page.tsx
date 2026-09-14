import Link from "next/link";

import { RoleBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { buttonSecondary } from "@/components/ui";
import { getActiveSessionSummary, getAdminStats } from "@/lib/events";
import { formatDate } from "@/lib/format";

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

/**
 * Administrator dashboard (placeholder for this phase).
 *
 * Authorisation is enforced here, on the server, by `requireRole` — the proxy
 * also blocks /admin, but this page does not rely on that alone.
 */
export default async function AdminPage() {
  const user = await requireRole("ADMIN");

  const [stats, session] = await Promise.all([
    getAdminStats(),
    getActiveSessionSummary(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Admin dashboard
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Read-only overview. Creating, editing and publishing events arrives in the
        next phase.
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
          <p className="mt-2 text-base font-semibold text-slate-900">
            {session.name}
          </p>
          <p className="text-sm text-slate-600">
            {formatDate(session.startDate)} – {formatDate(session.endDate)} ·{" "}
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

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/calendar" className={buttonSecondary}>
          View public calendar
        </Link>
      </div>
    </div>
  );
}
