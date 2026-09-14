/**
 * Event lifecycle service.
 *
 * Everything an administrator can do to a calendar event lives here: input
 * validation, conflict warnings, revision history, audience notifications and
 * the audit trail. The server actions in `lib/actions/admin-events.ts` are thin
 * wrappers that only resolve the signed-in user and translate the result into a
 * redirect.
 *
 * Domain rules worth stating once, because they are examinable:
 *  �?� `version` counts *date moves*, not edits �? a typo fix must not make the
 *    public page shout "rescheduled".
 *  �?� A published event is never hard-deleted �? it is cancelled, so the change
 *    history survives. Only drafts can be removed outright.
 *  �?� Reschedules and cancellations notify exactly the users in the event's
 *    audience.
 */
import { prisma } from "../db";
import {
  EVENT_SCOPES,
  EVENT_VISIBILITIES,
  type EventScope,
  type EventVisibility,
  type RevisionType,
} from "../constants";
import { formatDateRange } from "../format";
import {
  combineDateAndTime,
  describeDateChange,
  describeTargets,
  fail,
  makeSnapshot,
  notifyAudience,
  parseDateOnly,
  parseTimeOnly,
  succeed,
  validateTargets,
  writeAudit,
  writeRevision,
  type Actor,
  type ServiceResult,
  type TargetRef,
} from "./shared";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

export type EventInput = {
  title: string;
  description: string;
  categoryId: string;
  semesterId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  visibility: string;
  scope: string;
  targetIds: string[];
};

type NormalisedEvent = {
  title: string;
  description: string | null;
  categoryId: string;
  semesterId: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  visibility: EventVisibility;
  scope: EventScope;
  targets: TargetRef[];
  targetLabels: string[];
  semesterWindow: { startDate: Date; endDate: Date };
  warnings: string[];
};

/**
 * Turn raw form input into a validated event, collecting every problem at once
 * so the administrator does not have to submit the form five times.
 */
async function normalise(
  input: EventInput,
  excludeEventId?: string,
): Promise<{ ok: true; value: NormalisedEvent } | { ok: false; errors: string[] }> {
  const errors: string[] = [];

  const title = input.title.trim();
  if (!title) errors.push("A title is required.");
  else if (title.length > MAX_TITLE) {
    errors.push(`Keep the title under ${MAX_TITLE} characters.`);
  }

  const description = input.description.trim();
  if (description.length > MAX_DESCRIPTION) {
    errors.push(`Keep the description under ${MAX_DESCRIPTION} characters.`);
  }

  if (!(EVENT_VISIBILITIES as readonly string[]).includes(input.visibility)) {
    errors.push("Choose who may see this event.");
  }
  if (!(EVENT_SCOPES as readonly string[]).includes(input.scope)) {
    errors.push("Choose a valid audience.");
  }

  const semester = input.semesterId
    ? await prisma.semester.findUnique({
        where: { id: input.semesterId },
        select: { id: true, startDate: true, endDate: true },
      })
    : null;
  if (!semester) errors.push("Choose the semester this event belongs to.");

  const category = input.categoryId
    ? await prisma.eventCategory.findUnique({
        where: { id: input.categoryId },
        select: { id: true },
      })
    : null;
  if (!category) errors.push("Choose a category.");

  const startDate = parseDateOnly(input.startDate ?? "");
  const endDate = parseDateOnly(input.endDate ?? "");
  if (!startDate) errors.push("Enter a valid start date.");
  if (!endDate) errors.push("Enter a valid end date.");

  if (errors.length > 0 || !semester || !category || !startDate || !endDate) {
    return { ok: false, errors };
  }

  let startTime: { hours: number; minutes: number } | null = null;
  let endTime: { hours: number; minutes: number } | null = null;

  if (input.allDay !== true) {
    startTime = parseTimeOnly(input.startTime ?? "");
    endTime = parseTimeOnly(input.endTime ?? "");
    if (!startTime) errors.push("Enter a valid start time.");
    if (!endTime) errors.push("Enter a valid end time.");
    if (errors.length > 0 || !startTime || !endTime) return { ok: false, errors };
  }

  const startAt = combineDateAndTime(startDate, startTime);
  const endAt = combineDateAndTime(endDate, endTime);
  if (endAt.getTime() < startAt.getTime()) {
    errors.push("The end date cannot be before the start date.");
  }

  const scope = input.scope as EventScope;
  const targetResult = await validateTargets(scope, input.targetIds);
  if (!targetResult.ok) errors.push(...targetResult.errors);

  if (errors.length > 0 || !targetResult.ok) return { ok: false, errors };

  const targetLabels = await describeTargets(targetResult.targets);
  const warnings = await findWarnings({
    semesterId: semester.id,
    semesterWindow: { startDate: semester.startDate, endDate: semester.endDate },
    startAt,
    endAt,
    categoryId: category.id,
    scope,
    targets: targetResult.targets,
    excludeEventId,
  });

  return {
    ok: true,
    value: {
      title,
      description: description || null,
      categoryId: category.id,
      semesterId: semester.id,
      startAt,
      endAt,
      allDay: input.allDay === true,
      location: input.location.trim() || null,
      visibility: input.visibility as EventVisibility,
      scope,
      targets: targetResult.targets,
      targetLabels,
      semesterWindow: { startDate: semester.startDate, endDate: semester.endDate },
      warnings,
    },
  };
}

