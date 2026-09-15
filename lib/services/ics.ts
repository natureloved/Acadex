/**
 * iCalendar (RFC 5545) writer.
 *
 * Deliberately a *pure* module: no Prisma, no `next/*`, no `server-only`, so it
 * can be exercised directly from `tsx` (see `scripts/verify-phase4.mts`) and its
 * output reasoned about line by line. Everything that needs the database lives in
 * the route handlers that call it.
 *
 * Why hand-rolled rather than a library: the deliverable explicitly forbids new
 * dependencies, and the subset Acadex needs (all-day dates, floating wall-clock
 * times, TEXT escaping, folding) is about 150 lines — smaller than the config a
 * dependency would need, and examinable.
 *
 * Time model, which is the part most likely to be got wrong:
 *  - All-day events are stored at UTC midnight and are emitted as `VALUE=DATE`.
 *  - Timed events are stored as *wall-clock* time in UTC fields (09:00 entered
 *    is stored as 09:00Z) and are emitted as **floating** local time: no `Z`,
 *    no `TZID`. Emitting them as UTC would show a Lagos subscriber a one-hour
 *    error in Google Calendar, because Lagos is UTC+1.
 */
import { formatDateRange } from "../format";

/** Injected into UID, matching the domain every Acadex notification comes from. */
const CALENDAR_DOMAIN = "acadex.lasu.edu.ng";

/** The calendar's home timezone, advertised via X-WR-TIMEZONE for information. */
const TIMEZONE = "Africa/Lagos";

/** RFC 5545 §3.1: lines SHOULD NOT be longer than 75 octets, excluding CRLF. */
const MAX_OCTETS = 75;

/** How often a subscribing client should come back for changes. */
const REFRESH_INTERVAL = "PT1H";

const DEFAULT_CALENDAR_NAME = "LASU Academic Calendar";
const DEFAULT_CALENDAR_DESCRIPTION =
  "Published dates from the Lagos State University academic calendar, including corrections and cancellations.";

/**
 * The event fields the writer needs.
 *
 * Structurally compatible with `EventCard` from lib/events.ts, so feed routes can
 * pass database rows straight in — but declared here so the module stays free of
 * any import that would drag in Prisma.
 */
export type IcsEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  /** PUBLISHED | CANCELLED (drafts never reach a feed). */
  status: string;
  /** Counts date moves only; drives the reschedule note.
   *  It is NOT safe as an iCalendar sequence - see `sequenceFor` below. */
  version: number;
  /**
   * Monotonic iCalendar SEQUENCE, taken from the event's append-only revision
   * count by the feed queries. Left undefined by callers that do not have it
   * (the single-event download), in which case the writer falls back to a
   * version-derived number.
   */
  sequence?: number;
  updatedAt: Date;
  category: { name: string };
};

export type IcsOptions = {
  /** `X-WR-CALNAME` — what the subscriber sees in their calendar list. */
  calendarName?: string;
  /** `X-WR-CALDESC` — the description shown next to the subscription. */
  calendarDescription?: string;
  /**
   * Injectable clock. `DTSTAMP` must be "now" in production, but pinning it
   * keeps the verification script's output deterministic.
   */
  now?: Date;
};

// ---------------------------------------------------------------------------
// Text escaping and line folding
// ---------------------------------------------------------------------------

