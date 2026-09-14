import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RevisionTimeline } from "@/components/revision-timeline";
import { CategoryChip, RescheduledFlag, ScopeNote, StatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import {
  getEventForViewer,
  listEventRevisions,
  listEventTargets,
} from "@/lib/events";
import { formatDate, formatDateRange } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Per-event metadata so that a link pasted into WhatsApp or a lecture group
 * previews with the actual event title and dates.
 */
export async function generateMetadata(
  props: PageProps<"/calendar/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const viewer = await getCurrentUser();
  const event = await getEventForViewer(
    id,
    viewer
  ? {
      role: viewer.role,
      facultyId: viewer.facultyId,
      departmentId: viewer.departmentId,
      level: viewer.level,
    }
  : null,
  );

  if (!event) return { title: "Event not found" };

  return {
    title: event.title,
    description:
      event.description?.slice(0, 155) ??
      `${formatDateRange(event.startAt, event.endAt)} — LASU academic calendar`,
  };
}

export default async function EventDetailPage(props: PageProps<"/calendar/[id]">) {
  const { id } = await props.params;
  const viewer = await getCurrentUser();

  const event = await getEventForViewer(
    id,
    viewer
  ? {
      role: viewer.role,
      facultyId: viewer.facultyId,
      departmentId: viewer.departmentId,
      level: viewer.level,
    }
  : null,
  );

  // Drafts, cancelled events and staff-only notices all land here for an
  // unauthorised viewer: a 404 reveals nothing about whether the id exists.
  if (!event) notFound();

  const [revisions, targets] = await Promise.all([
    listEventRevisions(event.id),
    listEventTargets(event.id),
  ]);

  const wasRescheduled = event.version > 1;
  const rescheduleRevisions = revisions.filter(
    (revision) => revision.changeType === "RESCHEDULED",
  );

  const details: { label: string; value: React.ReactNode }[] = [
    {
      label: "Dates",
      value: (
        <time dateTime={event.startAt.toISOString()}>
          {formatDateRange(event.startAt, event.endAt)}
        </time>
      ),
    },
    {
      label: "Semester",
      value: `${event.semester.session.name} · ${
        SEMESTER_LABELS[event.semester.type as SemesterType] ?? event.semester.type
      }`,
    },
    { label: "Category", value: event.category.name },
    { label: "Status", value: <StatusBadge status={event.status} /> },
    {
      label: "Visibility",
      value: event.visibility === "PUBLIC" ? "Public" : "Staff only",
    },
  ];

  if (event.location) {
    details.push({ label: "Venue", value: event.location });
  }

  details.push({
    label: "Last updated",
    value: formatDate(event.updatedAt ?? event.startAt),
  });

  if (event.publishedAt) {
    details.push({ label: "Published", value: formatDate(event.publishedAt) });
  }

  return (
    <article className="max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/calendar" className="font-medium text-blue-700 hover:underline">
          ← Back to the calendar
        </Link>
      </nav>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip name={event.category.name} color={event.category.color} />
          <StatusBadge status={event.status} />
          <RescheduledFlag version={event.version} />
          {event.visibility === "STAFF_ONLY" ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300">
              Staff only
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {event.title}
        </h1>

        <p className="mt-2 text-base font-semibold text-slate-700">
          <time dateTime={event.startAt.toISOString()}>
            {formatDateRange(event.startAt, event.endAt)}
          </time>
          {event.allDay ? (
            <span className="ml-2 text-sm font-normal text-slate-500">All day</span>
          ) : null}
        </p>
      </header>

      {wasRescheduled ? (
        <section
          aria-labelledby="rescheduled-heading"
          className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5"
        >
          <h2
            id="rescheduled-heading"
            className="flex items-center gap-2 text-base font-bold text-amber-900"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-5"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                clipRule="evenodd"
              />
            </svg>
            This event was rescheduled
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            The dates below are the current approved dates (revision{" "}
            {event.version}
            {rescheduleRevisions.length > 0
              ? `, moved ${rescheduleRevisions.length} ${
                  rescheduleRevisions.length === 1 ? "time" : "times"
                }`
              : ""}
            ). If you saved or screenshotted the earlier dates, use these instead.
          </p>

          <div className="mt-4 rounded-md bg-white/70 p-4">
            <h3 className="text-sm font-semibold text-amber-900">
              Change history
            </h3>
            <div className="mt-3">
              <RevisionTimeline revisions={revisions} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="about-heading">
        <h2 id="about-heading" className="sr-only">
          About this event
        </h2>
        <p className="whitespace-pre-line text-sm text-slate-700">
          {event.description ?? "No further details have been published."}
        </p>
      </section>

      <section className="mt-8" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-sm font-semibold text-slate-900">
          Event details
        </h2>
        <dl className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm sm:flex-nowrap"
            >
              <dt className="w-32 shrink-0 font-medium text-slate-500">
                {detail.label}
              </dt>
              <dd className="text-slate-800">{detail.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3">
          <ScopeNote scope={event.scope} labels={targets.map((t) => t.label)} />
        </div>
      </section>

      {!wasRescheduled && revisions.length > 0 ? (
        <section className="mt-8" aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-sm font-semibold text-slate-900">
            Change history
          </h2>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
            <RevisionTimeline revisions={revisions} />
          </div>
        </section>
      ) : null}
    </article>
  );
}