function audiencesOverlap(
  scopeA: EventScope,
  targetsA: Set<string>,
  scopeB: string,
  targetsB: Set<string>,
): boolean {
  if (scopeA === "ALL" || scopeB === "ALL") return true;
  for (const target of targetsA) {
    if (targetsB.has(target)) return true;
  }
  return false;
}

/**
 * Soft warnings. These never block a save �? a real registry sometimes *has* to
 * schedule an exam inside another window �? but they are surfaced to the
 * administrator immediately.
 */
async function findWarnings(input: {
  semesterId: string;
  semesterWindow: { startDate: Date; endDate: Date };
  startAt: Date;
  endAt: Date;
  categoryId: string;
  scope: EventScope;
  targets: TargetRef[];
  excludeEventId?: string;
}): Promise<string[]> {
  const warnings: string[] = [];

  if (
    input.startAt.getTime() < input.semesterWindow.startDate.getTime() ||
    input.endAt.getTime() > input.semesterWindow.endDate.getTime()
  ) {
    warnings.push(
      `Falls outside the semester window (${formatDateRange(
        input.semesterWindow.startDate,
        input.semesterWindow.endDate,
      )}).`,
    );
  }

  const [overlapping, category] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        semesterId: input.semesterId,
        status: { not: "CANCELLED" },
        ...(input.excludeEventId ? { id: { not: input.excludeEventId } } : {}),
        startAt: { lte: input.endAt },
        endAt: { gte: input.startAt },
      },
      select: {
        title: true,
        startAt: true,
        endAt: true,
        scope: true,
        category: { select: { name: true, slug: true } },
        targets: { select: { targetType: true, targetId: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.eventCategory.findUnique({
      where: { id: input.categoryId },
      select: { slug: true },
    }),
  ]);

  const myTargets = new Set(
    input.targets.map((target) => `${target.targetType}:${target.targetId}`),
  );
  const examClashes: string[] = [];
  const otherClashes: string[] = [];

  for (const other of overlapping) {
    const otherTargets = new Set(
      other.targets.map((target) => `${target.targetType}:${target.targetId}`),
    );
    if (!audiencesOverlap(input.scope, myTargets, other.scope, otherTargets)) continue;

    const range = formatDateRange(other.startAt, other.endAt);
    const isExam =
      other.category.slug === "examinations" || category?.slug === "examinations";

    if (isExam) examClashes.push(`${other.title} (${other.category.name}, ${range})`);
    else otherClashes.push(`${other.title} (${range})`);
  }

  const summarise = (items: string[]): string =>
    `${items.slice(0, 3).join("; ")}${items.length > 3 ? ` and ${items.length - 3} more` : ""}`;

  if (examClashes.length > 0) {
    warnings.push(`Clashes with an examination window: ${summarise(examClashes)}.`);
  }
  if (otherClashes.length > 0) {
    warnings.push(`Overlaps another event: ${summarise(otherClashes)}.`);
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createEvent(
  actor: Actor,
  input: EventInput,
  options: { publish: boolean },
): Promise<ServiceResult<{ eventId: string }>> {
  const result = await normalise(input);
  if (!result.ok) return fail(...result.errors);

  const value = result.value;
  const status = options.publish ? "PUBLISHED" : "DRAFT";
  const snapshot = makeSnapshot({ ...value, status }, value.targetLabels);

  const eventId = await prisma.$transaction(async (tx) => {
    const created = await tx.calendarEvent.create({
      data: {
        title: value.title,
        description: value.description,
        categoryId: value.categoryId,
        semesterId: value.semesterId,
        startAt: value.startAt,
        endAt: value.endAt,
        allDay: value.allDay,
        location: value.location,
        status,
        visibility: value.visibility,
        scope: value.scope,
        createdById: actor.id,
        publishedAt: options.publish ? new Date() : null,
        version: 1,
      },
      select: { id: true },
    });

    for (const target of value.targets) {
      await tx.eventTarget.create({
        data: {
          eventId: created.id,
          targetType: target.targetType,
          targetId: target.targetId,
        },
      });
    }

    await writeRevision(tx, {
      eventId: created.id,
      changedById: actor.id,
      changeType: "CREATED",
      note: options.publish
        ? "Event created and published to the calendar."
        : "Draft created.",
      before: null,
      after: snapshot,
    });

    if (options.publish) {
      await writeRevision(tx, {
        eventId: created.id,
        changedById: actor.id,
        changeType: "PUBLISHED",
        note: "Published to the academic calendar.",
        before: snapshot,
        after: snapshot,
      });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: options.publish ? "EVENT_CREATED_AND_PUBLISHED" : "EVENT_CREATED",
      entity: "CalendarEvent",
      entityId: created.id,
      meta: { title: value.title, scope: value.scope, visibility: value.visibility },
    });

    return created.id;
  });

  return succeed({ eventId }, value.warnings);
}

export async function updateEvent(
  actor: Actor,
  eventId: string,
  input: EventInput,
  options: { publish?: boolean } = {},
): Promise<ServiceResult<{ eventId: string; version: number; rescheduled: boolean }>> {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      description: true,
      categoryId: true,
      semesterId: true,
      startAt: true,
      endAt: true,
      allDay: true,
      location: true,
      status: true,
      visibility: true,
      scope: true,
      version: true,
      publishedAt: true,
      targets: { select: { targetType: true, targetId: true } },
    },
  });

  if (!existing) return fail("That event no longer exists.");

  const result = await normalise(input, eventId);
  if (!result.ok) return fail(...result.errors);

  const value = result.value;
  const beforeSnapshot = makeSnapshot(
    existing,
    await describeTargets(
      existing.targets.map((target) => ({
        targetType: target.targetType as TargetRef["targetType"],
        targetId: target.targetId,
      })),
    ),
  );

  // `version` counts date moves only �? see the note at the top of this file.
  const rescheduled =
    existing.startAt.getTime() !== value.startAt.getTime() ||
    existing.endAt.getTime() !== value.endAt.getTime();
  const publishing = options.publish === true && existing.status !== "PUBLISHED";
  const nextStatus = publishing ? "PUBLISHED" : existing.status;
  const nextVersion = rescheduled ? existing.version + 1 : existing.version;

  const afterSnapshot = makeSnapshot({ ...value, status: nextStatus }, value.targetLabels);
  const dateNote = rescheduled
    ? describeDateChange(beforeSnapshot, afterSnapshot)
    : null;

  const notified = await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({
      where: { id: eventId },
      data: {
        title: value.title,
        description: value.description,
        categoryId: value.categoryId,
        semesterId: value.semesterId,
        startAt: value.startAt,
        endAt: value.endAt,
        allDay: value.allDay,
        location: value.location,
        visibility: value.visibility,
        scope: value.scope,
        status: nextStatus,
        version: nextVersion,
        publishedAt: publishing ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      },
    });

    await tx.eventTarget.deleteMany({ where: { eventId } });
    for (const target of value.targets) {
      await tx.eventTarget.create({
        data: {
          eventId,
          targetType: target.targetType,
          targetId: target.targetId,
        },
      });
    }

    const changeType: RevisionType = rescheduled ? "RESCHEDULED" : "UPDATED";
    await writeRevision(tx, {
      eventId,
      changedById: actor.id,
      changeType,
      note: dateNote ?? "Event details updated.",
      before: beforeSnapshot,
      after: afterSnapshot,
    });

    if (publishing) {
      await writeRevision(tx, {
        eventId,
        changedById: actor.id,
        changeType: "PUBLISHED",
        note: "Published to the academic calendar.",
        before: afterSnapshot,
        after: afterSnapshot,
      });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: rescheduled ? "EVENT_RESCHEDULED" : "EVENT_UPDATED",
      entity: "CalendarEvent",
      entityId: eventId,
      meta: { title: value.title, version: nextVersion, rescheduled },
    });

    if (rescheduled && existing.status === "PUBLISHED") {
      return notifyAudience(tx, {
        eventId,
        type: "EVENT_RESCHEDULED",
        title: `Rescheduled: ${value.title}`,
        body: dateNote ?? "The dates for this event have changed.",
        scope: value.scope,
        targets: value.targets,
        visibility: value.visibility,
      });
    }

    return 0;
  });

  const warnings = [...value.warnings];
  if (notified > 0) {
    warnings.push(
      `Notified ${notified} ${notified === 1 ? "person" : "people"} in the audience about the new dates.`,
    );
  }

  return succeed({ eventId, version: nextVersion, rescheduled }, warnings);
}

