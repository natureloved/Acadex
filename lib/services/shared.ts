/**
 * Shared building blocks for the admin service layer.
 *
 * The service layer owns the business rules and is deliberately free of
 * framework imports (`next/headers`, `server-only`) so that plain Node scripts
 * �? such as `scripts/verify-phase3.mts` �? can exercise it directly, and so the
 * rules can be unit-reasoned about without a running server.
 */
import { prisma } from "../db";
import {
  LEVELS,
  type EventScope,
  type EventVisibility,
  type RevisionType,
  type Role,
  type TargetType,
} from "../constants";
import { formatDateRange } from "../format";
import type { Prisma } from "../generated/prisma/client";

/** The acting user, resolved by the caller from the session. */
export type Actor = { id: string; role: Role };

export type ServiceSuccess<T> = { ok: true; warnings: string[]; data: T };
export type ServiceFailure = { ok: false; errors: string[] };
export type ServiceResult<T = Record<string, never>> =
  | ServiceSuccess<T>
  | ServiceFailure;

/** Anything that can run a query: the client itself, or a transaction. */
export type Db = Prisma.TransactionClient;

export function fail(...errors: string[]): ServiceFailure {
  return { ok: false, errors };
}

export function succeed<T>(data: T, warnings: string[] = []): ServiceSuccess<T> {
  return { ok: true, warnings, data };
}

// ---------------------------------------------------------------------------
// Dates �? every calendar date is stored at UTC midnight (see lib/format.ts)
// ---------------------------------------------------------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_ONLY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse `YYYY-MM-DD` into a UTC-midnight Date, or null when invalid. */
export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Reject impossible dates such as 2026-02-31, which Date would roll over.
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return valid ? date : null;
}

export function parseTimeOnly(value: string): { hours: number; minutes: number } | null {
  const match = TIME_ONLY.exec(value.trim());
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** `YYYY-MM-DD`, for an `<input type="date">`. */
export function toDateInputValue(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** `HH:MM`, for an `<input type="time">`. */
export function toTimeInputValue(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Merge a calendar date with an optional wall-clock time.
 *
 * Times are stored exactly as typed (no timezone shifting): an exam entered as
 * 09:00 is stored as 09:00 and read back as 09:00, which is what a Nigerian
 * university registrar expects from a notice board.
 */
export function combineDateAndTime(
  date: Date,
  time: { hours: number; minutes: number } | null,
): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      time?.hours ?? 0,
      time?.minutes ?? 0,
    ),
  );
}

// ---------------------------------------------------------------------------
// Audience targets
// ---------------------------------------------------------------------------

export type TargetRef = { targetType: TargetType; targetId: string };

/**
 * Validate the audience selection for a scoped event.
 *
 * Level targets are checked against the LEVELS constant; faculty and department
 * targets are checked against the database so a crafted POST cannot attach an
 * event to a record that does not exist.
 */
export async function validateTargets(
  scope: EventScope,
  rawIds: string[],
): Promise<{ ok: true; targets: TargetRef[] } | { ok: false; errors: string[] }> {
  const unique = Array.from(new Set(rawIds.map((id) => id.trim()).filter(Boolean)));

  if (scope === "ALL") return { ok: true, targets: [] };

  if (unique.length === 0) {
    return {
      ok: false,
      errors: [
        `Choose at least one ${scope.toLowerCase()} for this audience, or set the audience back to "Whole university".`,
      ],
    };
  }

  if (scope === "LEVEL") {
    const levels = unique.map((id) => Number(id));
    const invalid = levels.filter(
      (level) => !(LEVELS as readonly number[]).includes(level),
    );
    if (invalid.length > 0) {
      return { ok: false, errors: [`Unsupported level: ${invalid.join(", ")}.`] };
    }
    return {
      ok: true,
      targets: levels.map((level) => ({
        targetType: "LEVEL" as const,
        targetId: String(level),
      })),
    };
  }

  if (scope === "FACULTY") {
    const found = await prisma.faculty.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      return { ok: false, errors: ["One or more selected faculties no longer exist."] };
    }
    return {
      ok: true,
      targets: unique.map((id) => ({ targetType: "FACULTY" as const, targetId: id })),
    };
  }

  const found = await prisma.department.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    return { ok: false, errors: ["One or more selected departments no longer exist."] };
  }
  return {
    ok: true,
    targets: unique.map((id) => ({ targetType: "DEPARTMENT" as const, targetId: id })),
  };
}

