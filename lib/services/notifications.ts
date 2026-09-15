/**
 * Notification service — the "push" half of "nobody should miss a date".
 *
 * Two jobs live here:
 *
 *  1. The notification centre's data access: raise a notice, list a user's
 *     notices, count the unread ones, mark one or all of them read.
 *  2. The scheduled reminder job: for every published event starting exactly
 *     seven days or exactly one day from today, write a reminder for each person
 *     in that event's audience.
 *
 * Three rules are load-bearing:
 *
 *  - **A notice belongs to one person.** Every read and every write is scoped by
 *    `userId`, so no code path here can read or touch another account's notices,
 *    whatever id is passed in.
 *  - **Reminders are idempotent.** `createNotification` refuses to write a second
 *    notice of the same type for the same event for the same user, so a job that
 *    runs twice — or that overlaps with a previous run — cannot spam anybody.
 *  - **The audience is the event's audience.** Recipients come from
 *    `resolveAudienceUserIds`, the same rule the calendar, the staff view and the
 *    feeds use, so a faculty-scoped event reminds only that faculty and a
 *    STAFF_ONLY event never reaches a student.
 *
 * Framework-free (no `next/*`, no `server-only`), so `scripts/run-reminders.mts`
 * and `scripts/verify-phase5.mts` drive it straight from `tsx`.
 */
import {
  type EventScope,
  type EventVisibility,
  type NotificationType,
  type TargetType,
} from "../constants";
import { prisma } from "../db";
import { formatDateRange, formatRelativeDays } from "../format";
import {
  resolveAudienceUserIds,
  writeAudit,
  type Db,
  type TargetRef,
} from "./shared";

/** A notice may be about an event, or standalone (e.g. a system announcement). */
export type CreateNotificationInput = {
  userId: string;
  eventId?: string | null;
  type: NotificationType | string;
  title: string;
  body: string;
};

/**
 * The outcome of `createNotification`.
 *
 * `created: false` is not an error — it is the whole point of the idempotency
 * rule, and the reminder job reports those as "skipped".
 */
export type CreateNotificationOutcome = {
  created: boolean;
  notificationId: string | null;
  /** Why nothing was written. `null` when the notice was created. */
  skipped: "DUPLICATE" | null;
};

/**
 * Raise one notification.
 *
 * When both `eventId` and `type` are given the write is idempotent: if that user
 * already holds a notice of that type for that event, this returns
 * `{ created: false, skipped: "DUPLICATE" }` and writes nothing. Standalone
 * notices (no event) are always written, because there is nothing to compare
 * them against.
 *
 * Check-then-insert is not atomic on its own. It is adequate here because SQLite
 * serialises writers and the job is a single scheduled process; the durable fix
 * would be a unique index on (userId, eventId, type), which needs a schema change
 * and is deliberately out of scope for this phase.
 */
export async function createNotification(
  input: CreateNotificationInput,
  db: Db = prisma,
): Promise<CreateNotificationOutcome> {
  const eventId = input.eventId ?? null;

  if (eventId !== null && input.type) {
    const existing = await db.notification.findFirst({
      where: { userId: input.userId, eventId, type: input.type },
      select: { id: true },
    });

    if (existing) {
      return { created: false, notificationId: existing.id, skipped: "DUPLICATE" };
    }
  }

  const created = await db.notification.create({
    data: {
      userId: input.userId,
      eventId,
      type: input.type,
      title: input.title,
      body: input.body,
    },
    select: { id: true },
  });

  return { created: true, notificationId: created.id, skipped: null };
}

// ---------------------------------------------------------------------------
// The notification centre
// ---------------------------------------------------------------------------

export type NotificationListItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  /**
   * Enough of the event to link to it and to label the notice. Deliberately not
   * the whole event: a notice keeps its own wording even after the event moves,
   * so the page shows what was said at the time and links out for the current
   * dates.
   */
  event: { id: string; title: string; startAt: Date; endAt: Date } | null;
};

export type ListNotificationsOptions = {
  limit?: number;
  unreadOnly?: boolean;
};

/** The most notices one page will render. */
export const NOTIFICATION_PAGE_LIMIT = 100;

