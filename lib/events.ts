/**
 * Calendar query layer.
 *
 * All event reads funnel through here so that the "who may see what" rule is
 * written once: only PUBLISHED events are ever returned, and STAFF_ONLY events
 * are filtered out unless the caller passes a privileged viewer.
 */
import "server-only";

import { prisma } from "@/lib/prisma";
import { SEMESTER_LABELS, type Role, type SemesterType } from "@/lib/constants";
import { formatDateRange } from "@/lib/format";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Shape shared by the agenda list and the event detail page. */
const eventCardSelect = {
  id: true,
  title: true,
  description: true,
  startAt: true,
  endAt: true,
  allDay: true,
  location: true,
  status: true,
  visibility: true,
  scope: true,
  version: true,
  publishedAt: true,
  updatedAt: true,
  category: { select: { name: true, slug: true, color: true } },
  semester: {
    select: { id: true, type: true, session: { select: { name: true } } },
  },
  targets: { select: { targetType: true, targetId: true } },
} as const;

/**
 * Feed rows additionally carry the event's revision count.
 *
 * Revisions are append-only, so the count is the one value guaranteed to grow
 * on every change - which is what an iCalendar SEQUENCE requires. It needs its
 * own select, so only the feed queries pay for it.
 */
const feedSelect = {
  ...eventCardSelect,
  _count: { select: { revisions: true } },
} as const;

/** What a feed query returns: an `EventCard` plus its iCalendar sequence. */
export type FeedEvent = EventCard & { sequence: number };

/**
 * Flatten a feed row: the revision count becomes the SEQUENCE the writer emits.
 *
 * Counting revisions rather than reading `version` is what keeps SEQUENCE
 * monotonic across a cancel and a restore - see `sequenceFor` in
 * lib/services/ics.ts.
 */
function toFeedEvent(
  row: EventCard & { _count: { revisions: number } },
): FeedEvent {
  const { _count, ...event } = row;
  return { ...event, sequence: _count.revisions };
}

export type EventCard = {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  status: string;
  visibility: string;
  scope: string;
  version: number;
  publishedAt: Date | null;
  updatedAt: Date;
  category: { name: string; slug: string; color: string };
  semester: { id: string; type: string; session: { name: string } };
  targets: { targetType: string; targetId: string }[];
};

/**
 * The signed-in reader, or null for an anonymous visitor.
 *
 * Audience targeting is only meaningful if the read path honours it, so this
 * is threaded through every public calendar query.
 */
export type AgendaViewer = {
  role: Role;
  facultyId: string | null;
  departmentId: string | null;
  level: number | null;
} | null;

/**
 * May this viewer see this event?
 *
 * PUBLIC events go to everyone; STAFF_ONLY events only to staff and
 * administrators. Within that, an event targeted at a faculty, department or
 * level is shown to the people it names - and to everyone when the scope is ALL.
 */
export function canViewEvent(
  event: {
    visibility: string;
    scope: string;
    targets: { targetType: string; targetId: string }[];
  },
  viewer: AgendaViewer,
): boolean {
  const isPrivileged = viewer?.role === "ADMIN" || viewer?.role === "STAFF";
  if (event.visibility === "STAFF_ONLY" && !isPrivileged) return false;
  if (event.scope === "ALL") return true;
  if (!viewer) return false;

  return event.targets.some((target) => {
    if (target.targetType === "FACULTY") return target.targetId === viewer.facultyId;
    if (target.targetType === "DEPARTMENT") return target.targetId === viewer.departmentId;
    if (target.targetType === "LEVEL") return target.targetId === String(viewer.level ?? "");
    return false;
  });
}

/** True for the roles that may see STAFF_ONLY events. */
export function isPrivilegedViewer(viewer: AgendaViewer): boolean {
  return viewer?.role === "ADMIN" || viewer?.role === "STAFF";
}

/**
 * The bits of a viewer that decide audience targeting, without the role.
 *
 * Narrower than `AgendaViewer` because feeds and the staff view both need the
 * scope test while the visibility test is handled elsewhere.
 */
