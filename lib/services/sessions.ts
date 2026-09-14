/**
 * Session and semester service.
 *
 * A session (e.g. "2026/2027") owns two semesters; events hang off a semester.
 * The rule that only one session may be active is enforced here, inside a
 * transaction, rather than in the UI.
 */
import { prisma } from "../db";
import { SEMESTER_TYPES } from "../constants";
import {
  fail,
  parseDateOnly,
  succeed,
  writeAudit,
  type Actor,
  type ServiceResult,
} from "./shared";

const SESSION_NAME = /^(\d{4})\/(\d{4})$/;

export type SessionInput = {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type SemesterInput = {
  sessionId: string;
  type: string;
  startDate: string;
  endDate: string;
};

export type AdminSession = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  eventCount: number;
  semesters: {
    id: string;
    type: string;
    startDate: Date;
    endDate: Date;
    eventCount: number;
  }[];
};

export async function listSessionsForAdmin(): Promise<AdminSession[]> {
  const sessions = await prisma.academicSession.findMany({
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
      semesters: {
        select: {
          id: true,
          type: true,
          startDate: true,
          endDate: true,
          _count: { select: { events: true } },
        },
        orderBy: { startDate: "asc" },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "desc" }],
  });

  return sessions.map((session) => ({
    id: session.id,
    name: session.name,
    startDate: session.startDate,
    endDate: session.endDate,
    isActive: session.isActive,
    eventCount: session.semesters.reduce(
      (total, semester) => total + semester._count.events,
      0,
    ),
    semesters: session.semesters.map((semester) => ({
      id: semester.id,
      type: semester.type,
      startDate: semester.startDate,
      endDate: semester.endDate,
      eventCount: semester._count.events,
    })),
  }));
}

/** Validate a session name and its date window. */
function validateSessionInput(
  input: SessionInput,
): { ok: true; name: string; startDate: Date; endDate: Date } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const name = input.name.trim();

  const match = SESSION_NAME.exec(name);
  if (!match) {
    errors.push('Name the session like "2026/2027".');
  } else if (Number(match[2]) !== Number(match[1]) + 1) {
    errors.push("The session years must run consecutively, e.g. 2026/2027.");
  }

  const startDate = parseDateOnly(input.startDate ?? "");
  const endDate = parseDateOnly(input.endDate ?? "");
  if (!startDate) errors.push("Enter a valid session start date.");
  if (!endDate) errors.push("Enter a valid session end date.");

  if (errors.length > 0 || !startDate || !endDate) return { ok: false, errors };

  if (endDate.getTime() <= startDate.getTime()) {
    errors.push("The session must end after it starts.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, name, startDate, endDate };
}

export async function createSession(
  actor: Actor,
  input: SessionInput,
): Promise<ServiceResult<{ sessionId: string }>> {
  const validated = validateSessionInput(input);
  if (!validated.ok) return fail(...validated.errors);

  const clash = await prisma.academicSession.findUnique({
    where: { name: validated.name },
    select: { id: true },
  });
  if (clash) return fail(`A session named ${validated.name} already exists.`);

  const sessionId = await prisma.$transaction(async (tx) => {
    const created = await tx.academicSession.create({
      data: {
        name: validated.name,
        startDate: validated.startDate,
        endDate: validated.endDate,
        isActive: input.isActive,
      },
      select: { id: true },
    });

    // Only one session may be active at a time.
    if (input.isActive) {
      await tx.academicSession.updateMany({
        where: { id: { not: created.id } },
        data: { isActive: false },
      });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: "SESSION_CREATED",
      entity: "AcademicSession",
      entityId: created.id,
      meta: { name: validated.name, isActive: input.isActive },
    });

    return created.id;
  });

  return succeed({ sessionId });
}

export async function updateSession(
  actor: Actor,
  sessionId: string,
  input: SessionInput,
): Promise<ServiceResult<{ sessionId: string }>> {
  const existing = await prisma.academicSession.findUnique({
    where: { id: sessionId },
    select: { id: true, name: true, isActive: true },
  });
  if (!existing) return fail("That session no longer exists.");

  const validated = validateSessionInput(input);
  if (!validated.ok) return fail(...validated.errors);

  const clash = await prisma.academicSession.findFirst({
    where: { name: validated.name, id: { not: sessionId } },
    select: { id: true },
  });
  if (clash) return fail(`A session named ${validated.name} already exists.`);

  // Shrinking a session so that it no longer contains its own semesters (or
  // events) would silently orphan the calendar, so widen-only is enforced.
  const outOfRange = await prisma.semester.findFirst({
    where: {
      sessionId,
      OR: [
        { startDate: { lt: validated.startDate } },
        { endDate: { gt: validated.endDate } },
      ],
    },
    select: { id: true, type: true },
  });
  if (outOfRange) {
    return fail(
      "The new dates would cut off one of this session's semesters. Adjust the semester dates first.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.academicSession.update({
      where: { id: sessionId },
      data: {
        name: validated.name,
        startDate: validated.startDate,
        endDate: validated.endDate,
        isActive: input.isActive,
      },
    });

    if (input.isActive) {
      await tx.academicSession.updateMany({
        where: { id: { not: sessionId } },
        data: { isActive: false },
      });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: "SESSION_UPDATED",
      entity: "AcademicSession",
      entityId: sessionId,
      meta: { from: existing.name, to: validated.name, isActive: input.isActive },
    });
  });

  return succeed({ sessionId });
}