/**
 * A user's notices, newest first.
 *
 * `unreadOnly` backs the `?unread=1` filter on /notifications; the limit is
 * clamped so a crafted query string cannot ask for an unbounded result set.
 */
export async function listNotifications(
  userId: string,
  options: ListNotificationsOptions = {},
): Promise<NotificationListItem[]> {
  const limit = Math.min(
    Math.max(Math.trunc(options.limit ?? NOTIFICATION_PAGE_LIMIT), 1),
    NOTIFICATION_PAGE_LIMIT,
  );

  return prisma.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      readAt: true,
      createdAt: true,
      event: { select: { id: true, title: true, startAt: true, endAt: true } },
    },
    // `id` breaks ties so the order is stable when several notices share a
    // timestamp, which they do when the reminder job writes a batch.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
}

/** How many notices this user has not read yet — the number in the header. */
export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export type MarkReadOutcome = {
  /** True when at least one row actually changed state. */
  changed: boolean;
  /** How many rows were flipped from unread to read. */
  marked: number;
};

/**
 * Mark one notice read.
 *
 * The `userId` in the where clause is a security boundary, not a convenience: it
 * means another account's notification id updates zero rows instead of leaking or
 * tampering with their notices. Already-read notices are excluded so the result
 * distinguishes "changed something" from "nothing to do".
 */
export async function markRead(
  userId: string,
  notificationId: string,
  now: Date = new Date(),
): Promise<MarkReadOutcome> {
  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: now },
  });

  return { changed: count > 0, marked: count };
}

/** Mark every unread notice for one user as read. */
export async function markAllRead(
  userId: string,
  now: Date = new Date(),
): Promise<MarkReadOutcome> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now },
  });

  return { changed: count > 0, marked: count };
}

// ---------------------------------------------------------------------------
// The reminder job
// ---------------------------------------------------------------------------

/**
 * The two horizons the university asked for, in calendar days.
 *
 * `type` is checked against NOTIFICATION_TYPES, so a typo here is a compile
 * error rather than a notification nobody ever sees.
 */
export const REMINDER_HORIZONS: readonly { days: number; type: NotificationType }[] = [
  { days: 7, type: "REMINDER_T7" },
  { days: 1, type: "REMINDER_T1" },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Start of the calendar day, in UTC.
 *
 * Every calendar date in Acadex is stored at UTC midnight, so "today" means the
 * UTC calendar day and nothing else.
 */
function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addUtcDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * MS_PER_DAY);
}

/**
 * Whole calendar days from one date to another.
 *
 * `daysBetween` in lib/format.ts measures *elapsed time* (`floor` of the
 * millisecond difference), which would call an event seven calendar days away
 * "in 6 days" whenever the job runs after midday. A reminder is about a calendar
 * day, so the day number is what gets compared — and both operands are brought to
 * UTC midnight before subtracting.
 */
function calendarDaysUntil(from: Date, to: Date): number {
  return Math.round((utcDayStart(to).getTime() - utcDayStart(from).getTime()) / MS_PER_DAY);
}

export type ReminderRunSummary = {
  /** The instant the run used (ISO 8601). */
  runAt: string;
  /** REMINDER_T7 notices created by this run. */
  t7: number;
  /** REMINDER_T1 notices created by this run. */
  t1: number;
  /** Notices not written because that user already had that reminder. */
  skipped: number;
  /** Published, not-yet-started events that fell on one of the two horizons. */
  considered: number;
  /** The audit row this run wrote. */
  auditLogId: string;
};

/**
 * The scheduled reminder job: "exactly one week" and "tomorrow".
 *
 * Every PUBLISHED event starting exactly 7 calendar days from today produces a
 * `REMINDER_T7` for each user in its audience; exactly 1 day produces a
 * `REMINDER_T1`. Events that have already started — or that are drafts or
 * cancelled — are never considered.
 *
 * The run always writes one `AuditLog` row, even when it did nothing: a scheduler
 * that silently stops firing is exactly the failure that log makes visible.
 *
 * `t7` and `t1` count *notifications*, not events, so a run over three events and
 * four recipients can legitimately report a dozen.
 *
 * Delivery is in-app only. Email and SMS are deliberately out of scope for this
 * phase: they would add a mail or SMS dependency plus provider credentials to a
 * system that has to run offline for marking, and they need template, bounce and
 * unsubscribe handling that is a project in itself. The iCalendar feed already
 * covers the "tell me without me visiting the site" case — a subscriber's
 * calendar client polls it hourly and picks up a moved date on its own.
 */
