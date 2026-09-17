import Link from "next/link";
import { notFound } from "next/navigation";

import { EventForm } from "@/components/admin/event-form";
import { RevisionTimeline } from "@/components/revision-timeline";
import { CategoryChip, PageHeading, StatusBadge, buttonPrimary } from "@/components/ui";
import {
  approveEventAction,
  cancelEventAction,
  deleteEventAction,
  publishEventAction,
  rejectEventAction,
} from "@/lib/actions/admin-events";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import { listEventRevisions } from "@/lib/events";
import { formatDate, formatDateRange } from "@/lib/format";
import { firstParam } from "@/lib/params";
import { getEventForAdmin, getEventFormOptions } from "@/lib/services/events";
import { toDateInputValue, toTimeInputValue } from "@/lib/services/shared";

export const dynamic = "force-dynamic";

const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white shadow-2xs transition-all duration-150 hover:bg-rose-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600";

/**
 * Edit a single event: its fields, its status, and its change history.
 *
 * The conflict warnings shown here are recomputed on every visit, so an
 * administrator who opens an old event still sees that it now clashes with
 * something published since.
 */
export default async function AdminEventPage(props: PageProps<"/admin/events/[id]">) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const [event, options] = await Promise.all([
    getEventForAdmin(id),
    getEventFormOptions(),
  ]);

  if (!event) notFound();

  const revisions = await listEventRevisions(event.id);

  const saved = firstParam(searchParams.saved);
  const error = firstParam(searchParams.error);
  const cancelled = firstParam(searchParams.cancelled) === "1";
  const notified = Number(firstParam(searchParams.notified) ?? "0");
  const rescheduled = firstParam(searchParams.rescheduled) === "1";

  return (
    <div>
      <div className="mb-4 text-sm">
        <Link href="/admin/events" className="font-medium text-blue-700 hover:underline">
          &larr; All events
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip name={event.category.name} color={event.category.color} />
        <StatusBadge status={event.status} />
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300">
          Revision {event.version}
        </span>
        {event.visibility === "STAFF_ONLY" ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300">
            Staff only
          </span>
        ) : null}
      </div>

      <PageHeading title={event.title} description={undefined} />

      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
        >
          {error}
        </p>
      ) : null}

      {saved === "approved" ? (
        <p
          role="status"
          className="mb-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          Event approved and published to the academic calendar.
        </p>
      ) : saved === "rejected" ? (
        <p
          role="status"
          className="mb-5 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
        >
          Event submission rejected. The submitting staff member has been notified.
        </p>
      ) : saved ? (
        <p
          role="status"
          className="mb-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          Saved.
          {rescheduled
            ? " The dates moved, so the revision number increased and the audience was notified."
            : ""}
        </p>
      ) : null}

      {cancelled ? (
        <p
          role="status"
          className="mb-5 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/20"
        >
          Event cancelled. {notified} {notified === 1 ? "person was" : "people were"}{" "}
          notified.
        </p>
      ) : null}

      {/* ---- Fact sheet ------------------------------------------------ */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Current record
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-slate-500">Dates:</dt>
            <dd className="text-slate-800">
              <time dateTime={event.startAt.toISOString()}>
                {formatDateRange(event.startAt, event.endAt)}
              </time>
              {event.allDay ? "" : " (timed)"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Semester:</dt>
            <dd className="text-slate-800">
              {event.semester.session.name} /{" "}
              {SEMESTER_LABELS[event.semester.type as SemesterType] ??
                event.semester.type}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Audience:</dt>
            <dd className="text-slate-800">
              {event.targetLabels.length > 0
                ? event.targetLabels.join(", ")
                : "Whole university"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Venue:</dt>
            <dd className="text-slate-800">
              {event.venue
                ? `${event.venue.name} (${event.venue.code})`
                : (event.location ?? "Unassigned")}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Created:</dt>
            <dd className="text-slate-800">
              {formatDate(event.createdAt)}
              {event.createdByName ? ` by ${event.createdByName}` : ""}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-slate-500">Last updated:</dt>
            <dd className="text-slate-800">{formatDate(event.updatedAt)}</dd>
          </div>
        </dl>

        {event.warnings.length > 0 ? (
          <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 ring-1 ring-amber-600/20">
            <h3 className="text-sm font-semibold text-amber-900">
              Scheduling warnings
            </h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
              {event.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ---- Status actions -------------------------------------------- */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Status & Approval Actions</h2>

        {event.status === "PENDING" ? (
          <div className="mt-2 rounded-md bg-amber-50/60 p-4 ring-1 ring-amber-500/30">
            <p className="text-sm font-medium text-amber-900">
              Departmental Submission Awaiting Review
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Submitted by {event.createdByName ?? "Staff"}. Review the details below and verify there are no schedule conflicts before approving.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <form action={approveEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={buttonPrimary}>
                  ✓ Approve & Publish to Calendar
                </button>
              </form>

              <form action={rejectEventAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="eventId" value={event.id} />
                <input
                  type="text"
                  name="reason"
                  placeholder="Reason for rejection..."
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <button type="submit" className={DANGER_BUTTON}>
                  Reject Submission
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {event.status === "REJECTED" ? (
          <div className="mt-2 rounded-md bg-rose-50/60 p-4 ring-1 ring-rose-500/30">
            <p className="text-sm font-medium text-rose-900">
              This submission was rejected and is not visible on the calendar.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <form action={approveEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={buttonPrimary}>
                  Re-evaluate & Approve
                </button>
              </form>
              <form action={deleteEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={DANGER_BUTTON}>
                  Delete record
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {event.status === "DRAFT" ? (
          <>
            <p className="mt-1 text-sm text-slate-600">
              This is a draft: it is invisible on the public calendar until it is
              published. Drafts can be deleted outright.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <form action={publishEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={buttonPrimary}>
                  Publish now
                </button>
              </form>
              <form action={deleteEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={DANGER_BUTTON}>
                  Delete draft
                </button>
              </form>
            </div>
          </>
        ) : null}

        {event.status === "PUBLISHED" ? (
          <>
            <p className="mt-1 text-sm text-slate-600">
              This event is live. Cancelling keeps its history and notifies
              everyone in its audience; it cannot be deleted.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <form action={cancelEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={DANGER_BUTTON}>
                  Cancel event
                </button>
              </form>
            </div>
          </>
        ) : null}

        {event.status === "CANCELLED" ? (
          <>
            <p className="mt-1 text-sm text-slate-600">
              This event is cancelled and hidden from the calendar. Restoring it
              puts it back on the published calendar.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <form action={publishEventAction}>
                <input type="hidden" name="eventId" value={event.id} />
                <button type="submit" className={buttonPrimary}>
                  Restore to published
                </button>
              </form>
            </div>
          </>
        ) : null}
      </section>

      {/* ---- Fields ---------------------------------------------------- */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Details</h2>
        <EventForm
          mode="edit"
          options={options}
          defaults={{
            id: event.id,
            title: event.title,
            description: event.description ?? "",
            categoryId: event.category.id,
            semesterId: event.semester.id,
            startDate: toDateInputValue(event.startAt),
            endDate: toDateInputValue(event.endAt),
            startTime: toTimeInputValue(event.startAt),
            endTime: toTimeInputValue(event.endAt),
            allDay: event.allDay,
            location: event.location ?? "",
            venueId: event.venueId ?? "",
            visibility: event.visibility,
            scope: event.scope,
            targetIds: event.targets.map((target) => target.targetId),
          }}
        />
      </section>

      {/* ---- History --------------------------------------------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Change history</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every save is recorded, and a linked event page shows this history to
          students so nobody has to guess which dates are current.
        </p>
        <div className="mt-4">
          <RevisionTimeline revisions={revisions} />
        </div>
      </section>
    </div>
  );
}
