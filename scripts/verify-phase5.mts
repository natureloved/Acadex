/**
 * Phase 5 verification: the notification centre and the reminder job.
 *
 * Run with:  npx tsx scripts/verify-phase5.mts        (with `npm run dev` running)
 *
 * `BASE_URL` picks the server. In this workspace the Acadex dev server listens on
 * http://localhost:3001 because another project holds 3000, so run it as
 *
 *   BASE_URL=http://localhost:3001 npx tsx scripts/verify-phase5.mts
 *
 * Three parts, matching the three parts of the feature:
 *
 *  1. The service, driven directly: create (and refuse to duplicate), list,
 * count, mark one read, mark all read including that one account can never
 *     touch another account's notices.
 *  2. The reminder job, over temporary events created exactly seven days and one
 *     day out. It asserts who was told, what the notices say, that a second run
 *     creates nothing, and that a department-scoped event reaches only that
 *     department while a staff-only event reaches no student.
 *  3. The HTTP surface: the redirect for an anonymous visitor, the rendered
 *     centre, the header's unread badge against the database, a mark-as-read POST
 *     (driven the way a browser with JavaScript disabled would, by posting the
 *     form's own `$ACTION_ID_*` field), and the fail-closed reminder endpoint.
 *
 * Everything it creates, it removes again notifications, events, targets and
 * audit rows and it restores every `readAt` it flipped. The closing section
 * compares counts against a baseline captured before the first write.
 *
 * Exits non-zero if any check fails.
 */
import { readFileSync } from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

// tsx does not load .env, so read the secrets the same way the app does.
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** Prefix on every row this script creates, so leftovers are obvious. */
const MARK = "P5-FIXTURE";

const ADMIN_EMAIL = "admin@acadex.lasu.edu.ng";
const STAFF_EMAIL = "staff@acadex.lasu.edu.ng";
const STUDENT_EMAIL = "student@acadex.lasu.edu.ng";

/** Seeded notices, used to prove one account cannot read another's. */
const STAFF_NOTICE_TITLE = "Examination window extended";
const STUDENT_NOTICE_TITLE = "Second Semester Examinations moved";

let passed = 0;
let failed = 0;
let skippedChecks = 0;