/** Flag a session as the current one, deactivating every other session. */
export async function setActiveSession(
  actor: Actor,
  sessionId: string,
): Promise<ServiceResult<{ sessionId: string }>> {
  const existing = await prisma.academicSession.findUnique({
    where: { id: sessionId },
    select: { id: true, name: true },
  });
  if (!existing) return fail("That session no longer exists.");

  await prisma.$transaction(async (tx) => {
    await tx.academicSession.updateMany({ data: { isActive: false } });
    await tx.academicSession.update({ where: { id: sessionId }, data: { isActive: true } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "SESSION_ACTIVATED",
      entity: "AcademicSession",
      entityId: sessionId,
      meta: { name: existing.name },
    });
  });

  return succeed({ sessionId });
}

export async function deleteSession(
  actor: Actor,
  sessionId: string,
): Promise<ServiceResult<{ sessionId: string }>> {
  const existing = await prisma.academicSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      name: true,
      isActive: true,
      semesters: { select: { id: true, _count: { select: { events: true } } } },
    },
  });

  if (!existing) return fail("That session no longer exists.");
  if (existing.isActive) {
    return fail("The active session cannot be deleted. Make another session active first.");
  }

  const eventCount = existing.semesters.reduce(
    (total, semester) => total + semester._count.events,
    0,
  );
  if (eventCount > 0) {
    return fail(
      `This session still has ${eventCount} event${eventCount === 1 ? "" : "s"}. Move or delete them first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.academicSession.delete({ where: { id: sessionId } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "SESSION_DELETED",
      entity: "AcademicSession",
      entityId: sessionId,
      meta: { name: existing.name },
    });
  });

  return succeed({ sessionId });
}

export async function createSemester(
  actor: Actor,
  input: SemesterInput,
): Promise<ServiceResult<{ semesterId: string }>> {
  if (!(SEMESTER_TYPES as readonly string[]).includes(input.type)) {
    return fail("Choose either the first or the second semester.");
  }

  const session = await prisma.academicSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!session) return fail("That session no longer exists.");

  const startDate = parseDateOnly(input.startDate ?? "");
  const endDate = parseDateOnly(input.endDate ?? "");
  const errors: string[] = [];
  if (!startDate) errors.push("Enter a valid semester start date.");
  if (!endDate) errors.push("Enter a valid semester end date.");
  if (errors.length > 0 || !startDate || !endDate) return fail(...errors);

  if (endDate.getTime() <= startDate.getTime()) {
    errors.push("The semester must end after it starts.");
  }
  if (
    startDate.getTime() < session.startDate.getTime() ||
    endDate.getTime() > session.endDate.getTime()
  ) {
    errors.push(`${session.name} runs to a different window than those dates.`);
  }
  if (errors.length > 0) return fail(...errors);

  const clash = await prisma.semester.findFirst({
    where: { sessionId: session.id, type: input.type },
    select: { id: true },
  });
  if (clash) {
    return fail(
      `The ${input.type.toLowerCase()} semester already exists for ${session.name}.`,
    );
  }

  const semesterId = await prisma.$transaction(async (tx) => {
    const created = await tx.semester.create({
      data: {
        sessionId: session.id,
        type: input.type,
        startDate,
        endDate,
      },
      select: { id: true },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "SEMESTER_CREATED",
      entity: "Semester",
      entityId: created.id,
      meta: { session: session.name, type: input.type },
    });

    return created.id;
  });

  return succeed({ semesterId });
}

export async function updateSemester(
  actor: Actor,
  semesterId: string,
  input: SemesterInput,
): Promise<ServiceResult<{ semesterId: string }>> {
  const existing = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: {
      id: true,
      type: true,
      session: { select: { id: true, name: true, startDate: true, endDate: true } },
    },
  });
  if (!existing) return fail("That semester no longer exists.");

  const startDate = parseDateOnly(input.startDate ?? "");
  const endDate = parseDateOnly(input.endDate ?? "");
  const errors: string[] = [];
  if (!startDate) errors.push("Enter a valid semester start date.");
  if (!endDate) errors.push("Enter a valid semester end date.");
  if (errors.length > 0 || !startDate || !endDate) return fail(...errors);

  if (endDate.getTime() <= startDate.getTime()) {
    errors.push("The semester must end after it starts.");
  }
  if (
    startDate.getTime() < existing.session.startDate.getTime() ||
    endDate.getTime() > existing.session.endDate.getTime()
  ) {
    errors.push(`${existing.session.name} runs to a different window than those dates.`);
  }
  if (errors.length > 0) return fail(...errors);

  await prisma.$transaction(async (tx) => {
    await tx.semester.update({
      where: { id: semesterId },
      data: { startDate, endDate },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "SEMESTER_UPDATED",
      entity: "Semester",
      entityId: semesterId,
      meta: {
        session: existing.session.name,
        type: existing.type,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  });

  return succeed({ semesterId });
}