/** Human-readable labels for a set of targets, used in diffs and the UI. */
export async function describeTargets(targets: TargetRef[]): Promise<string[]> {
  const facultyIds = targets
    .filter((target) => target.targetType === "FACULTY")
    .map((target) => target.targetId);
  const departmentIds = targets
    .filter((target) => target.targetType === "DEPARTMENT")
    .map((target) => target.targetId);

  const [faculties, departments] = await Promise.all([
    facultyIds.length
      ? prisma.faculty.findMany({
          where: { id: { in: facultyIds } },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([] as { id: string; name: string; code: string }[]),
    departmentIds.length
      ? prisma.department.findMany({
          where: { id: { in: departmentIds } },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([] as { id: string; name: string; code: string }[]),
  ]);

  const facultyNames = new Map(
    faculties.map((faculty) => [faculty.id, `${faculty.name} (${faculty.code})`]),
  );
  const departmentNames = new Map(
    departments.map((department) => [
      department.id,
      `${department.name} (${department.code})`,
    ]),
  );

  return targets.map((target) =>
    target.targetType === "FACULTY"
      ? (facultyNames.get(target.targetId) ?? "Unknown faculty")
      : target.targetType === "DEPARTMENT"
        ? (departmentNames.get(target.targetId) ?? "Unknown department")
        : `${target.targetId} Level`,
  );
}

// ---------------------------------------------------------------------------
// Change history and audit
// ---------------------------------------------------------------------------

export type EventSnapshot = {
  title: string;
  description: string | null;
  categoryId: string;
  semesterId: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  status: string;
  visibility: string;
  scope: string;
  targets: string[];
};

/**
 * Snapshot of the fields that matter when a date moves. Stored as JSON so the
 * detail page can show "before �+' after" without a schema change.
 */
export function makeSnapshot(
  event: {
    title: string;
    description: string | null;
    categoryId: string;
    semesterId: string;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
    location: string | null;
    status: string;
    visibility: string;
    scope: string;
  },
  targetLabels: string[],
): EventSnapshot {
  return {
    title: event.title,
    description: event.description,
    categoryId: event.categoryId,
    semesterId: event.semesterId,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    allDay: event.allDay,
    location: event.location,
    status: event.status,
    visibility: event.visibility,
    scope: event.scope,
    targets: targetLabels,
  };
}

export function buildDiff(
  before: EventSnapshot | null,
  after: EventSnapshot | null,
): string {
  return JSON.stringify({ before, after });
}

export async function writeRevision(
  db: Db,
  input: {
    eventId: string;
    changedById: string | null;
    changeType: RevisionType;
    note?: string | null;
    before?: EventSnapshot | null;
    after?: EventSnapshot | null;
  },
): Promise<void> {
  await db.eventRevision.create({
    data: {
      eventId: input.eventId,
      changedById: input.changedById,
      changeType: input.changeType,
      note: input.note ?? null,
      diffJson: buildDiff(input.before ?? null, input.after ?? null),
    },
  });
}

export async function writeAudit(
  db: Db,
  input: {
    actorId: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    meta?: unknown;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metaJson: input.meta === undefined ? null : JSON.stringify(input.meta),
    },
  });
}

/** "Dates moved from 1 Jun 2026 �?" 12 Jun 2026 to 1 Jun 2026 �?" 19 Jun 2026." */
export function describeDateChange(
  before: EventSnapshot,
  after: EventSnapshot,
): string {
  const from = formatDateRange(new Date(before.startAt), new Date(before.endAt));
  const to = formatDateRange(new Date(after.startAt), new Date(after.endAt));
  return `Dates moved from ${from} to ${to}.`;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Everyone who should hear about a change to this event: the users matched by
 * its audience, narrowed to staff when the event is staff-only.
 */
export async function resolveAudienceUserIds(input: {
  scope: EventScope;
  targets: TargetRef[];
  visibility: EventVisibility;
}): Promise<string[]> {
  const base: Prisma.UserWhereInput = { isActive: true };
  if (input.visibility === "STAFF_ONLY") base.role = { in: ["STAFF", "ADMIN"] };

  let where: Prisma.UserWhereInput = base;

  if (input.scope === "FACULTY") {
    where = { ...base, facultyId: { in: input.targets.map((t) => t.targetId) } };
  } else if (input.scope === "DEPARTMENT") {
    where = { ...base, departmentId: { in: input.targets.map((t) => t.targetId) } };
  } else if (input.scope === "LEVEL") {
    where = { ...base, level: { in: input.targets.map((t) => Number(t.targetId)) } };
  }

  const users = await prisma.user.findMany({ where, select: { id: true } });
  return users.map((user) => user.id);
}

/** Raise an in-app notification for every user in the event's audience. */
export async function notifyAudience(
  db: Db,
  input: {
    eventId: string;
    title: string;
    body: string;
    type: string;
    scope: EventScope;
    targets: TargetRef[];
    visibility: EventVisibility;
  },
): Promise<number> {
  const userIds = await resolveAudienceUserIds({
    scope: input.scope,
    targets: input.targets,
    visibility: input.visibility,
  });

  for (const userId of userIds) {
    await db.notification.create({
      data: {
        userId,
        eventId: input.eventId,
        type: input.type,
        title: input.title,
        body: input.body,
      },
    });
  }

  return userIds.length;
}