/**
 * Escape a value for use in a TEXT property (RFC 5545 §3.3.11).
 *
 * Order matters: the backslash must be escaped *first*, or the backslashes this
 * function introduces would themselves be escaped a second time.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    // A newline is written as the two characters backslash + n, not as a break:
    // a raw line break inside a property would end the property.
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold one logical line to at most 75 octets per physical line.
 *
 * Continuation lines begin with a single space, which the parser strips when it
 * joins them back together. The fold walks *code points* (`for…of`) and measures
 * each one in UTF-8, so a multi-byte character is never split across a fold —
 * splitting it would put a replacement character (U+FFFD) in the subscriber's
 * calendar where "Ẹ̀kọ́" or "✓" used to be.
 *
 * Exported so the verification script can test it directly as well as through
 * the generated calendar.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = "";
  let octets = 0;

  for (const character of line) {
    const size = encoder.encode(character).length;

    if (octets + size > MAX_OCTETS) {
      pieces.push(current);
      // The continuation line's leading space counts towards its 75 octets.
      current = " ";
      octets = 1;
    }

    current += character;
    octets += size;
  }

  pieces.push(current);
  return pieces.join("\r\n");
}

/** Serialise logical lines with CRLF endings and 75-octet folding, per RFC 5545. */
function serialise(lines: string[]): string {
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// Date and time formatting
// ---------------------------------------------------------------------------

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

/** `YYYYMMDD` from the UTC fields: calendar dates are stored at UTC midnight. */
export function toIcsDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/**
 * `YYYYMMDDTHHMMSS` — floating local time (no trailing `Z`, no `TZID`).
 *
 * The UTC getters are used on purpose: the wall-clock time was *stored* in the
 * UTC fields, so reading it back with getUTCHours() returns exactly what the
 * registrar typed.
 */
export function toIcsDateTime(date: Date): string {
  return (
    `${toIcsDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}`
  );
}

/** `YYYYMMDDTHHMMSSZ` — a true instant, used for DTSTAMP and LAST-MODIFIED. */
export function toIcsUtcStamp(date: Date): string {
  return `${toIcsDateTime(date)}Z`;
}

/** The day after `date`, used to turn an inclusive end date into an exclusive DTEND. */
export function addOneDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
}

// ---------------------------------------------------------------------------
// Event serialisation
// ---------------------------------------------------------------------------

/**
 * RFC 5545 sequence number.
 *
 * A subscribed client MUST ignore an update whose SEQUENCE is lower than the one
 * it already holds, so the value has to be monotonic for a given UID whatever
 * happens to the event.
 *
 * A version-derived number is NOT monotonic: `version` counts date moves only, so
 * cancelling and then restoring an event (neither moves a date) emits a *lower*
 * sequence than the cancellation did, and the subscriber's client keeps showing
 * the event as cancelled. That defect was reproduced before this was written.
 *
 * Feeds therefore pass an explicit `sequence` taken from the append-only revision
 * count, which only ever grows. `version` remains the fallback for the
 * single-event download, where monotonicity across rebuilds does not arise.
 */
function sequenceFor(event: IcsEvent): number {
  if (typeof event.sequence === "number") return event.sequence;

  const base = Math.max(0, event.version - 1);
  return event.status === "CANCELLED" ? base + 1 : base;
}

/**
 * The human-readable body of the description.
 *
 * A rescheduled event says so and repeats the current approved dates: that is
 * the whole point of the feed, because the subscriber's calendar is re-synced
 * silently and would otherwise show a moved date with no explanation.
 */