function check(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${message}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${message}`);
  }
}

/** For a check that genuinely cannot run here. Never silent, never a pass. */
function skip(message: string): void {
  skippedChecks += 1;
  console.log(`  SKIP  ${message}`);
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function report(message: string): void {
  console.log(`  ..    ${message}`);
}

const { prisma } = await import("../lib/db");
const { signSession, SESSION_COOKIE_NAME } = await import("../lib/session");
const { formatDateRange, formatRelativeDays } = await import("../lib/format");
const notifications = await import("../lib/services/notifications");

// ---------------------------------------------------------------------------
// Date helpers the job's rule is a UTC calendar-day rule, so the fixtures and
// the expectations are built the same way.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * MS_PER_DAY);
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function get(path: string, cookie?: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });

  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    contentType: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}

/**
 * Post one of the page's own forms, exactly as a no-JS browser would: the action
 * id and the field values both come out of the rendered HTML.
 */
async function postForm(
  path: string,
  cookie: string,
  actionId: string,
  fields: Record<string, string> = {},
) {
  const body = new FormData();
  body.append(`$ACTION_ID_${actionId}`, "");
  for (const [key, value] of Object.entries(fields)) body.append(key, value);

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie },
    body,
    redirect: "manual",
  });

  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    body: await response.text(),
  };
}

async function postJson(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    redirect: "manual",
  });

  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null;
  }

  return { status: response.status, json, text };
}

const formsIn = (html: string) => html.match(/<form[\s\S]*?<\/form>/g) ?? [];
const actionIdIn = (form: string) => /\$ACTION_ID_([A-Za-z0-9_-]+)/.exec(form)?.[1] ?? "";

/**
 * The unread number the header renders, or null when it renders no badge at all.
 *
 * The badge is found the way a reader finds it inside the "Notifications" link
 * and tags are stripped first so the `aria-label` cannot be mistaken for the
 * visible count.
 */
function headerUnreadBadge(html: string): number | null {
  const anchor = /<a[^>]*href="\/notifications"[^>]*>([\s\S]*?)<\/a>/.exec(html);
  if (!anchor) return null;

  const digits = anchor[1].replace(/<[^>]*>/g, "").match(/\d+/g);
  return digits ? Number(digits.join("")) : null;
}

async function mintCookie(user: { id: string; name: string; email: string; role: string }) {
  const token = await signSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role === "ADMIN" || user.role === "STAFF" ? user.role : "STUDENT",
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = new Date();
  const runAt = new Date(startedAt.getTime());
  const today = utcDayStart(runAt);

  // --- People -------------------------------------------------------------
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  const staff = await prisma.user.findUniqueOrThrow({ where: { email: STAFF_EMAIL } });
  const student = await prisma.user.findUniqueOrThrow({ where: { email: STUDENT_EMAIL } });

  const activeUsers = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, role: true, departmentId: true },
  });

  const csc = await prisma.department.findUniqueOrThrow({ where: { code: "CSC" } });
  const category = await prisma.eventCategory.findFirstOrThrow({ orderBy: { slug: "asc" } });
  const activeSession = await prisma.academicSession.findFirstOrThrow({
    where: { isActive: true },
    include: { semesters: { orderBy: { startDate: "asc" } } },
  });
  const semesterId = activeSession.semesters[0].id;

  // The audience expectations are computed from the database, not from the
  // service under test: this is an independent statement of the targeting rule.
  const expectedAllPublic = new Set(activeUsers.map((user) => user.id));
  const expectedDepartment = new Set(
    activeUsers.filter((user) => user.departmentId === csc.id).map((user) => user.id),
  );
  const expectedStaffOnly = new Set(
    activeUsers
      .filter((user) => user.role === "ADMIN" || user.role === "STAFF")
      .map((user) => user.id),
  );
  const studentIds = new Set(
    activeUsers.filter((user) => user.role === "STUDENT").map((user) => user.id),
  );

  // --- Fixtures -----------------------------------------------------------
  const fixtureEventIds: string[] = [];
  const fixtureNotificationIds: string[] = [];

  async function createFixtureEvent(input: {
    label: string;
    startAt: Date;
    endAt?: Date;
    status?: "DRAFT" | "PUBLISHED" | "CANCELLED";
    visibility?: "PUBLIC" | "STAFF_ONLY";
    scope?: "ALL" | "DEPARTMENT";
    location?: string | null;
    departmentIds?: string[];
  }): Promise<string> {
    const created = await prisma.calendarEvent.create({
      data: {
        title: `${MARK} ${input.label}`,
        description: "Created by scripts/verify-phase5.mts, which removes it again.",
        categoryId: category.id,
        semesterId,
        startAt: input.startAt,
        endAt: input.endAt ?? input.startAt,
        location: input.location ?? null,
        status: input.status ?? "PUBLISHED",
        visibility: input.visibility ?? "PUBLIC",
        scope: input.scope ?? "ALL",
        createdById: admin.id,
        publishedAt: (input.status ?? "PUBLISHED") === "PUBLISHED" ? startedAt : null,
        targets: input.departmentIds
          ? {
              create: input.departmentIds.map((id) => ({
                targetType: "DEPARTMENT",
                targetId: id,
              })),
            }
          : undefined,
      },
      select: { id: true },
    });

    fixtureEventIds.push(created.id);
    return created.id;
  }

  async function createFixtureNotification(input: {
    userId: string;
    eventId?: string | null;
    type: string;
    title: string;
    body?: string;
  }): Promise<string> {
    const created = await prisma.notification.create({
      data: {
        userId: input.userId,
        eventId: input.eventId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? "Created by scripts/verify-phase5.mts, which removes it again.",
      },
      select: { id: true },
    });

    fixtureNotificationIds.push(created.id);
    return created.id;
  }

  /** Put the seeded notices' read flags back the way they were found. */
  async function restoreReadFlags(): Promise<void> {
    for (const [id, readAt] of baselineReadAt) {
      await prisma.notification.update({ where: { id }, data: { readAt } });
    }
  }

  // =========================================================================
  section("1. Notification kinds");
  // =========================================================================

  check(
    notifications.REMINDER_HORIZONS.length === 2 &&
      notifications.REMINDER_HORIZONS.some((h) => h.days === 7 && h.type === "REMINDER_T7") &&
      notifications.REMINDER_HORIZONS.some((h) => h.days === 1 && h.type === "REMINDER_T1"),
    "the job has exactly the two horizons the brief asks for: 7 days and 1 day",
  );

  // =========================================================================
  section("2. createNotification and its refusal to duplicate");
  // =========================================================================

  // A dedicated event, a month out, so the reminder job never looks at it.
  const directEventId = await createFixtureEvent({
    label: "Direct create",
    startAt: addDays(today, 30),
  });

  const first = await notifications.createNotification({
    userId: student.id,
    eventId: directEventId,
    type: "REMINDER_T7",
    title: `${MARK} first`,
    body: "The first notice for this event.",
  });
  check(first.created && first.notificationId !== null, "a new notice is created");
  check(first.skipped === null, "a created notice reports no skip reason");

  const duplicate = await notifications.createNotification({
    userId: student.id,
    eventId: directEventId,
    type: "REMINDER_T7",
    title: `${MARK} duplicate`,
    body: "This one must never be written.",
  });
  check(
    !duplicate.created && duplicate.skipped === "DUPLICATE",
    "the same user + event + type is skipped",
  );
  check(
    duplicate.notificationId === first.notificationId,
    "the skip reports the notice that already exists, not a new one",
  );
  check(
    (await prisma.notification.count({
      where: { userId: student.id, eventId: directEventId, type: "REMINDER_T7" },
    })) === 1,
    "exactly one row exists for that user + event + type",
  );

  const otherType = await notifications.createNotification({
    userId: student.id,
    eventId: directEventId,
    type: "REMINDER_T1",
    title: `${MARK} a different horizon`,
    body: "A different type is not a duplicate.",
  });
  check(otherType.created, "a different type for the same event is NOT treated as a duplicate");

  const otherUser = await notifications.createNotification({
    userId: staff.id,
    eventId: directEventId,
    type: "REMINDER_T7",
    title: `${MARK} another person`,
    body: "The dedupe key includes the user.",
  });
  check(
    otherUser.created,
    "a different user for the same event and type is NOT treated as a duplicate",
  );

  const standaloneA = await notifications.createNotification({
    userId: student.id,
    type: "REMINDER",
    title: `${MARK} standalone`,
    body: "No event, so there is nothing to compare against.",
  });
  const standaloneB = await notifications.createNotification({
    userId: student.id,
    type: "REMINDER",
    title: `${MARK} standalone again`,
    body: "Still no event, so still no dedupe.",
  });
  check(
    standaloneA.created && standaloneB.created,
    "notices with no event are always written there is nothing to dedupe against",
  );

  for (const outcome of [first, otherType, otherUser, standaloneA, standaloneB]) {
    if (outcome.notificationId) fixtureNotificationIds.push(outcome.notificationId);
  }

  // =========================================================================
  section("3. The notification centre's reads");
  // =========================================================================

  const studentUnread = await notifications.unreadCount(student.id);
  const studentUnreadOnly = await notifications.listNotifications(student.id, { unreadOnly: true });
  const studentAll = await notifications.listNotifications(student.id);

  check(
    studentUnreadOnly.length > 0 && studentUnreadOnly.every((item) => item.readAt === null),
    `unreadOnly returns only unread notices (${studentUnreadOnly.length} of them)`,
  );
  check(
    studentUnreadOnly.length === studentUnread,
    "unreadCount agrees with the length of the unread list",
  );
  check(
    studentAll.length >= studentUnreadOnly.length,
    `the unfiltered list is at least as long as the unread one (${studentAll.length} >= ${studentUnreadOnly.length})`,
  );
  check(
    studentAll.some((item) => item.id === first.notificationId) &&
      studentAll.some((item) => item.id === standaloneA.notificationId),
    "the list contains the notices raised for this user",
  );
  check(
    !studentAll.some((item) => item.id === otherUser.notificationId),
    "…and NOT the notice raised for somebody else",
  );
  check(
    studentAll.every((item, index) =>
      index === 0 ? true : studentAll[index - 1].createdAt.getTime() >= item.createdAt.getTime(),
    ),
    "notices come back newest first",
  );
  check(
    studentAll.every((item) => !("userId" in item)),
    "the list projects only the fields the page needs (no stray user id)",
  );
  check(
    (await notifications.listNotifications(student.id, { limit: 2 })).length === 2,
    "limit is honoured",
  );
  check(
    (await notifications.listNotifications(student.id, { limit: 5000 })).length <=
      notifications.NOTIFICATION_PAGE_LIMIT,
    `an absurd limit is clamped to the page limit (${notifications.NOTIFICATION_PAGE_LIMIT})`,
  );
  check(
    (await notifications.listNotifications(student.id, { limit: 0 })).length >= 1,
    "a limit of zero is clamped up to one rather than returning nothing",
  );

  const withEvent = studentAll.find((item) => item.id === first.notificationId);
  check(
    withEvent?.event?.id === directEventId && withEvent.event.title.startsWith(MARK),
    "a notice about an event carries that event's id and title, for linking",
  );
  check(
    studentAll.find((item) => item.id === standaloneA.notificationId)?.event === null,
    "a notice with no event links nowhere rather than breaking the page",
  );

  // =========================================================================
  section("4. Marking read one account cannot touch another's");
  // =========================================================================

  const staffUnreadBefore = await notifications.unreadCount(staff.id);

  const stolen = first.notificationId
    ? await notifications.markRead(staff.id, first.notificationId)
    : { changed: false, marked: 0 };
  check(!stolen.changed && stolen.marked === 0, "another user's markRead changes nothing");

  const stillUnread = first.notificationId
    ? await prisma.notification.findUniqueOrThrow({
        where: { id: first.notificationId },
        select: { readAt: true, userId: true },
      })
    : null;
  check(
    stillUnread?.readAt === null && stillUnread.userId === student.id,
    "the student's notice is still unread and still theirs after that attempt",
  );
  check(
    (await notifications.unreadCount(staff.id)) === staffUnreadBefore,
    "…and the other account's unread count never moved",
  );

  const marked = first.notificationId
    ? await notifications.markRead(student.id, first.notificationId)
    : { changed: false, marked: 0 };
  check(marked.changed && marked.marked === 1, "the owner's markRead flips exactly one row");

  const markedAgain = first.notificationId
    ? await notifications.markRead(student.id, first.notificationId)
    : { changed: false, marked: 0 };
  check(
    !markedAgain.changed && markedAgain.marked === 0,
    "marking the same notice twice reports no further change",
  );
  check(
    (await notifications.unreadCount(student.id)) === studentUnread - 1,
    "the unread count drops by one",
  );

  const markedAll = await notifications.markAllRead(student.id);
  check(
    markedAll.changed && markedAll.marked === studentUnread - 1,
    `markAllRead flips the remaining ${markedAll.marked}`,
  );
  check((await notifications.unreadCount(student.id)) === 0, "the student now has nothing unread");

  const markedAllAgain = await notifications.markAllRead(student.id);
  check(
    !markedAllAgain.changed && markedAllAgain.marked === 0,
    "markAllRead with nothing left to do reports no change",
  );
  check(
    (await notifications.unreadCount(staff.id)) === staffUnreadBefore,
    "markAllRead did not reach the other account's notices",
  );

  // The HTTP half of this script needs unread notices to work with, so put the
  // seeded read flags back now that the marking behaviour is proven.
  await restoreReadFlags();
  check(
    (await notifications.unreadCount(student.id)) === baselineStudentUnread,
    `the student's seeded unread state is back for the HTTP checks (${baselineStudentUnread} unread)`,
  );

  // =========================================================================
  section("5. The reminder job who gets told");
  // =========================================================================

  const t7EventId = await createFixtureEvent({
    label: "Seven days out",
    startAt: addDays(today, 7),
    endAt: addDays(today, 9),
    location: `${MARK} Hall`,
  });
  const t1EventId = await createFixtureEvent({ label: "Tomorrow", startAt: addDays(today, 1) });
  const departmentEventId = await createFixtureEvent({
    label: "Computer Science only",
    startAt: addDays(today, 7),
    scope: "DEPARTMENT",
    departmentIds: [csc.id],
  });
  const staffOnlyEventId = await createFixtureEvent({
    label: "Staff only",
    startAt: addDays(today, 1),
    visibility: "STAFF_ONLY",
  });

  // Three events that must be ignored, one per rule the job has to respect.
  const draftEventId = await createFixtureEvent({
    label: "Draft, seven days out",
    startAt: addDays(today, 7),
    status: "DRAFT",
  });
  const cancelledEventId = await createFixtureEvent({
    label: "Cancelled, tomorrow",
    startAt: addDays(today, 1),
    status: "CANCELLED",
  });
  const startedEventId = await createFixtureEvent({
    label: "Already started today",
    startAt: today,
  });

  const dueEventIds = [t7EventId, t1EventId, departmentEventId, staffOnlyEventId];

  check(
    expectedDepartment.size >= 1 && expectedDepartment.size < expectedAllPublic.size,
    `the Computer Science audience is a strict subset of everyone (${expectedDepartment.size} of ${expectedAllPublic.size})`,
  );
  check(
    !expectedDepartment.has(admin.id),
    "the administrator has no department, so is outside a department-scoped audience",
  );
  check(
    expectedDepartment.size < expectedAllPublic.size - 1,
    "…and the exclusion is not just the administrator: someone with a different department is outside it too",
  );
  check(
    ![...expectedStaffOnly].some((id) => studentIds.has(id)),
    "the staff-only audience contains no student at all",
  );

  // Seeded events that happen to fall on a horizon today: counted so the
  // expectations stay exact on any date, not just the seeded one.
  const seededDueEvents = await prisma.calendarEvent.count({
    where: {
      status: "PUBLISHED",
      id: { notIn: fixtureEventIds },
      startAt: { in: [addDays(today, 1), addDays(today, 7)] },
    },
  });

  const notificationsBefore = await prisma.notification.count();

  const firstRun = await notifications.generateDueReminders({ now: runAt });

  const fixtureNotices = await prisma.notification.findMany({
    where: { eventId: { in: fixtureEventIds } },
    select: { id: true, eventId: true, type: true, userId: true, title: true, body: true },
  });

  for (const notice of fixtureNotices) fixtureNotificationIds.push(notice.id);

  const recipientsOf = (eventId: string, type: string) =>
    new Set(
      fixtureNotices
        .filter((notice) => notice.eventId === eventId && notice.type === type)
        .map((notice) => notice.userId),
    );

  const sameSet = (actual: Set<string>, expected: Set<string>) =>
    actual.size === expected.size && [...actual].every((id) => expected.has(id));

  check(
    sameSet(recipientsOf(t7EventId, "REMINDER_T7"), expectedAllPublic),
    `the whole-university event reminded everyone active (${expectedAllPublic.size} people)`,
  );
  check(
    sameSet(recipientsOf(t1EventId, "REMINDER_T1"), expectedAllPublic),
    `the whole-university event starting tomorrow reminded everyone active (${expectedAllPublic.size} people)`,
  );
  check(
    sameSet(recipientsOf(departmentEventId, "REMINDER_T7"), expectedDepartment),
    `the department-scoped event reminded only ${csc.name} (${expectedDepartment.size} people, not ${expectedAllPublic.size})`,
  );
  check(
    sameSet(recipientsOf(staffOnlyEventId, "REMINDER_T1"), expectedStaffOnly),
    "the staff-only event reminded staff and administrators only",
  );
  check(
    recipientsOf(staffOnlyEventId, "REMINDER_T1").size > 0 &&
      ![...recipientsOf(staffOnlyEventId, "REMINDER_T1")].some((id) => studentIds.has(id)),
    "no student seeded or otherwise received the staff-only reminder",
  );
  // A student outside the department exists in the seed, which is what makes
  // this a real exclusion rather than a vacuous one.
  const outsideStudents = [...studentIds].filter((id) => !expectedDepartment.has(id));
  check(
    outsideStudents.length > 0 &&
      outsideStudents.every((id) => !recipientsOf(departmentEventId, "REMINDER_T7").has(id)),
    `the department reminder reached no student from another department (${outsideStudents.length} such student(s) exist, none of them reminded)`,
  );
  check(
    new Set(fixtureNotices.map((n) => `${n.eventId}|${n.type}|${n.userId}`)).size ===
      fixtureNotices.length,
    "no person received the same reminder twice in one run",
  );
  // The three events that must be ignored.
  const dueNotices = fixtureNotices.filter((notice) =>
    dueEventIds.includes(notice.eventId ?? ""),
  );
  const expectedDueNotices =
    expectedAllPublic.size * 2 + expectedDepartment.size + expectedStaffOnly.size;

  check(
    dueNotices.length === expectedDueNotices,
    `the job wrote exactly one notice per person per due event (${dueNotices.length}, expected ${expectedDueNotices})`,
  );
  check(
    fixtureNotices.every(
      (notice) =>
        dueEventIds.includes(notice.eventId ?? "") || notice.eventId === directEventId,
    ),
    "no reminder exists for any other fixture event",
  );

  for (const [label, eventId] of [
    ["draft", draftEventId],
    ["cancelled", cancelledEventId],
    ["already started", startedEventId],
  ] as const) {
    check(
      fixtureNotices.every((notice) => notice.eventId !== eventId),
      `the ${label} event produced no reminder`,
    );
  }

  // --- What the notices actually say --------------------------------------
  const t7Notice = fixtureNotices.find(
    (notice) => notice.eventId === t7EventId && notice.userId === student.id,
  );
  const t1Notice = fixtureNotices.find(
    (notice) => notice.eventId === t1EventId && notice.userId === student.id,
  );
  const t7Title = `${MARK} Seven days out`;
  const t1Title = `${MARK} Tomorrow`;
  const t7Start = addDays(today, 7);
  const t7End = addDays(today, 9);
  const t7DateRange = formatDateRange(t7Start, t7End);
  // An independent shape check: the two day numbers and the year, in order.
  const t7RangeShape = new RegExp(
    `${t7Start.getUTCDate()}\\D+${t7End.getUTCDate()}\\D+${t7Start.getUTCFullYear()}`,
  );

  check(t7Notice !== undefined && t1Notice !== undefined, "the student received both reminders");

  check(t7Notice?.title.includes(t7Title) === true, "the seven-day title names the event");
  check(
    /one week/i.test(t7Notice?.title ?? ""),
    `the seven-day title says how soon it is ("${t7Notice?.title}")`,
  );
  check(
    t7Notice?.body.includes(t7Title) === true,
    "the seven-day body names the event too, so it reads on its own in a list",
  );
  check(
    t7RangeShape.test(t7Notice?.body ?? ""),
    `the seven-day body states the event's dates (${t7DateRange})`,
  );
  check(
    (t7Notice?.body ?? "").includes(t7DateRange),
    "…using the shared date formatter, so the notice and the calendar agree",
  );
  check(
    (t7Notice?.body ?? "").includes(formatRelativeDays(t7Start, today)),
    "…and the shared relative formatter, which reads 'in 7 days' rather than 'in 6 days'",
  );
  check(
    (t7Notice?.body ?? "").includes(`${MARK} Hall`),
    "the body names the venue when the event has one",
  );
  check(
    t7Notice?.type === "REMINDER_T7" && t1Notice?.type === "REMINDER_T1",
    "the two horizons use the two distinct types",
  );
  check(
    /tomorrow/i.test(t1Notice?.title ?? "") && /tomorrow/i.test(t1Notice?.body ?? ""),
    `the one-day notice reads "tomorrow" in the title and the body ("${t1Notice?.title}")`,
  );
  check(t1Notice?.body.includes(t1Title) === true, "the one-day body names the event");

  // --- The second run ------------------------------------------------------
  const createdByFirstRun = firstRun.t7 + firstRun.t1;
  report(
    `first run:  t7=${firstRun.t7}, t1=${firstRun.t1}, skipped=${firstRun.skipped}, considered=${firstRun.considered} (${createdByFirstRun} notices written)`,
  );
  check(
    createdByFirstRun === (await prisma.notification.count()) - notificationsBefore,
    "the summary's counts match the rows that actually appeared",
  );
  check(
    firstRun.considered === dueEventIds.length + seededDueEvents,
    `exactly the due events were considered (4 fixtures + ${seededDueEvents} seeded = ${firstRun.considered})`,
  );

  const secondRun = await notifications.generateDueReminders({ now: runAt });
  const afterSecondRun = await prisma.notification.count();

  report(
    `second run: t7=${secondRun.t7}, t1=${secondRun.t1}, skipped=${secondRun.skipped}, considered=${secondRun.considered}`,
  );
  check(secondRun.t7 === 0 && secondRun.t1 === 0, "the second run creates nothing");
  check(
    afterSecondRun === notificationsBefore + createdByFirstRun,
    "the notification table holds exactly the same rows after a re-run",
  );
  check(
    secondRun.skipped === firstRun.skipped + createdByFirstRun,
    `the second run reports the duplicates instead (${secondRun.skipped} skipped = ${firstRun.skipped} + ${createdByFirstRun})`,
  );
  check(
    secondRun.considered === firstRun.considered,
    "…having considered exactly the same events",
  );
  check(
    secondRun.auditLogId !== firstRun.auditLogId,
    "each run still records its own audit row",
  );

  const runAudit = await prisma.auditLog.findUniqueOrThrow({
    where: { id: firstRun.auditLogId },
    select: { action: true, entity: true, metaJson: true, actorId: true },
  });
  const runMeta = JSON.parse(runAudit.metaJson ?? "{}") as Record<string, unknown>;
  check(runAudit.action === "REMINDERS_RUN", "the run is recorded as REMINDERS_RUN");
  check(runAudit.actorId === null, "the run has no actor it is the system, not a person");
  check(
    runMeta.t7 === firstRun.t7 && runMeta.t1 === firstRun.t1 && runMeta.skipped === firstRun.skipped,
    "the audit metadata carries the run's counts",
  );
  check(
    runMeta.horizonT7 === isoDay(addDays(today, 7)) &&
      runMeta.horizonT1 === isoDay(addDays(today, 1)),
    `the audit metadata names the two horizon days (${runMeta.horizonT7} and ${runMeta.horizonT1})`,
  );

  // =========================================================================
  section("6. Server reachable");
  // =========================================================================

  try {
    const home = await get("/");
    check(home.status === 200, `GET / -> ${home.status} (is \`npm run dev\` running?)`);
  } catch {
    console.error(`\nCould not reach ${BASE}. Start the dev server first:  npm run dev`);
    console.error(
      "Then run:  BASE_URL=http://localhost:3001 npx tsx scripts/verify-phase5.mts",
    );
    process.exitCode = 1;
    return;
  }

  // =========================================================================
  section("7. The notification centre over HTTP");
  // =========================================================================

  const anonymous = await get("/notifications");
  check(
    anonymous.status === 307 || anonymous.status === 302,
    `an anonymous visitor is redirected, not shown a page (${anonymous.status})`,
  );
  check(
    anonymous.location.startsWith("/login") && anonymous.location.includes("notifications"),
    `the redirect preserves where they were going (${anonymous.location})`,
  );
  check(!anonymous.body.includes(STAFF_NOTICE_TITLE), "the redirect body leaks no notice");

  const studentCookie = await mintCookie(student);
  const staffCookie = await mintCookie(staff);
  const adminCookie = await mintCookie(admin);

  const studentPage = await get("/notifications", studentCookie);
  check(studentPage.status === 200, `a signed-in user gets the page (${studentPage.status})`);
  check(
    studentPage.body.includes(STUDENT_NOTICE_TITLE),
    "the page shows a notice addressed to this user",
  );
  check(
    !studentPage.body.includes(STAFF_NOTICE_TITLE),
    "…and none addressed to somebody else",
  );
  check(
    studentPage.body.includes('href="/notifications"'),
    "the header links to the notification centre",
  );

  const staffPage = await get("/notifications", staffCookie);
  check(
    staffPage.status === 200 && staffPage.body.includes(STAFF_NOTICE_TITLE),
    "the other account sees its own notice on its own page",
  );
  check(
    !staffPage.body.includes(`${MARK} marked read over HTTP`) &&
      !staffPage.body.includes(`${MARK} standalone`),
    "…and not the other account's fixture notices",
  );

  const unreadOnlyPage = await get("/notifications?unread=1", studentCookie);
  check(unreadOnlyPage.status === 200, `the ?unread=1 filter renders (${unreadOnlyPage.status})`);

  /** Compare what the header renders against what the database holds. */
  async function badgeMatchesDatabase(
    user: { id: string },
    cookie: string,
    label: string,
  ): Promise<void> {
    const page = await get("/calendar", cookie);
    const expected = await notifications.unreadCount(user.id);
    const shown = headerUnreadBadge(page.body);

    check(
      shown === (expected === 0 ? null : expected),
      `${label}: the header badge is ${shown === null ? "absent" : shown} and the database says ${expected} unread`,
    );
  }

  await badgeMatchesDatabase(admin, adminCookie, "administrator");
  await badgeMatchesDatabase(student, studentCookie, "student");

  const studentDbUnread = await notifications.unreadCount(student.id);
  check(
    headerUnreadBadge(studentPage.body) === (studentDbUnread === 0 ? null : studentDbUnread),
    "the badge on the centre's own page agrees with the database too",
  );

  // --- marking one notice read, through the page's own form ---------------
  const httpNoticeId = await createFixtureNotification({
    userId: student.id,
    type: "REMINDER",
    title: `${MARK} marked read over HTTP`,
    body: "This notice is marked read by posting the form the page renders.",
  });

  const beforePost = await get("/notifications", studentCookie);
  check(
    beforePost.body.includes(`${MARK} marked read over HTTP`),
    "the new notice appears on the page",
  );

  const markForm = formsIn(beforePost.body).find((form) => form.includes(httpNoticeId)) ?? "";
  const markActionId = actionIdIn(markForm);
  check(markActionId.length > 0, "the page renders a mark-as-read form for that notice");

  const postResult = await postForm("/notifications", studentCookie, markActionId, {
    notificationId: httpNoticeId,
  });
  check(
    postResult.status === 200 || postResult.status === 303,
    `posting that form is accepted (${postResult.status})`,
  );

  const afterPost = await prisma.notification.findUniqueOrThrow({
    where: { id: httpNoticeId },
    select: { readAt: true },
  });
  check(afterPost.readAt !== null, "the row in the database is now read");

  const unreadAfterPost = await get("/notifications?unread=1", studentCookie);
  check(
    !unreadAfterPost.body.includes(`${MARK} marked read over HTTP`),
    "the unread-only view drops it",
  );
  check(
    unreadAfterPost.body.includes(STUDENT_NOTICE_TITLE),
    "…while still showing what is genuinely unread",
  );

  await badgeMatchesDatabase(student, studentCookie, "student after one notice was read");

  // --- marking everything read -------------------------------------------
  const markAllForm =
    formsIn(unreadAfterPost.body).find((form) => form.includes("Mark all as read")) ?? "";
  const markAllActionId = actionIdIn(markAllForm);
  check(
    markAllActionId.length > 0,
    "the page offers 'mark all as read' while something is unread",
  );

  // Measured here rather than in section 4: the reminder job raised new notices
  // for this account in between, which is not what this check is about.
  const staffUnreadBeforeMarkAll = await notifications.unreadCount(staff.id);

  await postForm("/notifications", studentCookie, markAllActionId);

  check(
    (await notifications.unreadCount(student.id)) === 0,
    "marking all read over HTTP leaves the student nothing unread",
  );
  check(
    (await notifications.unreadCount(staff.id)) === staffUnreadBeforeMarkAll,
    "…and still does not touch the other account",
  );

  const allReadPage = await get("/notifications", studentCookie);
  check(
    !allReadPage.body.includes("Mark all as read"),
    "with nothing unread, the mark-all control is not offered",
  );
  check(
    headerUnreadBadge(allReadPage.body) === null,
    "and the header badge disappears",
  );

  // =========================================================================
  section("8. The reminder endpoint fails closed");
  // =========================================================================

  const noSecret = await postJson("/api/reminders/run");
  check(
    noSecret.status === 401 || noSecret.status === 503,
    `a request with no secret is refused (${noSecret.status})`,
  );
  check(
    noSecret.json?.ok === false && typeof noSecret.json?.error === "string",
    "…with a JSON explanation rather than an empty body",
  );

  const wrongSecret = await postJson("/api/reminders/run", {
    authorization: "Bearer not-the-real-secret",
  });
  check(
    wrongSecret.status === noSecret.status,
    `a wrong secret is refused exactly the same way (${wrongSecret.status})`,
  );
  check(
    (wrongSecret.json?.error as string | undefined) === (noSecret.json?.error as string | undefined),
    "…without disclosing whether a secret is configured",
  );

  const configuredOnServer = noSecret.status === 401;
  report(
    configuredOnServer
      ? "the server has CRON_SECRET, so the refusal is 401 (an unconfigured server answers 503 instead)"
      : "the server has NO CRON_SECRET, so the job refuses to run at all 503, which is failing closed",
  );

  const secret = process.env.CRON_SECRET;

  if (!configuredOnServer) {
    skip(
      "the 200 path needs CRON_SECRET in the server's environment: set it in .env and restart `npm run dev`",
    );
  } else if (!secret) {
    skip(
      "the server is configured with CRON_SECRET but this script found none in .env, so the authorised run could not be tried",
    );
  } else {
    const dueBefore = await prisma.notification.count({ where: { eventId: { in: dueEventIds } } });
    const totalBefore = await prisma.notification.count();

    const authorized = await postJson("/api/reminders/run", {
      authorization: `Bearer ${secret}`,
    });

    const dueAfter = await prisma.notification.count({ where: { eventId: { in: dueEventIds } } });
    const totalAfter = await prisma.notification.count();

    check(authorized.status === 200, `the correct secret runs the job (${authorized.status})`);
    check(authorized.json?.ok === true, "…and reports success");
    check(
      typeof authorized.json?.t7 === "number" &&
        typeof authorized.json?.t1 === "number" &&
        typeof authorized.json?.skipped === "number" &&
        typeof authorized.json?.considered === "number",
      `…with counts (${JSON.stringify({
        t7: authorized.json?.t7,
        t1: authorized.json?.t1,
        skipped: authorized.json?.skipped,
        considered: authorized.json?.considered,
      })})`,
    );
    check(
      dueAfter === dueBefore,
      `…and duplicated not one reminder for an event that already had them (${dueBefore} notices for the due fixtures)`,
    );
    check(
      totalAfter - totalBefore ===
        Number(authorized.json?.t7 ?? -1) + Number(authorized.json?.t1 ?? -1),
      "the counts it reports match the rows that appeared",
    );

    const authorizedGet = await get("/api/reminders/run");
    check(
      authorizedGet.status === 401 || authorizedGet.status === 503,
      `the GET handler is no more privileged than the POST a bare GET is refused (${authorizedGet.status})`,
    );

    const auditsAfter = await prisma.auditLog.count({
      where: { action: "REMINDERS_RUN", createdAt: { gte: startedAt } },
    });
    check(auditsAfter >= 3, `three runs have now been recorded (${auditsAfter} audit rows)`);

    // Leave nothing for the closing sections to trip over.
    await prisma.auditLog.deleteMany({
      where: { action: "REMINDERS_RUN", createdAt: { gte: startedAt } },
    });
  }

  // =========================================================================
  section("9. Cleaning up");
  // =========================================================================

  // Everything this script wrote is newer than the baseline and not part of it,
  // so the cleanup is "delete what is not in the baseline" rather than a list of
  // ids that could miss something.
  const removedNotifications = await prisma.notification.deleteMany({
    where: { createdAt: { gte: startedAt }, id: { notIn: baselineIds } },
  });
  const removedEvents = await prisma.calendarEvent.deleteMany({
    where: { id: { in: fixtureEventIds } },
  });
  const removedAudit = await prisma.auditLog.deleteMany({
    where: { action: "REMINDERS_RUN", createdAt: { gte: startedAt } },
  });

  report(
    `removed ${removedNotifications.count} notices, ${removedEvents.count} events and ${removedAudit.count} audit rows`,
  );

  check(
    (await prisma.notification.count({ where: { title: { contains: MARK } } })) === 0,
    "no fixture notice is left",
  );
  check(
    (await prisma.calendarEvent.count({ where: { title: { contains: MARK } } })) === 0,
    "no fixture event is left",
  );
  check(
    (await prisma.eventTarget.count({ where: { eventId: { in: fixtureEventIds } } })) === 0,
    "no fixture audience target is left",
  );
  check(
    (await prisma.auditLog.count({ where: { action: "REMINDERS_RUN", createdAt: { gte: startedAt } } })) === 0,
    "no REMINDERS_RUN audit row from this script is left",
  );

  // Restore every read flag the marking tests touched.
  await restoreReadFlags();
  check(
    (await prisma.notification.count({ where: { readAt: null } })) === baselineUnread,
    `the unread state of the seeded notices is restored (${baselineUnread} unread)`,
  );

  // =========================================================================
  section("10. Final database state");
  // =========================================================================

  const finalCounts = await counterSnapshot();

  for (const [key, value] of Object.entries(finalCounts)) {
    check(
      value === baselineCounts[key as keyof typeof baselineCounts],
      `${key} restored (${value})`,
    );
  }

  const byType = await prisma.notification.groupBy({
    by: ["type"],
    _count: true,
    orderBy: { type: "asc" },
  });
  const unreadNow = await prisma.notification.count({ where: { readAt: null } });

  console.log("\n  Final database state:");
  for (const [key, value] of Object.entries(finalCounts)) {
    console.log(`    ${key}: ${value}`);
  }
  console.log(`    notifications unread: ${unreadNow} of ${finalCounts.notifications}`);
  console.log(
    `    notification types: ${byType.map((row) => `${row.type}: ${row._count}`).join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// Baseline captured before the first write, so the closing checks compare like
// with like.
// ---------------------------------------------------------------------------

async function counterSnapshot() {
  return {
    users: await prisma.user.count(),
    faculties: await prisma.faculty.count(),
    departments: await prisma.department.count(),
    sessions: await prisma.academicSession.count(),
    semesters: await prisma.semester.count(),
    categories: await prisma.eventCategory.count(),
    events: await prisma.calendarEvent.count(),
    targets: await prisma.eventTarget.count(),
    revisions: await prisma.eventRevision.count(),
    notifications: await prisma.notification.count(),
    subscriptions: await prisma.subscription.count(),
    auditLogs: await prisma.auditLog.count(),
  };
}

const baselineCounts = await counterSnapshot();
const baselineUnread = await prisma.notification.count({ where: { readAt: null } });
const baselineReadAt = new Map<string, Date | null>(
  (await prisma.notification.findMany({ select: { id: true, readAt: true } })).map((row) => [
    row.id,
    row.readAt,
  ]),
);
const baselineIds = [...baselineReadAt.keys()];
const baselineStudentUnread = await prisma.notification.count({
  where: { readAt: null, user: { email: STUDENT_EMAIL } },
});

console.log(`Baseline counts: ${JSON.stringify(baselineCounts)}`);
console.log(
  `Baseline unread notices: ${baselineUnread} (${baselineStudentUnread} of them the student's)`,
);

try {
  await main();
} catch (error) {
  failed += 1;
  console.error("\nUNCAUGHT ERROR:", error);
} finally {
  await prisma.$disconnect();
}

console.log(
  `\n${passed} passed, ${failed} failed${skippedChecks > 0 ? `, ${skippedChecks} skipped` : ""}`,
);
process.exitCode = failed > 0 ? 1 : 0;
