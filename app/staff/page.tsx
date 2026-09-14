import Link from "next/link";

import { CategoryChip, RescheduledFlag, RoleBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import { listStaffAgenda } from "@/lib/events";
import { formatDateRange, formatRelativeDays } from "@/lib/format";

export const metadata = {
  title: "Staff view",
};

export const dynamic = "force-dynamic";

/**
 * Staff view.
 *
 * Shows the events a staff member is actually in scope for: whole-university
 * notices plus anything targeted at their faculty, department or level. This is
 * where STAFF_ONLY visibility and audience targeting become visible.
 */
export default async function StaffPage() {
  const user = await requireRole("ADMIN", "STAFF");

  const events = await listStaffAgenda({
    facultyId: user.facultyId,
    departmentId: user.departmentId,
    level: user.level,
  });

  const now = new Date();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Staff view
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Whole-university notices plus events targeted at your faculty, department
        or level.
      </p>

      <section
        aria-labelledby="staff-context-heading"
        className="mt-6 rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2
          id="staff-context-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Signed in as
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold text-slate-900">{user.name}</span>
          <RoleBadge role={user.role} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {[user.facultyName, user.departmentName].filter(Boolean).join(" · ") ||
            "No faculty or department assigned"}
          {user.level ? ` · ${user.level} Level` : ""}
        </p>
      </section>

      <section aria-labelledby="agenda-heading" className="mt-8">
        <h2
          id="agenda-heading"
          className="text-sm font-semibold uppercase tracking-wide text-slate-500"
        >
          Events in your scope
        </h2>

        {events.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No published events are in scope for your faculty, department or level.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-x-4 gap-y-2 p-4">
                <div className="w-40 shrink-0">
                  <time
                    dateTime={event.startAt.toISOString()}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    {formatDateRange(event.startAt, event.endAt)}
                  </time>
                  <span className="text-xs text-slate-500">
                    {formatRelativeDays(event.startAt, now)}
                  </span>
                </div>

                <div className="min-w-0 grow">
                  <h3 className="text-sm font-semibold text-slate-900">
                    <Link
                      href={`/calendar/${event.id}`}
                      className="hover:text-blue-800 hover:underline"
                    >
                      {event.title}
                    </Link>
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <CategoryChip
                      name={event.category.name}
                      color={event.category.color}
                    />
                    <RescheduledFlag version={event.version} />
                    <span className="text-xs text-slate-500">
                      {event.semester.session.name} ·{" "}
                      {SEMESTER_LABELS[event.semester.type as SemesterType] ??
                        event.semester.type}
                    </span>
                    {event.visibility === "STAFF_ONLY" ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300">
                        Staff only
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
