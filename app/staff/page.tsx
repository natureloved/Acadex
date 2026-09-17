import Link from "next/link";

import { StaffEventForm } from "@/components/staff/staff-event-form";
import { CategoryChip, RescheduledFlag, RoleBadge, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import { listStaffAgenda, listStaffSubmissions } from "@/lib/events";
import { formatDateRange, formatRelativeDays } from "@/lib/format";
import { firstParam } from "@/lib/params";
import { getEventFormOptions } from "@/lib/services/events";

export const metadata = {
  title: "Staff view",
};

export const dynamic = "force-dynamic";

/**
 * Staff view.
 *
 * Shows:
 * 1. The events a staff member is actually in scope for (faculty, department or level).
 * 2. Proposal submission form for departmental events and tests (FR13).
 * 3. Tracker of staff member's submitted proposals (Pending, Approved, Rejected).
 */
export default async function StaffPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const submitted = firstParam(searchParams.submitted) === "1";

  const user = await requireRole("ADMIN", "STAFF");

  const [events, submissions, formOptions] = await Promise.all([
    listStaffAgenda({
      facultyId: user.facultyId,
      departmentId: user.departmentId,
      level: user.level,
    }),
    listStaffSubmissions(user.id),
    getEventFormOptions(),
  ]);

  const now = new Date();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Staff Portal
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Departmental notices, event proposals, and university-wide academic schedules.
        </p>
      </div>

      {submitted ? (
        <div
          role="status"
          className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          ✓ Your departmental event proposal has been submitted and queued for Dean / Academic Registry approval.
        </div>
      ) : null}

      {/* ---- Profile context ------------------------------------------ */}
      <section
        aria-labelledby="staff-context-heading"
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2
          id="staff-context-heading"
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          Officer Context
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

      {/* ---- Departmental Submission Form (FR13) ----------------------- */}
      <section aria-labelledby="submission-form-heading">
        <h2 id="submission-form-heading" className="sr-only">
          Propose Departmental Event
        </h2>
        <StaffEventForm
          options={formOptions}
          staffDepartmentName={user.departmentName}
        />
      </section>

      {/* ---- Staff Member's Submissions Tracker ------------------------ */}
      {submissions.length > 0 ? (
        <section aria-labelledby="my-submissions-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="my-submissions-heading"
              className="text-sm font-semibold uppercase tracking-wide text-slate-500"
            >
              Your Event Proposals ({submissions.length})
            </h2>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Event Title</th>
                  <th className="px-4 py-3 font-semibold">Proposed Dates</th>
                  <th className="px-4 py-3 font-semibold">Venue</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Feedback / Latest Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((sub) => {
                  const latestRevision = sub.revisions[0];
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <CategoryChip name={sub.category.name} color={sub.category.color} />
                          {sub.status === "PUBLISHED" ? (
                            <Link
                              href={`/calendar/${sub.id}`}
                              className="font-semibold text-slate-900 hover:text-blue-700"
                            >
                              {sub.title}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-900">{sub.title}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {formatDateRange(sub.startAt, sub.endAt)}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {sub.venue ? `${sub.venue.name} (${sub.venue.code})` : (sub.location || "Unassigned")}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {latestRevision?.note ? (
                          <span className={sub.status === "REJECTED" ? "text-rose-700 font-medium" : "text-slate-600"}>
                            {latestRevision.note}
                          </span>
                        ) : sub.status === "PENDING" ? (
                          <span className="italic text-amber-700">Awaiting Registry sign-off</span>
                        ) : (
                          "Approved and published"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ---- In-Scope Agenda ------------------------------------------- */}
      <section aria-labelledby="agenda-heading">
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
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-x-4 gap-y-2 p-4 hover:bg-slate-50/50 transition">
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
                    {event.venue ? (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        📍 {event.venue.name}
                      </span>
                    ) : null}
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