export async function publishEvent(
  actor: Actor,
  eventId: string,
): Promise<ServiceResult<{ eventId: string; notified: number }>> {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, status: true, publishedAt: true },
  });

  if (!existing) return fail("That event no longer exists.");
  if (existing.status === "PUBLISHED") return fail("That event is already published.");

  await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({
      where: { id: eventId },
      data: { status: "PUBLISHED", publishedAt: existing.publishedAt ?? new Date() },
    });
    await writeRevision(tx, {
      eventId,
      changedById: actor.id,
      changeType: "PUBLISHED",
      note:
        existing.status === "CANCELLED"
          ? "Event restored to the published calendar."
          : "Published to the academic calendar.",
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "EVENT_PUBLISHED",
      entity: "CalendarEvent",
      entityId: eventId,
      meta: { title: existing.title, previousStatus: existing.status },
    });
  });

  return succeed({ eventId, notified: 0 });
}

export async function cancelEvent(
  actor: Actor,
  eventId: string,
): Promise<ServiceResult<{ eventId: string; notified: number }>> {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      status: true,
      scope: true,
      visibility: true,
      targets: { select: { targetType: true, targetId: true } },
    },
  });

  if (!existing) return fail("That event no longer exists.");
  if (existing.status !== "PUBLISHED") {
    return fail("Only a published event can be cancelled.");
  }

  const targets: TargetRef[] = existing.targets.map((target) => ({
    targetType: target.targetType as TargetRef["targetType"],
    targetId: target.targetId,
  }));

  const notified = await prisma.$transaction(async (tx) => {
    await tx.calendarEvent.update({
      where: { id: eventId },
      data: { status: "CANCELLED" },
    });

    await writeRevision(tx, {
      eventId,
      changedById: actor.id,
      changeType: "CANCELLED",
      note: "Event cancelled. It no longer appears on the calendar.",
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "EVENT_CANCELLED",
      entity: "CalendarEvent",
      entityId: eventId,
      meta: { title: existing.title },
    });

    return notifyAudience(tx, {
      eventId,
      type: "EVENT_CANCELLED",
      title: `Cancelled: ${existing.title}`,
      body: "This event has been cancelled and no longer appears on the academic calendar.",
      scope: existing.scope as EventScope,
      targets,
      visibility: existing.visibility as EventVisibility,
    });
  });

  return succeed({ eventId, notified });
}