export async function generateDueReminders(
  options: { now?: Date } = {},
): Promise<ReminderRunSummary> {
  const now = options.now ?? new Date();
  const today = utcDayStart(now);

  // Only the two horizons can produce a reminder, so only those days are
  // fetched: tomorrow's midnight up to the end of the seventh day ahead. The
  // lower bound on `startAt` is also what implements "has not started yet".
  const firstDay = addUtcDays(today, 1);
  const seventhDay = addUtcDays(today, 7);

  const events = await prisma.calendarEvent.findMany({
    where: {
      status: "PUBLISHED",
      startAt: { gte: firstDay, lt: addUtcDays(seventhDay, 1) },
    },
    select: {
      id: true,
      title: true,
      location: true,
      startAt: true,
      endAt: true,
      scope: true,
      visibility: true,
      targets: { select: { targetType: true, targetId: true } },
    },
    orderBy: { startAt: "asc" },
  });

  let t7 = 0;
  let t1 = 0;
  let skipped = 0;
  let considered = 0;

  for (const event of events) {
    const daysAway = calendarDaysUntil(today, event.startAt);
    const horizon = REMINDER_HORIZONS.find((entry) => entry.days === daysAway);
    if (!horizon) continue;

    considered += 1;

    const targets: TargetRef[] = event.targets.map((target) => ({
      targetType: target.targetType as TargetType,
      targetId: target.targetId,
    }));

    const userIds = await resolveAudienceUserIds({
      scope: event.scope as EventScope,
      targets,
      visibility: event.visibility as EventVisibility,
    });

    const copy = reminderCopy(event, horizon.days, today);

    for (const userId of userIds) {
      const outcome = await createNotification({
        userId,
        eventId: event.id,
        type: horizon.type,
        title: copy.title,
        body: copy.body,
      });

      if (!outcome.created) {
        skipped += 1;
      } else if (horizon.type === "REMINDER_T7") {
        t7 += 1;
      } else {
        t1 += 1;
      }
    }
  }

  // One row per run, whatever the outcome. `entityId` is left null on purpose —
  // a run is not about one record — and the counts go into the metadata so the
  // audit log answers "did the reminders go out, and for which days?" on its own.
  const audit = await writeAudit(prisma, {
    actorId: null,
    action: "REMINDERS_RUN",
    entity: "Notification",
    meta: {
      runAt: now.toISOString(),
      t7,
      t1,
      skipped,
      considered,
      horizonT7: seventhDay.toISOString().slice(0, 10),
      horizonT1: firstDay.toISOString().slice(0, 10),
    },
  });

  return {
    runAt: now.toISOString(),
    t7,
    t1,
    skipped,
    considered,
    auditLogId: audit.id,
  };
}

/**
 * The wording of a reminder.
 *
 * It names the event, states its dates and says how soon it is — the three things
 * a reader needs from a notice without opening anything. The relative phrase is
 * computed from the *start of today* rather than from the instant the job ran, so
 * a seven-day reminder always reads "in 7 days" instead of "in 6 days" when the
 * job happens to run after midday.
 */
function reminderCopy(
  event: { title: string; location: string | null; startAt: Date; endAt: Date },
  daysAway: number,
  today: Date,
): { title: string; body: string } {
  const range = formatDateRange(event.startAt, event.endAt);
  const soon = formatRelativeDays(event.startAt, today);
  const singleDay = event.startAt.getTime() === event.endAt.getTime();
  const place = event.location ? ` at ${event.location}` : "";

  if (daysAway === 7) {
    return {
      title: `Reminder: ${event.title} is one week away`,
      body: `${event.title} ${singleDay ? "is on" : "runs"} ${range}${place} — ${soon}. This is the week to check the details and confirm nothing has moved.`,
    };
  }

  return {
    title: `Tomorrow: ${event.title}`,
    body: `${event.title} ${singleDay ? "is on" : "starts on"} ${range}${place} — ${soon}. Check the venue and the time today so you are not caught out.`,
  };
}
