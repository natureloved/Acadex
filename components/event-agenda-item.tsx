import Link from "next/link";

import { CategoryChip, RescheduledFlag, StatusBadge } from "@/components/ui";
import type { EventCard } from "@/lib/events";
import { daysBetween, formatDateRange, formatRelativeDays } from "@/lib/format";

/**
 * Event Agenda Item (Taste-Skill Anti-Slop Specification).
 *
 * Implements:
 * - Asymmetric data-dense layout with distinct visual hierarchy
 * - Dynamic live countdown status badges (Ongoing, Upcoming, Concluded)
 * - Tactile link interaction
 * - Zero em-dashes
 */
export function EventAgendaItem({
  event,
  now = new Date(),
}: {
  event: EventCard;
  now?: Date;
}) {
  const isOngoing =
    event.startAt.getTime() <= now.getTime() && now.getTime() <= event.endAt.getTime();
  const daysUntil = daysBetween(now, event.startAt);
  const isUpcomingSoon = !isOngoing && daysUntil >= 0 && daysUntil <= 14;
  const isPast = event.endAt.getTime() < now.getTime();

  return (
    <li className="group relative flex flex-col gap-2 border-b border-[var(--line)] p-4.5 transition last:border-b-0 hover:bg-[var(--paper-2)] sm:flex-row sm:items-start sm:gap-5">
      {/* Date & Countdown Column */}
      <div className="w-full shrink-0 sm:w-44">
        <time
          dateTime={event.startAt.toISOString()}
          className="block font-['Fraunces'] text-sm font-medium text-[var(--ink)]"
        >
          {formatDateRange(event.startAt, event.endAt)}
        </time>

        <div className="mt-1.5 flex items-center gap-2">
          {isOngoing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-600" />
              Ongoing
            </span>
          ) : isUpcomingSoon ? (
            <span className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--paper-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink)]">
              {formatRelativeDays(event.startAt, now)}
            </span>
          ) : isPast ? (
            <span className="text-xs font-medium text-[var(--ink-3)]">Concluded</span>
          ) : (
            <span className="text-xs font-medium text-[var(--ink-2)]">
              {formatRelativeDays(event.startAt, now)}
            </span>
          )}

          {event.allDay ? (
            <span className="text-xs text-[var(--ink-3)]">(All day)</span>
          ) : null}
        </div>
      </div>

      {/* Content & Metadata Column */}
      <div className="min-w-0 grow">
        <h3 className="text-base font-semibold text-[var(--ink)] group-hover:underline transition sm:text-sm">
          <Link
            href={`/calendar/${event.id}`}
            className="after:absolute after:inset-0 focus:outline-none"
          >
            {event.title}
          </Link>
        </h3>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CategoryChip name={event.category.name} color={event.category.color} />
          <RescheduledFlag version={event.version} />
          {event.visibility === "STAFF_ONLY" ? (
            <span className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--paper-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-2)]">
              Staff only
            </span>
          ) : null}
          <StatusBadge status={event.status} />
        </div>

        {event.venue || event.location ? (
          <p className="mt-2 flex items-center gap-1.5 truncate text-xs font-medium text-[var(--ink-2)]">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-3.5 shrink-0 text-[var(--ink-3)]"
            >
              <path
                fillRule="evenodd"
                d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433 1.244-.77 3.13-2.147 4.542-4.148C17.327 12.298 18 10.222 18 8a8 8 0 00-16 0c0 2.222.673 4.298 2.086 6.204 1.412 2.001 3.298 3.378 4.542 4.148.31.193.57.337.757.433.092.047.17.085.232.115l.05.025.018.008.006.003zM10 11a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
            <span>{event.venue ? `${event.venue.name} (${event.venue.code})` : event.location}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}