/**
 * Remove a draft outright.
 *
 * Published and cancelled events are never deleted: their change history is the
 * point of the system, so they can only be cancelled.
 */
export async function deleteDraftEvent(
  actor: Actor,
  eventId: string,
): Promise<ServiceResult<{ eventId: string }>> {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
      scope: true,
      visibility: true,
      semesterId: true,
      categoryId: true,
    },
  });

  if (!existing) return fail("That event no longer exists.");
  if (existing.status !== "DRAFT") {
    return fail(
      "Only drafts can be deleted. Cancel a published event instead so its change history is preserved.",
    );
  }

  await prisma.$transaction(async (tx) => {
    // Targets and revisions cascade with the event; the audit row below keeps
    // the record of what was removed.
    await tx.calendarEvent.delete({ where: { id: eventId } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "EVENT_DELETED",
      entity: "CalendarEvent",
      entityId: eventId,
      meta: {
        title: existing.title,
        status: existing.status,
        startAt: existing.startAt.toISOString(),
        endAt: existing.endAt.toISOString(),
        semesterId: existing.semesterId,
        categoryId: existing.categoryId,
      },
    });
  });

  return succeed({ eventId });
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export type AdminEventRow = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  scope: string;
  version: number;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  updatedAt: Date;
  category: { name: string; slug: string; color: string };
  semester: { id: string; type: string; session: { name: string } };
  targetCount: number;
};

