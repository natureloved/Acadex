/**
 * Date formatting helpers.
 *
 * All calendar dates are stored at UTC midnight. Every formatter here pins
 * `timeZone: "UTC"` so that a student in Lagos and a marker in London see the
 * same calendar day formatting in local time would shift an "all-day" event
 * to the previous or next day.
 */

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_NO_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(date: Date): string {
  return DAY.format(date);
}

export function formatMonthHeading(date: Date): string {
  return MONTH_YEAR.format(date);
}

/** Stable key for grouping events into month buckets. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Human-friendly range: collapses the repeated parts of the date. */
export function formatDateRange(start: Date, end: Date): string {
  const sameDay = start.getTime() === end.getTime();
  if (sameDay) return formatDate(start);

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    return `${start.getUTCDate()} – ${formatDate(end)}`;
  }
  if (sameYear) {
    return `${DAY_NO_YEAR.format(start)} – ${formatDate(end)}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** True when the event's window has already finished. */
export function isPast(date: Date, now: Date = new Date()): boolean {
  return date.getTime() < now.getTime();
}

/** Whole days between two instants, rounded down. */
export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * "in 12 days" / "today" / "3 days ago" used for the upcoming countdown.
 */
export function formatRelativeDays(target: Date, now: Date = new Date()): string {
  const delta = daysBetween(now, target);

  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta === -1) return "yesterday";
  if (delta > 1) return `in ${delta} days`;
  return `${Math.abs(delta)} days ago`;
}

/** `YYYY-MM-DD` string in UTC. */
export function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

export type CalendarDayCell = {
  date: Date;
  dateString: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

/**
 * Generate a standard 35 or 42-day Monday-to-Sunday calendar grid for a given year and month.
 */
export function getCalendarGridDays(
  year: number,
  monthIndex: number, // 0 = Jan, 11 = Dec
  today: Date = new Date(),
): CalendarDayCell[] {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  // Monday is 0, Sunday is 6
  const startDayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const startGridDate = new Date(firstOfMonth.getTime() - startDayOffset * 86400000);

  const todayIso = isoDate(today);
  const cells: CalendarDayCell[] = [];

  // 6 weeks * 7 days = 42 cells guarantees full month representation
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(startGridDate.getTime() + i * 86400000);
    const dateString = isoDate(cellDate);
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: cellDate.getUTCDate(),
      isCurrentMonth: cellDate.getUTCMonth() === monthIndex,
      isToday: dateString === todayIso,
    });
  }

  return cells;
}
