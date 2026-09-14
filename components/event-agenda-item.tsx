import Link from "next/link";

import { CategoryChip, RescheduledFlag, StatusBadge } from "@/components/ui";
import type { EventCard } from "@/lib/events";
import { formatDateRange } from "@/lib/format";

/**
 * One row in the chronological agenda.
 *
 * The whole row is a link to the detail page, so the tap target is large enough
 * for a phone. The date is rendered as a machine-readable `<time>` element for
 * assistive technology and for future ICS/print work.
 */
export function EventAgendaItem({ event }: { event: EventCard }) {
  return (
    <li className="group relative flex gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 hover:bg-slate-50">
      <div className="w-28 shrink-0 pt-0.5 sm:w-36">
        <time
          dateTime={event.startAt.toISOString()}
          className="block text-sm font-semibold text-slate-800"
        >
          {formatDateRange(event.startAt, event.endAt)}
        </time>
        {event.allDay ? (
          <span className="text-xs text-slate-500">All day</span>
        ) : null}
      </div>

      <div className="min-w-0 grow">
        <h3 className="text-sm font-semibold text-slate-900">
          {/* Stretched link: the ::after covers the whole row. */}
          <Link
            href={`/calendar/${event.id}`}
            className="after:absolute after:inset-0 group-hover:text-blue-800"
          >
            {event.title}
          </Link>
        </h3>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <CategoryChip name={event.category.name} color={event.category.color} />
          <RescheduledFlag version={event.version} />
          {event.visibility === "STAFF_ONLY" ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300">
              Staff only
            </span>
          ) : null}
          <StatusBadge status={event.status} />
        </div>

        {event.location ? (
          <p className="mt-1 truncate text-xs text-slate-500">{event.location}</p>
        ) : null}
      </div>
    </li>
  );
}