export type AudienceSubject = {
  facultyId: string | null;
  departmentId: string | null;
  level: number | null;
} | null;

/**
 * The audience half of every calendar query: whole-university notices, plus
 * anything targeted at the viewer's own faculty, department or level. This is the
 * query-side mirror of `canViewEvent` — the two must agree, or an event would be
 * readable on one path and hidden on another.
 */
export function audienceScopeConditions(
  viewer: AudienceSubject,
): Prisma.CalendarEventWhereInput[] {
  // Anonymous visitors, and signed-in users with no faculty or department on
  // record, only ever see whole-university notices.
  const conditions: Prisma.CalendarEventWhereInput[] = [{ scope: "ALL" }];

  if (viewer?.facultyId) {
    conditions.push({
      scope: "FACULTY",
      targets: { some: { targetType: "FACULTY", targetId: viewer.facultyId } },
    });
  }
  if (viewer?.departmentId) {
    conditions.push({
      scope: "DEPARTMENT",
      targets: { some: { targetType: "DEPARTMENT", targetId: viewer.departmentId } },
    });
  }
  if (viewer?.level) {
    conditions.push({
      scope: "LEVEL",
      targets: { some: { targetType: "LEVEL", targetId: String(viewer.level) } },
    });
  }

  return conditions;
}

/** The visibility half: STAFF_ONLY never reaches students or anonymous visitors. */
export function visibilityFilter(
  viewer: AgendaViewer,
): Prisma.CalendarEventWhereInput["visibility"] {
  return isPrivilegedViewer(viewer) ? { in: ["PUBLIC", "STAFF_ONLY"] } : "PUBLIC";
}

/**
 * Narrow a signed-in user to the viewer shape every query takes.
 *
 * `null` in, `null` out — an anonymous visitor is a legitimate viewer with the
 * narrowest audience, not an error.
 */
export function viewerFrom(
  user: {
    role: Role;
    facultyId: string | null;
    departmentId: string | null;
    level: number | null;
  } | null,
): AgendaViewer {
  if (!user) return null;
  return {
    role: user.role,
    facultyId: user.facultyId,
    departmentId: user.departmentId,
    level: user.level,
  };
}

export type AgendaFilters = {
  semesterId?: string;
  sessionId?: string;
  categorySlug?: string;
  q?: string;
  /**
   * Which slice of the calendar to show. `upcoming` (the default) keeps the
   * landing view on events that have not finished yet; `past` exposes the
   * archive (e.g. the concluded 2025/2026 session); `all` shows everything.
   */
  range?: "upcoming" | "past" | "all";
  /** The signed-in reader, when there is one. */
  viewer?: AgendaViewer;
};

/** Start of today in UTC — every calendar date is stored at UTC midnight. */
function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Public filters offered on /calendar. */
export async function getSemesterOptions() {
  return prisma.semester.findMany({
    select: {
      id: true,
      type: true,
      session: { select: { name: true } },
    },
    orderBy: [{ session: { name: "desc" } }, { startDate: "asc" }],
  });
}

/** Sessions offered in the /calendar session filter, current one first. */
export async function getSessionOptions() {
  return prisma.academicSession.findMany({
    select: { id: true, name: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { name: "desc" }],
  });
}