function buildDescription(event: IcsEvent): string | null {
  const parts: string[] = [];

  if (event.status === "CANCELLED") {
    parts.push(
      "This date has been cancelled and withdrawn from the academic calendar.",
    );
  }

  if (event.description?.trim()) {
    parts.push(event.description.trim());
  }

  if (event.version > 1) {
    const range = formatDateRange(event.startAt, event.endAt);
    parts.push(
      `Rescheduled: this is revision ${event.version} and the dates shown are the ` +
        `current approved dates (${range}). An earlier version of this entry has been replaced.`,
    );
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

/** DTSTART/DTEND for one event, honouring the all-day and floating-time rules. */
function dateProperties(event: IcsEvent): string[] {
  // A mis-entered end date before the start would produce an event that a client
  // may drop entirely, so the window is clamped to at least one day.
  const endAt =
    event.endAt.getTime() < event.startAt.getTime() ? event.startAt : event.endAt;

  if (event.allDay) {
    // DTEND is exclusive in RFC 5545, so an inclusive end date gains a day and a
    // single-day event still ends "the next day".
    return [
      `DTSTART;VALUE=DATE:${toIcsDate(event.startAt)}`,
      `DTEND;VALUE=DATE:${toIcsDate(addOneDay(endAt))}`,
    ];
  }

  return [
    `DTSTART:${toIcsDateTime(event.startAt)}`,
    `DTEND:${toIcsDateTime(endAt)}`,
  ];
}

/** Stable identifier: the same event keeps the same UID across every rebuild. */
export function uidFor(eventId: string): string {
  return `${eventId}@${CALENDAR_DOMAIN}`;
}

/** The VEVENT block for one event. */
function eventLines(event: IcsEvent, now: Date): string[] {
  const description = buildDescription(event);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uidFor(event.id)}`,
    `DTSTAMP:${toIcsUtcStamp(now)}`,
    `LAST-MODIFIED:${toIcsUtcStamp(event.updatedAt)}`,
    `SEQUENCE:${sequenceFor(event)}`,
    // CONFIRMED for anything still on the calendar; CANCELLED tells the client
    // to remove the entry it already has, which is the only way a subscriber
    // ever learns that a date was withdrawn.
    `STATUS:${event.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
    ...dateProperties(event),
    `SUMMARY:${escapeText(event.title)}`,
    `CATEGORIES:${escapeText(event.category.name)}`,
  ];

  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);

  lines.push("END:VEVENT");
  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** The calendar-level envelope every Acadex feed starts with. */
function envelope(options: IcsOptions): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Acadex//LASU Academic Calendar//EN",
    "CALSCALE:GREGORIAN",
    // PUBLISH, not REQUEST: this is a public read-only feed, not a meeting invite.
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.calendarName ?? DEFAULT_CALENDAR_NAME)}`,
    `X-WR-TIMEZONE:${TIMEZONE}`,
    `X-WR-CALDESC:${escapeText(options.calendarDescription ?? DEFAULT_CALENDAR_DESCRIPTION)}`,
    // Refresh hints: Google honours X-PUBLISHED-TTL, Apple honours
    // REFRESH-INTERVAL. Both say "an hour", matching the feed's Cache-Control.
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH_INTERVAL}`,
    `X-PUBLISHED-TTL:${REFRESH_INTERVAL}`,
  ];
}

/**
 * Build a whole calendar from a list of events.
 *
 * Events are written in the order given; callers sort them (feeds sort by start
 * date) so the output is stable between rebuilds, which keeps a subscriber's
 * client from re-processing an unchanged feed.
 */
export function buildCalendar(events: readonly IcsEvent[], options: IcsOptions = {}): string {
  const now = options.now ?? new Date();

  const lines = [...envelope(options)];
  for (const event of events) lines.push(...eventLines(event, now));
  lines.push("END:VCALENDAR");

  return serialise(lines);
}

/** Build a single-event calendar, for the "download this event" button. */
export function buildEventCalendar(event: IcsEvent, options: IcsOptions = {}): string {
  return buildCalendar([event], {
    calendarName: event.title,
    calendarDescription:
      buildDescription(event) ?? DEFAULT_CALENDAR_DESCRIPTION,
    ...options,
  });
}

/**
 * "Add to Google Calendar" template URL.
 *
 * Google accepts the same two date shapes as the feed — `YYYYMMDD/YYYYMMDD` with
 * an exclusive end for all-day events, and floating `YYYYMMDDTHHMMSS` for timed
 * ones — so the button and the subscription agree on what the date means.
 */
export function buildGoogleCalendarUrl(event: IcsEvent): string {
  const endAt =
    event.endAt.getTime() < event.startAt.getTime() ? event.startAt : event.endAt;

  const dates = event.allDay
    ? `${toIcsDate(event.startAt)}/${toIcsDate(addOneDay(endAt))}`
    : `${toIcsDateTime(event.startAt)}/${toIcsDateTime(endAt)}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
  });

  const details = buildDescription(event);
  if (details) params.set("details", details);
  if (event.location) params.set("location", event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
