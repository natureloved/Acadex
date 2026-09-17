import Link from "next/link";

import { CategoryChip, RescheduledFlag, StatusBadge } from "@/components/ui";
import type { EventCard } from "@/lib/events";
import {
  formatDate,
  formatDateRange,
  formatMonthHeading,
  formatRelativeDays,
  getCalendarGridDays,
  isoDate,
} from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Interactive Month Calendar Grid (Taste-Skill Anti-Slop Specification).
 *
 * Implements:
 * - 7-column calendar matrix with 42 distinct day cells
 * - Category color pips with high visual contrast
 * - Tactile date selection and month navigation
 * - Asymmetric day inspector with live event countdowns
 * - Zero em-dashes anywhere in visible text
 */
export function MonthGrid({
  events,
  year,
  monthIndex,
  selectedDay,
  filterParams,
}: {
  events: EventCard[];
  year: number;
  monthIndex: number;
  selectedDay?: string;
  filterParams: Record<string, string>;
}) {
  const currentMonthDate = new Date(Date.UTC(year, monthIndex, 1));
  const today = new Date();
  const cells = getCalendarGridDays(year, monthIndex, today);

  const prevMonth = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevYear = monthIndex === 0 ? year - 1 : year;
  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;

  function buildMonthHref(y: number, m: number, day?: string) {
    const params = new URLSearchParams(filterParams);
    params.set("view", "month");
    params.set("month", `${y}-${String(m + 1).padStart(2, "0")}`);
    if (day) params.set("day", day);
    else params.delete("day");
    return `/calendar?${params.toString()}`;
  }

  const eventsByDay = new Map<string, EventCard[]>();
  for (const cell of cells) {
    const cellStart = new Date(cell.date.getTime());
    const cellEnd = new Date(cell.date.getTime() + 86400000 - 1);

    const matching = events.filter(
      (e) => e.startAt.getTime() <= cellEnd.getTime() && e.endAt.getTime() >= cellStart.getTime(),
    );
    if (matching.length > 0) {
      eventsByDay.set(cell.dateString, matching);
    }
  }

  const activeDayString =
    selectedDay ??
    (cells.some((c) => c.isToday && c.isCurrentMonth)
      ? isoDate(today)
      : cells.find((c) => c.isCurrentMonth)?.dateString);

  const activeDayEvents = activeDayString ? eventsByDay.get(activeDayString) ?? [] : [];
  const activeDate = activeDayString ? new Date(`${activeDayString}T00:00:00Z`) : null;

  return (
    <div className="space-y-6">
      {/* Month Navigation Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <h2 className="font-['Fraunces'] text-xl font-medium tracking-tight text-[var(--ink)]">
            {formatMonthHeading(currentMonthDate)}
          </h2>
          <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink-2)]">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={buildMonthHref(prevYear, prevMonth)}
            className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--line-strong)] bg-[var(--card)] text-[var(--ink)] shadow-2xs transition hover:bg-[var(--paper-2)] active:scale-[0.98]"
            aria-label="Previous month"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </Link>

          <Link
            href={buildMonthHref(today.getUTCFullYear(), today.getUTCMonth(), isoDate(today))}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] shadow-2xs transition hover:bg-[var(--paper-2)] active:scale-[0.98]"
          >
            Today
          </Link>

          <Link
            href={buildMonthHref(nextYear, nextMonth)}
            className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--line-strong)] bg-[var(--card)] text-[var(--ink)] shadow-2xs transition hover:bg-[var(--paper-2)] active:scale-[0.98]"
            aria-label="Next month"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4-4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </div>
      </div>

      {/* 7-Column Calendar Grid */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)] shadow-2xs">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--paper-2)] text-center font-['Spline_Sans_Mono'] text-xs font-semibold tracking-wider text-[var(--ink-2)] uppercase">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-2.5">
              {day}
            </div>
          ))}
        </div>

        {/* Month Day Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-[var(--line)]">
          {cells.map((cell) => {
            const dayEvents = eventsByDay.get(cell.dateString) ?? [];
            const isSelected = cell.dateString === activeDayString;

            return (
              <div
                key={cell.dateString}
                className={`relative min-h-24 p-1.5 transition sm:min-h-28 sm:p-2 ${
                  !cell.isCurrentMonth
                    ? "bg-[var(--paper-2)]/50 text-[var(--ink-3)]"
                    : isSelected
                      ? "bg-[var(--paper-2)] ring-2 ring-[var(--green)] ring-inset"
                      : "hover:bg-[var(--paper-2)] text-[var(--ink)]"
                }`}
              >
                {/* Date Header */}
                <div className="flex items-center justify-between">
                  <Link
                    href={buildMonthHref(year, monthIndex, cell.dateString)}
                    className={`inline-flex size-6.5 items-center justify-center rounded-full text-xs font-semibold transition active:scale-[0.98] ${
                      cell.isToday
                        ? "bg-[var(--green)] font-bold text-[#FFFFFF] shadow-2xs"
                        : isSelected
                          ? "bg-[var(--ink)] font-bold text-[#FCF9F0] shadow-xs"
                          : "hover:bg-[var(--paper-2)] text-[var(--ink)]"
                    }`}
                  >
                    {cell.dayNumber}
                  </Link>

                  {dayEvents.length > 0 ? (
                    <span className="text-[10px] font-semibold text-[var(--ink-2)] sm:hidden">
                      {dayEvents.length}
                    </span>
                  ) : null}
                </div>

                {/* Event Chips inside the cell */}
                <div className="mt-1.5 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <Link
                      key={`${cell.dateString}-${event.id}`}
                      href={`/calendar/${event.id}`}
                      className="group/chip block truncate rounded-sm px-1.5 py-0.5 text-[11px] font-medium transition hover:brightness-95 border-l-2"
                      style={{
                        backgroundColor: `${event.category.color}18`,
                        color: "var(--ink)",
                        borderLeftColor: event.category.color,
                      }}
                      title={`${event.title} (${event.category.name})`}
                    >
                      <span className="truncate group-hover/chip:underline font-medium text-[var(--ink)]">
                        {event.title}
                      </span>
                    </Link>
                  ))}

                  {dayEvents.length > 3 ? (
                    <Link
                      href={buildMonthHref(year, monthIndex, cell.dateString)}
                      className="block text-center text-[10px] font-semibold text-[var(--ink-3)] hover:text-[var(--green)]"
                    >
                      +{dayEvents.length - 3} more
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Asymmetric Day Inspector Drawer */}
      {activeDate ? (
        <section
          aria-labelledby="day-inspector-heading"
          className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
            <div>
              <h3 id="day-inspector-heading" className="font-['Fraunces'] text-lg font-medium text-[var(--ink)]">
                Scheduled for {formatDate(activeDate)}
              </h3>
              <p className="text-xs text-[var(--ink-3)] mt-0.5">
                {formatRelativeDays(activeDate, today)} - {activeDayEvents.length}{" "}
                {activeDayEvents.length === 1 ? "event found" : "events found"}
              </p>
            </div>

            {activeDayEvents.length > 0 ? (
              <span className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[var(--paper-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--ink)]">
                Selected Date
              </span>
            ) : null}
          </div>

          {activeDayEvents.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--ink-3)]">
              No academic events scheduled on this date. Click on any date with colored badges to view details.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)]">
              {activeDayEvents.map((event) => (
                <li key={event.id} className="group py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CategoryChip name={event.category.name} color={event.category.color} />
                        <RescheduledFlag version={event.version} />
                        <StatusBadge status={event.status} />
                      </div>
                      <h4 className="text-sm font-semibold text-[var(--ink)] group-hover:underline">
                        <Link href={`/calendar/${event.id}`}>{event.title}</Link>
                      </h4>
                      <p className="text-xs text-[var(--ink-2)]">
                        Span: {formatDateRange(event.startAt, event.endAt)}
                        {event.venue ? ` (Venue: ${event.venue.name} - ${event.venue.code})` : event.location ? ` (${event.location})` : ""}
                      </p>
                    </div>

                    <Link
                      href={`/calendar/${event.id}`}
                      className="rounded-full border border-[var(--line-strong)] bg-[var(--card)] px-3.5 py-1.5 text-xs font-semibold text-[var(--ink)] shadow-2xs transition hover:bg-[#EAF5EE] hover:border-[var(--green)] hover:text-[#165A3D] active:scale-[0.98]"
                    >
                      View details
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