export async function getCategoryOptions() {
  return prisma.eventCategory.findMany({
    select: { name: true, slug: true, color: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Published events, optionally narrowed by semester, session, category or a
 * free-text search over the title, description and location.
 *
 * `range` controls which slice of the timeline is returned:
 *   • "upcoming" (default) — events that have not finished yet, soonest first,
 *     so the landing view is never dominated by an archived session;
 *   • "past" — the archive, most recent first (how visitors reach the
 *     concluded 2025/2026 session);
 *   • "all" — the full chronological list.
 *
 * Note: SQLite has no `mode: "insensitive"` option in Prisma. Its `LIKE`
 * operator is case-insensitive for ASCII, which is why plain `contains` is used
 * here rather than an explicitly case-insensitive filter.
 */
export async function listAgenda(filters: AgendaFilters = {}): Promise<EventCard[]> {
  const q = filters.q?.trim();
  const range = filters.range ?? "upcoming";
  const today = utcDayStart(new Date());

  const viewer = filters.viewer ?? null;

  // Prisma allows only one OR key per level, so the audience test and the free
  // text search are combined with AND.
  const and: Prisma.CalendarEventWhereInput[] = [
    { OR: audienceScopeConditions(viewer) },
  ];
  if (q) {
    and.push({
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { location: { contains: q } },
      ],
    });
  }

  return prisma.calendarEvent.findMany({
    where: {
      status: "PUBLISHED",
      visibility: visibilityFilter(viewer),
      // An event that ends today stays visible as "upcoming" for the whole day.
      ...(range === "upcoming" ? { endAt: { gte: today } } : {}),
      ...(range === "past" ? { endAt: { lt: today } } : {}),
      ...(filters.sessionId ? { semester: { sessionId: filters.sessionId } } : {}),
      ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
      ...(filters.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
      AND: and,
    },
    select: eventCardSelect,
    orderBy:
      range === "past"
        ? [{ startAt: "desc" }, { title: "asc" }]
        : [{ startAt: "asc" }, { title: "asc" }],
  });
}

/**
 * A single event for the detail page, or `null` when the viewer is not allowed
 * to see it. Callers turn `null` into a 404 so that a draft's existence is not
 * disclosed by the response code.
 */
export async function getEventForViewer(
  id: string,
  viewer: AgendaViewer,
): Promise<EventCard | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    select: eventCardSelect,
  });

  if (!event) return null;
  if (event.status !== "PUBLISHED") return null;
  if (!canViewEvent(event, viewer)) return null;

  return event;
}

export type EventRevisionView = {
  id: string;
  changeType: string;
  changedAt: Date;
  note: string | null;
  diff: {
    before: { startAt: string; endAt: string } | null;
    after: { startAt: string; endAt: string } | null;
  } | null;
  changedByName: string | null;
};

/** Full change history for an event, oldest first. */
export async function listEventRevisions(eventId: string): Promise<EventRevisionView[]> {
  const revisions = await prisma.eventRevision.findMany({
    where: { eventId },
    select: {
      id: true,
      changeType: true,
      changedAt: true,
      note: true,
      diffJson: true,
      changedBy: { select: { name: true } },
    },
    orderBy: { changedAt: "asc" },
  });

  return revisions.map((revision) => {
    let diff: EventRevisionView["diff"] = null;
    try {
      diff = JSON.parse(revision.diffJson) as EventRevisionView["diff"];
    } catch {
      // A malformed snapshot should degrade to "no detail", not break the page.
      diff = null;
    }

    return {
      id: revision.id,
      changeType: revision.changeType,
      changedAt: revision.changedAt,
      note: revision.note,
      diff,
      changedByName: revision.changedBy?.name ?? null,
    };
  });
}

/** Audience targets attached to an event (faculty, department or level). */
export async function listEventTargets(eventId: string) {
  const targets = await prisma.eventTarget.findMany({
    where: { eventId },
    select: { targetType: true, targetId: true },
  });

  const facultyIds = targets.filter((t) => t.targetType === "FACULTY").map((t) => t.targetId);
  const departmentIds = targets
    .filter((t) => t.targetType === "DEPARTMENT")
    .map((t) => t.targetId);

  const [faculties, departments] = await Promise.all([
    facultyIds.length
      ? prisma.faculty.findMany({
          where: { id: { in: facultyIds } },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
    departmentIds.length
      ? prisma.department.findMany({
          where: { id: { in: departmentIds } },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
  ]);

  const facultyNameById = new Map(faculties.map((f) => [f.id, `${f.name} (${f.code})`]));
  const departmentNameById = new Map(
    departments.map((d) => [d.id, `${d.name} (${d.code})`]),
  );

  return targets.map((target) => ({
    targetType: target.targetType,
    label:
      target.targetType === "FACULTY"
        ? (facultyNameById.get(target.targetId) ?? "Unknown faculty")
        : target.targetType === "DEPARTMENT"
          ? (departmentNameById.get(target.targetId) ?? "Unknown department")
          : `${target.targetId} level`,
  }));
}

/** The session currently flagged active, with its semesters and event count. */
export async function getActiveSessionSummary() {
  const session = await prisma.academicSession.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      semesters: {
        select: { id: true, type: true, startDate: true, endDate: true },
        orderBy: { startDate: "asc" },
      },
      _count: { select: { semesters: true } },
    },
    orderBy: { startDate: "desc" },
  });

  if (!session) return null;

  const publishedEvents = await prisma.calendarEvent.count({
    where: { semesterId: { in: session.semesters.map((s) => s.id) }, status: "PUBLISHED" },
  });

  return { ...session, publishedEvents };
}

// ---------------------------------------------------------------------------
// Dashboard reads
// ---------------------------------------------------------------------------

export type AdminStats = {
  total: number;
  published: number;
  draft: number;
  cancelled: number;
  upcoming30Days: number;
  nextEvent: { id: string; title: string; startAt: Date } | null;
  sessionCount: number;
  userCount: number;
};

export async function getAdminStats(now: Date = new Date()): Promise<AdminStats> {
  // Calendar dates live at UTC midnight, so the 30-day window is measured from
  // the start of today in UTC — a request made at 23:59 still counts events
  // that start or end "today".
  const dayStart = utcDayStart(now);
  const in30Days = new Date(dayStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [total, published, draft, cancelled, upcoming30Days, nextEvent, sessionCount, userCount] =
    await Promise.all([
      prisma.calendarEvent.count(),
      prisma.calendarEvent.count({ where: { status: "PUBLISHED" } }),
      prisma.calendarEvent.count({ where: { status: "DRAFT" } }),
      prisma.calendarEvent.count({ where: { status: "CANCELLED" } }),
      prisma.calendarEvent.count({
        where: { status: "PUBLISHED", startAt: { gte: dayStart, lte: in30Days } },
      }),
      prisma.calendarEvent.findFirst({
        where: { status: "PUBLISHED", startAt: { gte: dayStart } },
        select: { id: true, title: true, startAt: true },
        orderBy: { startAt: "asc" },
      }),
      prisma.academicSession.count(),
      prisma.user.count(),
    ]);

  return {
    total,
    published,
    draft,
    cancelled,
    upcoming30Days,
    nextEvent,
    sessionCount,
    userCount,
  };
}

/**
 * Events relevant to a staff member: everything published at whole-university
 * scope plus anything targeted at their faculty, department or level.
 *
 * Limited to events that have not finished yet (soonest first) so the archived
 * 2025/2026 session does not bury the current one.
 */
export async function listStaffAgenda(
  viewer: { facultyId: string | null; departmentId: string | null; level: number | null },
  limit = 12,
): Promise<EventCard[]> {
  return prisma.calendarEvent.findMany({
    where: {
      status: "PUBLISHED",
      endAt: { gte: utcDayStart(new Date()) },
      OR: audienceScopeConditions(viewer),
    },
    select: eventCardSelect,
    orderBy: { startAt: "asc" },
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// Calendar subscription feeds and printing
// ---------------------------------------------------------------------------

/**
 * How long a cancelled event keeps being advertised in a feed.
 *
 * A cancellation has to be *sent* before a subscriber's client can remove the
 * entry, and clients poll on their own schedule (hours, sometimes days). 90 days
 * is a comfortable window; after that the cancellation is assumed to have landed
 * and the event drops out, so feeds do not grow forever.
 */
export const FEED_CANCELLED_WINDOW_DAYS = 90;

/**
 * Everything a personal `.ics` feed should contain: the published events this
 * viewer may see, plus anything cancelled in the last 90 days.
 *
 * Cancelled entries are included on purpose — they are the only way a subscriber
 * learns that a date was withdrawn. The client removes the event from its
 * calendar when it sees STATUS:CANCELLED with a higher SEQUENCE, which is exactly
 * the behaviour that makes subscribing better than checking the website.
 */
export async function listFeedEvents(
  viewer: AgendaViewer,
  options: { now?: Date; cancelledWithinDays?: number } = {},
): Promise<FeedEvent[]> {
  const now = options.now ?? new Date();
  const windowDays = options.cancelledWithinDays ?? FEED_CANCELLED_WINDOW_DAYS;
  const cancelledSince = new Date(
    utcDayStart(now).getTime() - windowDays * 24 * 60 * 60 * 1000,
  );

  const rows = await prisma.calendarEvent.findMany({
    where: {
      visibility: visibilityFilter(viewer),
      AND: [{ OR: audienceScopeConditions(viewer) }],
      OR: [
        { status: "PUBLISHED" },
        // `updatedAt` — not `startAt` — because it is stamped when the event is
        // cancelled, which is the event the subscriber needs to be told about.
        { status: "CANCELLED", updatedAt: { gte: cancelledSince } },
      ],
    },
    select: feedSelect,
    orderBy: { startAt: "asc" },
  });

  return rows.map(toFeedEvent);
}

/**
 * The public, no-account-required feed: published whole-university events, plus
 * recent cancellations of the same kind.
 *
 * Scoped to `scope = ALL` rather than "whatever the anonymous viewer may see":
 * the two happen to coincide today, but this feed is a promise about the
 * university-wide calendar and should not start leaking faculty-targeted notices
 * if anonymous visibility ever widens.
 */
export async function listPublicFeedEvents(
  options: { now?: Date; cancelledWithinDays?: number } = {},
): Promise<FeedEvent[]> {
  const now = options.now ?? new Date();
  const windowDays = options.cancelledWithinDays ?? FEED_CANCELLED_WINDOW_DAYS;
  const cancelledSince = new Date(
    utcDayStart(now).getTime() - windowDays * 24 * 60 * 60 * 1000,
  );

  const rows = await prisma.calendarEvent.findMany({
    where: {
      visibility: "PUBLIC",
      scope: "ALL",
      OR: [
        { status: "PUBLISHED" },
        { status: "CANCELLED", updatedAt: { gte: cancelledSince } },
      ],
    },
    select: feedSelect,
    orderBy: { startAt: "asc" },
  });

  return rows.map(toFeedEvent);
}

/** What the print view is printing: a whole session, or one semester of it. */
export type PrintPeriod = {
  kind: "session" | "semester";
  title: string;
  subtitle: string;
  sessionId: string;
  semesterId: string | null;
};

/**
 * Resolve the `?session=` / `?semester=` pair used by `/calendar/print`.
 *
 * A semester wins when both are given (it is the narrower period). With neither,
 * the print view falls back to the active session so that a plain
 * "print the calendar" link always has something to print.
 */
export async function getPrintPeriod(
  sessionId?: string,
  semesterId?: string,
): Promise<PrintPeriod | null> {
  if (semesterId) {
    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        session: { select: { id: true, name: true } },
      },
    });
    if (!semester) return null;

    return {
      kind: "semester",
      title: `${semester.session.name} · ${
        SEMESTER_LABELS[semester.type as SemesterType] ?? semester.type
      }`,
      subtitle: formatDateRange(semester.startDate, semester.endDate),
      sessionId: semester.session.id,
      semesterId: semester.id,
    };
  }

  const session = sessionId
    ? await prisma.academicSession.findUnique({
        where: { id: sessionId },
        select: { id: true, name: true, startDate: true, endDate: true },
      })
    : await prisma.academicSession.findFirst({
        where: { isActive: true },
        select: { id: true, name: true, startDate: true, endDate: true },
        orderBy: { startDate: "desc" },
      });

  if (!session) return null;

  return {
    kind: "session",
    title: session.name,
    subtitle: formatDateRange(session.startDate, session.endDate),
    sessionId: session.id,
    semesterId: null,
  };
}
