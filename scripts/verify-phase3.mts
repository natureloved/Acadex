/**
 * Phase 3 verification: the admin service layer, end to end.
 *
 * Run with:  npx tsx scripts/verify-phase3.mts
 *
 * This is a real regression test, not a demo. It drives the same service
 * functions the admin screens call, checks the database after every step, and
 * cleans up everything it created so `dev.db` is left exactly as it was found.
 * It exits non-zero if any check fails, which makes it usable in CI later.
 *
 * DATABASE_URL is set before the client is imported, because `lib/db.ts` builds
 * the Prisma client at module load.
 */
import { readFileSync } from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${message}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${message}`);
  }
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const DAY = 24 * 60 * 60 * 1000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

/** Marks everything this script creates so cleanup can find it again. */
const MARK = "PHASE3-VERIFY";

const { prisma } = await import("../lib/db");
const service = await import("../lib/services/events");
const sessionService = await import("../lib/services/sessions");
const categoryService = await import("../lib/services/categories");
const importService = await import("../lib/services/imports");
const csvParser = await import("../lib/services/csv");

const trackedEventIds: string[] = [];
const trackedUserIds: string[] = [];

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // Fixtures
  // -------------------------------------------------------------------------
  section("Fixtures");

  const admin = await prisma.user.findUnique({
    where: { email: "admin@acadex.lasu.edu.ng" },
    select: { id: true },
  });
  const student = await prisma.user.findUnique({
    where: { email: "student@acadex.lasu.edu.ng" },
    select: { id: true, facultyId: true },
  });
  const activeSession = await prisma.academicSession.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      semesters: {
        select: { id: true, type: true, startDate: true, endDate: true },
        orderBy: { startDate: "asc" },
      },
    },
  });
  const lectures = await prisma.eventCategory.findUnique({
    where: { slug: "lectures" },
    select: { id: true },
  });
  const science = await prisma.faculty.findUnique({
    where: { code: "SCI" },
    select: { id: true, name: true },
  });
  const arts = await prisma.faculty.findUnique({
    where: { code: "ART" },
    select: { id: true },
  });

  if (!admin || !student || !activeSession || !lectures || !science) {
    throw new Error(
      "Seed data missing or unexpected. Run `npm run db:reset` before this script.",
    );
  }

  const actor = { id: admin.id, role: "ADMIN" as const };
  const semester = activeSession.semesters[0];

  // Captured BEFORE this script creates anything, so the closing
  // "everything was restored" checks compare like with like.
  const baseline = {
    events: await prisma.calendarEvent.count(),
    revisions: await prisma.eventRevision.count(),
    users: await prisma.user.count(),
    notifications: await prisma.notification.count(),
    semesters: await prisma.semester.count(),
    categories: await prisma.eventCategory.count(),
  };

  // A student in a different faculty, to prove that targeting does not leak.
  const outsider = await prisma.user.upsert({
    where: { email: "phase3-outside@acadex.lasu.edu.ng" },
    update: {},
    create: {
      name: "Phase 3 Outsider",
      email: "phase3-outside@acadex.lasu.edu.ng",
      passwordHash: "$2a$12$notarealhashnotarealhashnotarealhashnotarealhashno",
      role: "STUDENT",
      facultyId: arts?.id ?? null,
      level: 200,
    },
    select: { id: true },
  });
  trackedUserIds.push(outsider.id);

  console.log(`  active session: ${activeSession.name}`);
  console.log(`  baseline events: ${baseline.events}, revisions: ${baseline.revisions}`);

  const baseInput = (overrides: Partial<Parameters<typeof service.createEvent>[1]> = {}) => ({
    title: `${MARK} Event`,
    description: "Created by scripts/verify-phase3.mts",
    categoryId: lectures.id,
    semesterId: semester.id,
    startDate: dateOnly(addDays(semester.startDate, 10)),
    endDate: dateOnly(addDays(semester.startDate, 14)),
    startTime: "",
    endTime: "",
    allDay: true,
    location: "Verification Hall",
    visibility: "PUBLIC",
    scope: "FACULTY",
    targetIds: [science.id],
    ...overrides,
  });

  // -------------------------------------------------------------------------
  section("1. Creating a draft");
  const created = await service.createEvent(actor, baseInput(), { publish: false });
  check(created.ok, "createEvent returns ok");
  if (!created.ok) throw new Error(`cannot continue: ${created.errors.join("; ")}`);

  const eventId = created.data.eventId;
  trackedEventIds.push(eventId);

  const draftRow = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { status: true, version: true, publishedAt: true, scope: true },
  });
  check(draftRow?.status === "DRAFT", "draft is stored as DRAFT");
  check(draftRow?.version === 1, "draft starts at version 1");
  check(draftRow?.publishedAt === null, "draft has no publishedAt");

  const targets = await prisma.eventTarget.count({ where: { eventId } });
  check(targets === 1, "audience target row written");

  check(
    (await prisma.eventRevision.count({ where: { eventId, changeType: "CREATED" } })) === 1,
    "CREATED revision written",
  );
  check(
    (await prisma.auditLog.count({ where: { entityId: eventId, action: "EVENT_CREATED" } })) === 1,
    "EVENT_CREATED audit row written",
  );
  check(
    (await prisma.calendarEvent.count({
      where: { id: eventId, status: "PUBLISHED", visibility: "PUBLIC" },
    })) === 0,
    "the public read query cannot see the draft",
  );

  // -------------------------------------------------------------------------
  section("2. Publishing");
  const published = await service.publishEvent(actor, eventId);
  check(published.ok, "publishEvent returns ok");

  const publishedRow = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { status: true, publishedAt: true },
  });
  check(publishedRow?.status === "PUBLISHED", "status is PUBLISHED");
  check(publishedRow?.publishedAt !== null, "publishedAt is set");
  check(
    (await prisma.calendarEvent.count({
      where: { id: eventId, status: "PUBLISHED", visibility: "PUBLIC" },
    })) === 1,
    "the public read query can now see it",
  );
  check(
    (await prisma.eventRevision.count({ where: { eventId, changeType: "PUBLISHED" } })) === 1,
    "PUBLISHED revision written",
  );

  // -------------------------------------------------------------------------
  section("3. Rescheduling (and who gets told)");
  const moved = await service.updateEvent(
    actor,
    eventId,
    baseInput({
      startDate: dateOnly(addDays(semester.startDate, 21)),
      endDate: dateOnly(addDays(semester.startDate, 25)),
    }),
    {},
  );
  check(moved.ok && moved.data.rescheduled, "updateEvent reports a reschedule");
  check(moved.ok && moved.data.version === 2, "version bumped to 2");

  const rescheduleRevision = await prisma.eventRevision.findFirst({
    where: { eventId, changeType: "RESCHEDULED" },
    select: { diffJson: true, note: true },
    orderBy: { changedAt: "desc" },
  });
  const diff = JSON.parse(rescheduleRevision?.diffJson ?? "{}") as {
    before?: { startAt?: string };
    after?: { startAt?: string };
  };
  check(
    Boolean(diff.before?.startAt) && Boolean(diff.after?.startAt),
    "revision stores before and after snapshots",
  );
  check(
    diff.before?.startAt !== diff.after?.startAt &&
      (diff.after?.startAt ?? "").startsWith(dateOnly(addDays(semester.startDate, 21))),
    "the stored snapshot shows the new dates",
  );
  check(Boolean(rescheduleRevision?.note), "revision carries a human note");

  const studentNotified = await prisma.notification.count({
    where: { userId: student.id, eventId, type: "EVENT_RESCHEDULED" },
  });
  check(studentNotified >= 1, "the Science student in the audience was notified");

  const outsiderNotified = await prisma.notification.count({
    where: { userId: outsider.id },
  });
  check(outsiderNotified === 0, "a student outside the audience was NOT notified");

  check(
    (await prisma.auditLog.count({ where: { entityId: eventId, action: "EVENT_RESCHEDULED" } })) === 1,
    "EVENT_RESCHEDULED audit row written",
  );

  // A text-only edit must not shout "rescheduled" at students.
  const renamed = await service.updateEvent(
    actor,
    eventId,
    baseInput({
      title: `${MARK} Event (renamed)`,
      startDate: dateOnly(addDays(semester.startDate, 21)),
      endDate: dateOnly(addDays(semester.startDate, 25)),
    }),
    {},
  );
  check(
    renamed.ok && !renamed.data.rescheduled && renamed.data.version === 2,
    "a text-only edit does not bump the revision number",
  );

  // -------------------------------------------------------------------------
  section("4. Cancelling");
  const cancelled = await service.cancelEvent(actor, eventId);
  check(cancelled.ok, "cancelEvent returns ok");
  check(cancelled.ok && cancelled.data.notified >= 1, "the audience was notified");
  check(
    (await prisma.calendarEvent.count({
      where: { id: eventId, status: "PUBLISHED" },
    })) === 0,
    "the public read query no longer returns it",
  );
  check(
    (await prisma.eventRevision.count({ where: { eventId, changeType: "CANCELLED" } })) === 1,
    "CANCELLED revision written",
  );
  check(
    (await prisma.notification.count({ where: { eventId, type: "EVENT_CANCELLED" } })) >= 1,
    "cancellation notification written",
  );

  const cancelAgain = await service.cancelEvent(actor, eventId);
  check(!cancelAgain.ok, "an event that is not published cannot be cancelled again");

  // -------------------------------------------------------------------------
  section("5. Restoring");
  const restored = await service.publishEvent(actor, eventId);
  check(restored.ok, "a cancelled event can be restored to published");
  check(
    (await prisma.calendarEvent.count({ where: { id: eventId, status: "PUBLISHED" } })) === 1,
    "it is back on the published calendar",
  );

  const deletePublished = await service.deleteDraftEvent(actor, eventId);
  check(!deletePublished.ok, "a published event cannot be deleted (cancel it instead)");

  // -------------------------------------------------------------------------
  section("6. Deleting drafts");
  const secondDraft = await service.createEvent(
    actor,
    baseInput({ title: `${MARK} Throwaway`, scope: "ALL", targetIds: [] }),
    { publish: false },
  );
  check(secondDraft.ok, "second draft created");
  const throwawayId = secondDraft.ok ? secondDraft.data.eventId : "";

  const deleted = await service.deleteDraftEvent(actor, throwawayId);
  check(deleted.ok, "deleteDraftEvent returns ok");
  check(
    (await prisma.calendarEvent.count({ where: { id: throwawayId } })) === 0,
    "the draft is gone",
  );
  check(
    (await prisma.eventRevision.count({ where: { eventId: throwawayId } })) === 0,
    "its revisions cascaded away",
  );
  check(
    (await prisma.auditLog.count({ where: { entityId: throwawayId, action: "EVENT_DELETED" } })) === 1,
    "the deletion is still recorded in the audit log",
  );

  // -------------------------------------------------------------------------
  section("7. Sessions and semesters");
  const madeSession = await sessionService.createSession(actor, {
    name: "2098/2099",
    startDate: "2098-09-01",
    endDate: "2099-07-31",
    isActive: false,
  });
  check(madeSession.ok, "createSession returns ok");
  const tempSessionId = madeSession.ok ? madeSession.data.sessionId : "";

  const badName = await sessionService.createSession(actor, {
    name: "2098/2100",
    startDate: "2098-09-01",
    endDate: "2099-07-31",
    isActive: false,
  });
  check(!badName.ok, "a non-consecutive session name is rejected");

  const duplicateName = await sessionService.createSession(actor, {
    name: "2098/2099",
    startDate: "2098-09-01",
    endDate: "2099-07-31",
    isActive: false,
  });
  check(!duplicateName.ok, "a duplicate session name is rejected");

  const firstSemester = await sessionService.createSemester(actor, {
    sessionId: tempSessionId,
    type: "FIRST",
    startDate: "2098-09-01",
    endDate: "2099-02-28",
  });
  const secondSemester = await sessionService.createSemester(actor, {
    sessionId: tempSessionId,
    type: "SECOND",
    startDate: "2099-03-01",
    endDate: "2099-07-31",
  });
  check(firstSemester.ok && secondSemester.ok, "two semesters created");

  const duplicateSemester = await sessionService.createSemester(actor, {
    sessionId: tempSessionId,
    type: "FIRST",
    startDate: "2098-09-01",
    endDate: "2099-02-28",
  });
  check(!duplicateSemester.ok, "a duplicate semester type is rejected");

  const activated = await sessionService.setActiveSession(actor, tempSessionId);
  check(activated.ok, "setActiveSession returns ok");
  check(
    (await prisma.academicSession.count({ where: { isActive: true } })) === 1 &&
      (await prisma.academicSession.findFirst({ where: { isActive: true }, select: { id: true } }))
        ?.id === tempSessionId,
    "exactly one session is active, and it is the new one",
  );

  const deleteActive = await sessionService.deleteSession(actor, tempSessionId);
  check(!deleteActive.ok, "the active session cannot be deleted");

  const backToOriginal = await sessionService.setActiveSession(actor, activeSession.id);
  check(backToOriginal.ok, "the original session is active again");

  const archivedWithEvents = await prisma.academicSession.findFirst({
    where: { name: "2025/2026" },
    select: { id: true },
  });
  if (archivedWithEvents) {
    const deleteUsed = await sessionService.deleteSession(actor, archivedWithEvents.id);
    check(!deleteUsed.ok, "a session that still contains events cannot be deleted");
  }

  const deleteEmpty = await sessionService.deleteSession(actor, tempSessionId);
  check(deleteEmpty.ok, "an empty, inactive session can be deleted");
  check(
    (await prisma.semester.count({ where: { sessionId: tempSessionId } })) === 0,
    "its semesters cascaded away",
  );
  check(
    (await prisma.academicSession.count({ where: { isActive: true } })) === 1,
    "still exactly one active session",
  );

  // -------------------------------------------------------------------------
  section("8. Categories");
  const madeCategory = await categoryService.createCategory(actor, {
    name: `${MARK} Category`,
    color: "#123456",
  });
  check(madeCategory.ok, "createCategory returns ok");

  const badColor = await categoryService.createCategory(actor, {
    name: `${MARK} Bad`,
    color: "red",
  });
  check(!badColor.ok, "an invalid colour is rejected");

  const deleteInUse = await categoryService.deleteCategory(actor, lectures.id);
  check(!deleteInUse.ok, "a category that is still used cannot be deleted");

  if (madeCategory.ok) {
    const deleteUnused = await categoryService.deleteCategory(
      actor,
      madeCategory.data.categoryId,
    );
    check(deleteUnused.ok, "an unused category can be deleted");
  }

  // -------------------------------------------------------------------------
  section("9. CSV parsing and import");
  const tricky = csvParser.parseCsv(
    'title,description\n"Ojo, Lagos","Line one\nLine two"\n"Say ""hi""",plain\n',
  );
  check(tricky.rows.length === 2, "two rows parsed");
  check(
    tricky.rows[0].values[0] === "Ojo, Lagos",
    "a quoted comma stays inside the field",
  );
  check(
    tricky.rows[0].values[1] === "Line one\nLine two",
    "a quoted newline stays inside the field",
  );
  check(tricky.rows[1].values[0] === 'Say "hi"', "escaped quotes are unescaped");

  const header = "title,category,semester,start,end,location,description";
  const goodRows = [
    `${MARK} CSV One,Lectures,FIRST,2097-01-05,2097-01-09,"Ojo, Lagos",First row`,
    `${MARK} CSV Two,Examinations,FIRST,2097-02-02,2097-02-06,Halls,Second row`,
    `${MARK} CSV Three,Registration,FIRST,2097-03-03,2097-03-07,Portal,Third row`,
  ];
  const badRows = [
    `${MARK} CSV Bad Date,Lectures,FIRST,05/01/2097,2097-01-09,Halls,Unreadable start date`,
    `${MARK} CSV Bad Category,Nonsense,FIRST,2097-04-01,2097-04-05,Halls,Unknown category`,
  ];
  const mixedCsv = [header, ...goodRows, ...badRows].join("\n");

  const preview = await importService.previewImport(activeSession.id, mixedCsv);
  check(preview.ok, "previewImport returns ok");
  check(preview.ok && preview.data.valid.length === 3, "three rows passed validation");
  check(preview.ok && preview.data.invalid.length === 2, "two rows were rejected");
  check(
    preview.ok && preview.data.invalid.every((issue) => issue.reason.length > 0),
    "each rejection carries a reason",
  );

  const emptyPreview = await importService.previewImport(activeSession.id, "");
  check(!emptyPreview.ok, "an empty upload is rejected");

  const badHeader = await importService.previewImport(
    activeSession.id,
    "a,b,c\n1,2,3",
  );
  check(!badHeader.ok, "a wrong header row is rejected");

  const beforeImport = await prisma.calendarEvent.count();
  const imported = await importService.importEvents(actor, activeSession.id, mixedCsv, false);
  check(imported.ok, "importEvents returns ok");
  check(imported.ok && imported.data.imported === 3, "exactly three events imported");
  check(imported.ok && imported.data.skipped === 2, "the two bad rows were skipped");
  check(
    (await prisma.calendarEvent.count()) === beforeImport + 3,
    "the event count grew by three",
  );
  check(
    (await prisma.calendarEvent.count({
      where: { title: { startsWith: `${MARK} CSV` }, status: "DRAFT" },
    })) === 3,
    "imported events arrive as drafts",
  );
  check(
    (await prisma.calendarEvent.count({
      where: { title: { startsWith: `${MARK} CSV` }, status: "PUBLISHED" },
    })) === 0,
    "imported drafts are not published to the calendar",
  );
  check(
    (await prisma.auditLog.count({ where: { action: "EVENTS_IMPORTED" } })) >= 1,
    "the import is recorded in the audit log",
  );

  const reImport = await importService.importEvents(actor, activeSession.id, mixedCsv, false);
  check(
    !reImport.ok,
    "re-importing the same file adds nothing (the rows already exist)",
  );

  // -------------------------------------------------------------------------
  section("10. Cleanup and final state");
  for (const csvEvent of await prisma.calendarEvent.findMany({
    where: { title: { startsWith: `${MARK} CSV` } },
    select: { id: true },
  })) {
    trackedEventIds.push(csvEvent.id);
  }

  await prisma.notification.deleteMany({ where: { title: { contains: MARK } } });
  await prisma.calendarEvent.deleteMany({ where: { id: { in: trackedEventIds } } });
  await prisma.user.deleteMany({ where: { id: { in: trackedUserIds } } });

  const after = {
    events: await prisma.calendarEvent.count(),
    revisions: await prisma.eventRevision.count(),
    users: await prisma.user.count(),
    notifications: await prisma.notification.count(),
    semesters: await prisma.semester.count(),
    categories: await prisma.eventCategory.count(),
  };

  check(after.events === baseline.events, `event count restored (${after.events})`);
  check(after.revisions === baseline.revisions, `revision count restored (${after.revisions})`);
  check(after.users === baseline.users, `user count restored (${after.users})`);
  check(after.notifications === baseline.notifications, "notifications restored");
  check(after.semesters === baseline.semesters, "semester count restored");
  check(after.categories === baseline.categories, "category count restored");
  check(
    (await prisma.academicSession.count({ where: { isActive: true } })) === 1,
    "exactly one active session remains",
  );
  check(
    (await prisma.academicSession.findFirst({ where: { isActive: true }, select: { name: true } }))
      ?.name === activeSession.name,
    `the active session is still ${activeSession.name}`,
  );

  const auditRows = await prisma.auditLog.count();
  console.log(
    `  note: ${auditRows} audit rows remain. The audit log is append-only by design;` +
      " this script does not roll it back.",
  );

  const template = readFileSync("public/csv-import-template.csv", "utf8");
  check(template.startsWith(header), "the shipped CSV template header is valid");
}

try {
  await main();
} catch (error) {
  failed += 1;
  console.error("\nUNCAUGHT ERROR:", error);
} finally {
  await prisma.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