export async function listEventsForAdmin(
  filters: {
    sessionId?: string;
    semesterId?: string;
    status?: string;
    categorySlug?: string;
    q?: string;
  } = {},
): Promise<AdminEventRow[]> {
  const q = filters.q?.trim();

  const events = await prisma.calendarEvent.findMany({
    where: {
      ...(filters.sessionId ? { semester: { sessionId: filters.sessionId } } : {}),
      ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { location: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      visibility: true,
      scope: true,
      version: true,
      startAt: true,
      endAt: true,
      allDay: true,
      updatedAt: true,
      category: { select: { name: true, slug: true, color: true } },
      semester: { select: { id: true, type: true, session: { select: { name: true } } } },
      _count: { select: { targets: true } },
    },
    orderBy: [{ startAt: "desc" }, { title: "asc" }],
    take: 300,
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    status: event.status,
    visibility: event.visibility,
    scope: event.scope,
    version: event.version,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    updatedAt: event.updatedAt,
    category: event.category,
    semester: event.semester,
    targetCount: event._count.targets,
  }));
}

export type AdminEventDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  scope: string;
  version: number;
  allDay: boolean;
  location: string | null;
  startAt: Date;
  endAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; slug: string; color: string };
  semester: {
    id: string;
    type: string;
    startDate: Date;
    endDate: Date;
    session: { id: string; name: string };
  };
  createdByName: string | null;
  targets: TargetRef[];
  targetLabels: string[];
  warnings: string[];
};

/** The full record behind the edit screen, including live conflict warnings. */
export async function getEventForAdmin(
  eventId: string,
): Promise<AdminEventDetail | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      visibility: true,
      scope: true,
      version: true,
      allDay: true,
      location: true,
      startAt: true,
      endAt: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      categoryId: true,
      category: { select: { id: true, name: true, slug: true, color: true } },
      semester: {
        select: {
          id: true,
          type: true,
          startDate: true,
          endDate: true,
          session: { select: { id: true, name: true } },
        },
      },
      createdBy: { select: { name: true } },
      targets: { select: { targetType: true, targetId: true } },
    },
  });

  if (!event) return null;

  const targets: TargetRef[] = event.targets.map((target) => ({
    targetType: target.targetType as TargetRef["targetType"],
    targetId: target.targetId,
  }));

  const [targetLabels, warnings] = await Promise.all([
    describeTargets(targets),
    findWarnings({
      semesterId: event.semester.id,
      semesterWindow: {
        startDate: event.semester.startDate,
        endDate: event.semester.endDate,
      },
      startAt: event.startAt,
      endAt: event.endAt,
      categoryId: event.categoryId,
      scope: event.scope as EventScope,
      targets,
      excludeEventId: event.id,
    }),
  ]);

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    status: event.status,
    visibility: event.visibility,
    scope: event.scope,
    version: event.version,
    allDay: event.allDay,
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    publishedAt: event.publishedAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    category: event.category,
    semester: event.semester,
    createdByName: event.createdBy?.name ?? null,
    targets,
    targetLabels,
    warnings,
  };
}

export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  metaJson: string | null;
  createdAt: Date;
  actorName: string | null;
};

export async function listAuditEntries(
  filters: { action?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const entries = await prisma.auditLog.findMany({
    where: filters.action ? { action: filters.action } : {},
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      metaJson: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 100,
  });

  return entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    metaJson: entry.metaJson,
    createdAt: entry.createdAt,
    actorName: entry.actor?.name ?? null,
  }));
}

/** Distinct action names, for the audit filter dropdown. */
export async function listAuditActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((row) => row.action);
}

/** Form options shared by the create and edit screens. */
export async function getEventFormOptions() {
  const [categories, semesters, faculties, departments] = await Promise.all([
    prisma.eventCategory.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.semester.findMany({
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        session: { select: { id: true, name: true, isActive: true } },
      },
      orderBy: [{ session: { name: "desc" } }, { startDate: "asc" }],
    }),
    prisma.faculty.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      select: { id: true, name: true, code: true, facultyId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { categories, semesters, faculties, departments };
}

export type EventFormOptions = Awaited<ReturnType<typeof getEventFormOptions>>;

