/**
 * Phase 4 verification: calendar interoperability.
 *
 * Run with:  npx tsx scripts/verify-phase4.mts        (with `npm run dev` running)
 *
 * Two halves, matching the two halves of the feature:
 *
 *  1. The iCalendar builder, against hand-written fixtures. These are the only
 *     place where the wire format can be checked exactly — CRLF, 75-octet folding,
 *     TEXT escaping, exclusive DTEND, floating times, SEQUENCE — and they need no
 *     server and no database.
 *  2. The feeds, the subscribe screen and the print view over HTTP, against the
 *     seeded calendar. It rotates a real subscription token to prove the old URL
 *     dies and the new one works, then puts the original token back and removes
 *     the audit row the rotation wrote, so `dev.db` is left as it was found.
 *
 * Exits non-zero if any check fails.
 */
import { readFileSync } from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

// tsx does not load .env, so read the secret the same way the app does.
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

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

const { prisma } = await import("../lib/db");
const { signSession, SESSION_COOKIE_NAME } = await import("../lib/session");
const ics = await import("../lib/services/ics");
const subscriptions = await import("../lib/services/subscriptions");

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

const D = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute));

const FIXED_NOW = D(2026, 9, 15, 12, 0);

type Fixture = Parameters<typeof ics.buildCalendar>[0][number];

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "event-fixture-1",
    title: "Matriculation Ceremony",
    description: "Arrive by 08:00.",
    location: "Makanjuola Hall",
    startAt: D(2026, 9, 15),
    endAt: D(2026, 9, 15),
    allDay: true,
    status: "PUBLISHED",
    version: 1,
    updatedAt: D(2026, 9, 1, 10, 30),
    category: { name: "Ceremonies" },
    ...overrides,
  };
}

/** Undo RFC 5545 folding: join continuation lines back onto their parent. */
function unfold(calendar: string): string {
  return calendar.split("\r\n").join("\n").replace(/\n /g, "");
}

/** The logical lines of a calendar, unfolded. */
function logicalLines(calendar: string): string[] {
  return unfold(calendar).split("\n").filter((line) => line.length > 0);
}

function lineStartingWith(calendar: string, prefix: string): string | undefined {
  return logicalLines(calendar).find((line) => line.startsWith(prefix));
}

const octets = (value: string) => Buffer.byteLength(value, "utf8");

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
    contentType: response.headers.get("content-type") ?? "",
    cacheControl: response.headers.get("cache-control") ?? "",
    disposition: response.headers.get("content-disposition") ?? "",
    location: response.headers.get("location") ?? "",
    body: await response.text(),
  };
}

/** Submit one of the page's own forms, exactly as a no-JS browser would. */
async function postForm(path: string, cookie: string, actionId: string) {
  const body = new FormData();
  body.append(`$ACTION_ID_${actionId}`, "");

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Cookie: cookie },
    body,
    redirect: "manual",
  });
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

const formsIn = (html: string) => html.match(/<form[\s\S]*?<\/form>/g) ?? [];
const actionIdIn = (form: string) => /\$ACTION_ID_([A-Za-z0-9_-]+)/.exec(form)?.[1] ?? "";

async function mintCookie(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new Error(`No seeded user with email ${email}`);

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
  // =========================================================================
  section("1. iCalendar builder — CRLF and folding");
  // =========================================================================

  const longTitle =
    "Résumé — 500 Level Ñoño Examinations, part 1; of a very long summary that " +
    "must wrap onto several lines ✓ without ever splitting a multi-byte character";
  const folded = ics.buildCalendar([fixture({ title: longTitle })], { now: FIXED_NOW });

  check(folded.endsWith("\r\n"), "the calendar ends with CRLF");
  check(
    folded.split("\r\n").join("").includes("\n") === false &&
      folded.split("\r\n").join("").includes("\r") === false,
    "every line ending is CRLF — no bare LF or CR anywhere",
  );

  const physicalLines = folded.split("\r\n");
  const longest = Math.max(...physicalLines.map(octets));
  check(longest <= 75, `no physical line exceeds 75 octets (longest: ${longest})`);

  const continuations = physicalLines.slice(1).filter((line) => line.startsWith(" "));
  check(continuations.length >= 2, `the long summary was folded (${continuations.length} continuation lines)`);
  check(
    continuations.every((line) => line.startsWith(" ") && line.length > 1),
    "every continuation line starts with a single space",
  );

  const unfolded = unfold(folded);
  check(!unfolded.includes("\uFFFD"), "unfolding produces no replacement character (no split multi-byte character)");
  check(
    lineStartingWith(folded, "SUMMARY:") === `SUMMARY:${ics.escapeText(longTitle)}`,
    "the unfolded SUMMARY round-trips the original title exactly, accents and symbols intact",
  );

  // =========================================================================
  section("2. iCalendar builder — TEXT escaping");
  // =========================================================================

  const escaped = ics.buildCalendar(
    [
      fixture({
        title: "Senate Meeting, part 1; quorum required",
        description: "Line one.\r\nLine two.",
        location: "Room 4, Block B; ground floor",
      }),
    ],
    { now: FIXED_NOW },
  );

  const summary = lineStartingWith(escaped, "SUMMARY:") ?? "";
  const description = lineStartingWith(escaped, "DESCRIPTION:") ?? "";
  const location = lineStartingWith(escaped, "LOCATION:") ?? "";

  check(summary === "SUMMARY:Senate Meeting\\, part 1\\; quorum required", "commas and semicolons are escaped in SUMMARY");
  check(description.includes("Line one.\\nLine two."), "a real newline becomes the two-character \\n escape");
  check(
    logicalLines(escaped).filter((line) => line.startsWith("DESCRIPTION:")).length === 1,
    "a newline inside the description does not split the property into two lines",
  );
  check(!description.includes("\n") && !description.includes("\r"), "no raw line break survives inside DESCRIPTION");
  check(location.includes("Room 4\\, Block B\\; ground floor"), "commas and semicolons are escaped in LOCATION");
  check(ics.escapeText("a\\b") === "a\\\\b", "a backslash is escaped first, so escapes are not double-escaped");
  check(lineStartingWith(escaped, "CATEGORIES:") === "CATEGORIES:Ceremonies", "CATEGORIES carries the category name");

  // =========================================================================
  section("3. iCalendar builder — envelope");
  // =========================================================================

  const envelopeLines = logicalLines(folded);
  for (const expected of [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Acadex//LASU Academic Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:Africa/Lagos",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VEVENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ]) {
    check(envelopeLines.includes(expected), `the envelope contains ${expected}`);
  }
  check(envelopeLines.some((line) => line.startsWith("X-WR-CALNAME:")), "the envelope names the calendar");
  check(envelopeLines.some((line) => line.startsWith("X-WR-CALDESC:")), "the envelope describes the calendar");

  const emptyCalendar = ics.buildCalendar([], { now: FIXED_NOW });
  check(
    emptyCalendar.includes("BEGIN:VCALENDAR") &&
      emptyCalendar.includes("END:VCALENDAR") &&
      !emptyCalendar.includes("BEGIN:VEVENT"),
    "an empty event list still produces a valid, event-less calendar",
  );

  // =========================================================================
  section("4. iCalendar builder — dates");
  // =========================================================================

  // A single-day all-day event: 15 September 2026.
  const singleDay = ics.buildCalendar(
    [fixture({ startAt: D(2026, 9, 15), endAt: D(2026, 9, 15) })],
    { now: FIXED_NOW },
  );
  check(
    logicalLines(singleDay).includes("DTSTART;VALUE=DATE:20260915"),
    "an all-day event emits DTSTART;VALUE=DATE:20260915",
  );
  check(
    logicalLines(singleDay).includes("DTEND;VALUE=DATE:20260916"),
    "a single-day all-day event still gets a next-day (exclusive) DTEND",
  );

  // Three-day event: 15–17 September inclusive.
  const multiDay = ics.buildCalendar(
    [fixture({ startAt: D(2026, 9, 15), endAt: D(2026, 9, 17) })],
    { now: FIXED_NOW },
  );
  check(
    logicalLines(multiDay).includes("DTEND;VALUE=DATE:20260918"),
    "a 15–17 September event closes on 18 September (the day after the inclusive end)",
  );

  // A timed event: 09:00–11:00, stored as wall-clock time in UTC fields.
  const timed = ics.buildCalendar(
    [fixture({ allDay: false, startAt: D(2026, 9, 15, 9, 0), endAt: D(2026, 9, 15, 11, 0) })],
    { now: FIXED_NOW },
  );
  const timedLines = logicalLines(timed);
  check(timedLines.includes("DTSTART:20260915T090000"), "a timed event emits floating local DTSTART (09:00)");
  check(timedLines.includes("DTEND:20260915T110000"), "a timed event emits floating local DTEND (11:00)");
  check(
    !timedLines.some((line) => line.startsWith("DTSTART:") && line.endsWith("Z")),
    "the timed DTSTART is floating — no trailing Z, so it is not shifted by a timezone",
  );
  check(!timed.includes("TZID"), "no TZID is emitted anywhere (floating wall-clock time is deliberate)");

  // =========================================================================
  section("5. iCalendar builder — SEQUENCE, STATUS, UID, description");
  // =========================================================================

  check(
    logicalLines(ics.buildCalendar([fixture({ version: 1 })], { now: FIXED_NOW })).includes("SEQUENCE:0"),
    "version 1 emits SEQUENCE:0",
  );
  check(
    logicalLines(ics.buildCalendar([fixture({ version: 3 })], { now: FIXED_NOW })).includes("SEQUENCE:2"),
    "version 3 emits SEQUENCE:2 (SEQUENCE follows the date-move version)",
  );

  const cancelled = ics.buildCalendar(
    [fixture({ status: "CANCELLED", version: 2 })],
    { now: FIXED_NOW },
  );
  check(logicalLines(cancelled).includes("STATUS:CANCELLED"), "a cancelled event emits STATUS:CANCELLED");
  check(
    logicalLines(cancelled).includes("SEQUENCE:2"),
    "the cancellation is bumped one step above the published SEQUENCE (version 2 -> 2, published would be 1)",
  );
  check(
    logicalLines(ics.buildCalendar([fixture()], { now: FIXED_NOW })).includes("STATUS:CONFIRMED"),
    "a published event emits STATUS:CONFIRMED",
  );

  const buildA = ics.buildCalendar([fixture()], { now: FIXED_NOW });
  const buildB = ics.buildCalendar([fixture()], { now: D(2026, 9, 20, 6, 0) });
  const uidIn = (calendar: string) => lineStartingWith(calendar, "UID:");
  check(
    uidIn(buildA) === "UID:event-fixture-1@acadex.lasu.edu.ng",
    "the UID is <eventId>@acadex.lasu.edu.ng",
  );
  check(uidIn(buildA) === uidIn(buildB), "the UID is stable across two rebuilds");
  check(
    lineStartingWith(buildA, "DTSTAMP:") !== lineStartingWith(buildB, "DTSTAMP:"),
    "DTSTAMP (unlike UID) does move with the clock",
  );
  check(
    lineStartingWith(buildA, "LAST-MODIFIED:") === "LAST-MODIFIED:20260901T103000Z",
    "LAST-MODIFIED comes from updatedAt",
  );

  const rescheduled = ics.buildCalendar(
    [fixture({ version: 3, startAt: D(2026, 9, 15), endAt: D(2026, 9, 17) })],
    { now: FIXED_NOW },
  );
  const rescheduledDescription = lineStartingWith(rescheduled, "DESCRIPTION:") ?? "";
  check(rescheduledDescription.includes("Rescheduled"), "a rescheduled event says so in its description");
  check(
    rescheduledDescription.includes("(15 – 17 Sept 2026)"),
    "the rescheduled description gives the current approved dates, collapsed by the shared formatter",
  );
  check(
    !(lineStartingWith(ics.buildCalendar([fixture()], { now: FIXED_NOW }), "DESCRIPTION:") ?? "").includes(
      "Rescheduled",
    ),
    "a first-version event is not described as rescheduled",
  );

  const twoEvents = ics.buildCalendar([fixture(), fixture({ id: "event-fixture-2" })], {
    now: FIXED_NOW,
  });
  check(
    (twoEvents.match(/BEGIN:VEVENT/g) ?? []).length === 2 &&
      (twoEvents.match(/END:VEVENT/g) ?? []).length === 2,
    "two events produce exactly two VEVENT blocks",
  );

  // =========================================================================
  section("6. Single-event calendar and Google Calendar URL");
  // =========================================================================

  const single = ics.buildEventCalendar(fixture(), { now: FIXED_NOW });
  check((single.match(/BEGIN:VEVENT/g) ?? []).length === 1, "buildEventCalendar produces exactly one VEVENT");
  check(
    logicalLines(single).includes("X-WR-CALNAME:Matriculation Ceremony"),
    "the single-event calendar is named after the event",
  );

  const googleAllDay = ics.buildGoogleCalendarUrl(fixture());
  check(googleAllDay.startsWith("https://calendar.google.com/calendar/render?"), "the Google link is a template URL");
  check(googleAllDay.includes("action=TEMPLATE"), "the Google link carries action=TEMPLATE");
  check(
    decodeURIComponent(new URL(googleAllDay).searchParams.get("dates") ?? "") === "20260915/20260916",
    "the Google link uses an exclusive all-day range (20260915/20260916)",
  );
  check(
    new URL(googleAllDay).searchParams.get("text") === "Matriculation Ceremony",
    "the Google link carries the event title",
  );

  const googleTimed = ics.buildGoogleCalendarUrl(
    fixture({ allDay: false, startAt: D(2026, 9, 15, 9, 0), endAt: D(2026, 9, 15, 11, 0) }),
  );
  check(
    decodeURIComponent(new URL(googleTimed).searchParams.get("dates") ?? "") === "20260915T090000/20260915T110000",
    "the Google link uses floating times for a timed event (no Z)",
  );

  // =========================================================================
  section("7. Server reachable");
  // =========================================================================

  try {
    const home = await get("/");
    check(home.status === 200, `GET / -> ${home.status} (is \`npm run dev\` running?)`);
  } catch {
    console.error(`\nCould not reach ${BASE}. Start the dev server first:  npm run dev`);
    process.exitCode = 1;
    return;
  }

  // =========================================================================
  section("8. The public feed");
  // =========================================================================

  const wholeUniversity = "Registration for New Students (First Semester)";
  const departmentScoped = "Department of Computer Science Seminar Series";
  const levelScoped = "400 Level Project Defence Orientation";
  const staffOnly = "Faculty of Science Board Meeting";
  const draft = "Release of First Semester Examination Timetable";

  const publicFeed = await get("/ics/public.ics");
  check(publicFeed.status === 200, `GET /ics/public.ics -> ${publicFeed.status}`);
  check(
    publicFeed.contentType.startsWith("text/calendar"),
    `the public feed is served as text/calendar (${publicFeed.contentType})`,
  );
  check(
    publicFeed.cacheControl.includes("max-age=900"),
    `the public feed is cacheable for 15 minutes (${publicFeed.cacheControl})`,
  );
  check(
    publicFeed.disposition.startsWith("inline"),
    "feeds are served inline, not as a download",
  );
  check(publicFeed.body.includes("BEGIN:VCALENDAR"), "the public feed is a VCALENDAR");
  check(publicFeed.body.includes("UID:"), "the public feed has event entries");

  check(publicFeed.body.includes(wholeUniversity), "public feed: contains whole-university events");
  check(!publicFeed.body.includes(departmentScoped), "public feed: no department-targeted events");
  check(!publicFeed.body.includes(levelScoped), "public feed: no level-targeted events");
  check(!publicFeed.body.includes(staffOnly), "public feed: no staff-only events");
  check(!publicFeed.body.includes(draft), "public feed: no drafts");

  const publicFeedWithoutSuffix = await get("/ics/public");
  check(
    publicFeedWithoutSuffix.status === 200,
    `the token works without the .ics suffix (${publicFeedWithoutSuffix.status})`,
  );

  // The route accepts both spellings, so the normaliser that strips the suffix is
  // worth checking directly as well as through the URL above.
  check(subscriptions.normaliseToken("abc123.ics") === "abc123", "normaliseToken strips a .ics suffix");
  check(subscriptions.normaliseToken("  abc123  ") === "abc123", "normaliseToken trims whitespace");
  check(subscriptions.normaliseToken("abc.ics.ics") === "abc.ics", "normaliseToken strips only one suffix");

  const unknownToken = await get(`/ics/${"0".repeat(48)}.ics`);
  check(unknownToken.status === 404, `an unknown token 404s (${unknownToken.status})`);
  check(
    (unknownToken.cacheControl || "").includes("no-store"),
    "the 404 is not cached",
  );
  const malformedToken = await get("/ics/not-a-real-token");
  check(malformedToken.status === 404, `a malformed token 404s (${malformedToken.status})`);

  // =========================================================================
  section("9. The personal feed");
  // =========================================================================

  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@acadex.lasu.edu.ng" },
    select: { id: true, name: true, subscription: { select: { id: true, icsToken: true } } },
  });
  const staff = await prisma.user.findUniqueOrThrow({
    where: { email: "staff@acadex.lasu.edu.ng" },
    select: { subscription: { select: { icsToken: true } } },
  });

  const originalToken = student.subscription?.icsToken ?? "";
  check(originalToken.length > 0, "the seeded student has a subscription token");

  const studentFeed = await get(`/ics/${originalToken}.ics`);
  check(studentFeed.status === 200, `GET /ics/<student token>.ics -> ${studentFeed.status}`);
  check(studentFeed.body.includes(wholeUniversity), "the student's feed contains whole-university events");
  check(studentFeed.body.includes(departmentScoped), "the student's feed contains their department's events");
  check(studentFeed.body.includes(levelScoped), "the student's feed contains their level's events");
  check(!studentFeed.body.includes(staffOnly), "the student's feed does NOT contain staff-only events");
  check(!studentFeed.body.includes(draft), "the student's feed does NOT contain drafts");
  check(
    studentFeed.body.includes("STATUS:CONFIRMED"),
    "published entries are STATUS:CONFIRMED",
  );
  check(
    studentFeed.body.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H"),
    "the feed advertises its one-hour refresh interval",
  );

  const staffFeed = await get(`/ics/${staff.subscription?.icsToken}.ics`);
  check(staffFeed.status === 200, `GET /ics/<staff token>.ics -> ${staffFeed.status}`);
  check(staffFeed.body.includes(staffOnly), "a staff member's feed DOES contain their faculty's staff-only events");

  // =========================================================================
  section("10. Single-event download");
  // =========================================================================

  const publicEvent = await prisma.calendarEvent.findFirstOrThrow({
    where: { status: "PUBLISHED", visibility: "PUBLIC", scope: "ALL" },
    select: { id: true, title: true },
    orderBy: { startAt: "asc" },
  });
  const publicEventDraft = await prisma.calendarEvent.findFirstOrThrow({
    where: { status: "DRAFT" },
    select: { id: true },
    orderBy: { startAt: "asc" },
  });
  const staffOnlyEvent = await prisma.calendarEvent.findFirstOrThrow({
    where: { visibility: "STAFF_ONLY", status: "PUBLISHED" },
    select: { id: true },
  });

  const singleDownload = await get(`/calendar/${publicEvent.id}/ics`);
  check(singleDownload.status === 200, `GET /calendar/<id>/ics -> ${singleDownload.status}`);
  check(singleDownload.body.includes(publicEvent.title), "the download contains the event's title");
  check(
    singleDownload.disposition.startsWith("attachment"),
    `the single-event download is an attachment (${singleDownload.disposition})`,
  );
  check(singleDownload.disposition.includes(".ics"), "the download has an .ics filename");
  check(
    (singleDownload.body.match(/BEGIN:VEVENT/g) ?? []).length === 1,
    "the download contains exactly one event",
  );

  const draftDownload = await get(`/calendar/${publicEventDraft.id}/ics`);
  check(draftDownload.status === 404, `a draft's .ics 404s (${draftDownload.status})`);
  const staffOnlyDownload = await get(`/calendar/${staffOnlyEvent.id}/ics`);
  check(staffOnlyDownload.status === 404, `a staff-only event's .ics 404s anonymously (${staffOnlyDownload.status})`);

  // =========================================================================
  section("11. Subscribe screen");
  // =========================================================================

  const studentCookie = await mintCookie("student@acadex.lasu.edu.ng");

  const anonSubscribe = await get("/subscribe");
  check(anonSubscribe.status === 200, `anonymous GET /subscribe -> ${anonSubscribe.status}`);
  check(anonSubscribe.body.includes("/ics/public.ics"), "anonymous visitors are offered the public feed");
  check(anonSubscribe.body.includes("/login"), "anonymous visitors are offered a sign-in link for a personal feed");

  const studentSubscribe = await get("/subscribe", studentCookie);
  check(studentSubscribe.status === 200, `signed-in GET /subscribe -> ${studentSubscribe.status}`);
  check(
    studentSubscribe.body.includes(`/ics/${originalToken}.ics`),
    "the signed-in page shows the user's own feed address",
  );
  check(studentSubscribe.body.includes("webcal://"), "the page offers a one-click webcal:// link");
  check(studentSubscribe.body.includes("secret"), "the page says plainly that the address is a secret");
  check(
    studentSubscribe.body.includes("Google Calendar") &&
      studentSubscribe.body.includes("Outlook") &&
      studentSubscribe.body.includes("Apple Calendar"),
    "the page gives instructions for all three calendar clients",
  );

  // =========================================================================
  section("12. Rotating the token (URL is the credential)");
  // =========================================================================

  const rotationStartedAt = new Date();
  const rotateForm = formsIn(studentSubscribe.body).find((form) => form.includes("Regenerate"));
  check(Boolean(rotateForm), "found the regenerate-address form");

  const oldUrlBefore = await get(`/ics/${originalToken}.ics`);
  check(oldUrlBefore.status === 200, "the original address works before rotation");

  let rotatedToken = "";
  try {
    const rotated = await postForm(
      "/subscribe",
      studentCookie,
      rotateForm ? actionIdIn(rotateForm) : "",
    );
    check(rotated.status === 303, `POST regenerate -> ${rotated.status}`);
    check(
      rotated.location.includes("saved"),
      "the redirect confirms the new address",
    );

    const afterRotation = await prisma.subscription.findUniqueOrThrow({
      where: { id: student.subscription?.id ?? "" },
      select: { icsToken: true },
    });
    rotatedToken = afterRotation.icsToken;
    check(rotatedToken !== originalToken, "the token actually changed");
    check(rotatedToken.length >= 32, `the new token is long and random (${rotatedToken.length} characters)`);

    const oldUrlAfter = await get(`/ics/${originalToken}.ics`);
    check(oldUrlAfter.status === 404, `the old address 404s after rotation (${oldUrlAfter.status})`);
    const newUrl = await get(`/ics/${rotatedToken}.ics`);
    check(newUrl.status === 200, `the new address works (${newUrl.status})`);

    const auditRows = await prisma.auditLog.findMany({
      where: {
        actorId: student.id,
        action: "SUBSCRIPTION_TOKEN_ROTATED",
        createdAt: { gte: rotationStartedAt },
      },
      select: { id: true, metaJson: true },
    });
    check(auditRows.length === 1, `exactly one rotation audit row was written (${auditRows.length})`);
    check(
      !(auditRows[0]?.metaJson ?? "").includes(rotatedToken),
      "the audit row does not record the new token value",
    );
  } finally {
    // Put the database back exactly as it was found, even if a check above
    // failed: same token, and the audit row this script caused removed.
    await prisma.subscription.update({
      where: { id: student.subscription?.id ?? "" },
      data: { icsToken: originalToken },
    });
    await prisma.auditLog.deleteMany({
      where: {
        actorId: student.id,
        action: "SUBSCRIPTION_TOKEN_ROTATED",
        createdAt: { gte: rotationStartedAt },
      },
    });
  }

  const restored = await prisma.subscription.findUniqueOrThrow({
    where: { id: student.subscription?.id ?? "" },
    select: { icsToken: true },
  });
  check(restored.icsToken === originalToken, "the original token was restored");
  const restoredUrl = await get(`/ics/${originalToken}.ics`);
  check(restoredUrl.status === 200, `the restored address works again (${restoredUrl.status})`);

  // =========================================================================
  section("13. Print / PDF view");
  // =========================================================================

  const activeSession = await prisma.academicSession.findFirstOrThrow({
    where: { isActive: true },
    select: { id: true, name: true, semesters: { select: { id: true, type: true }, orderBy: { startDate: "asc" } } },
  });
  const archivedSession = await prisma.academicSession.findFirstOrThrow({
    where: { isActive: false },
    select: { id: true, name: true },
    orderBy: { startDate: "desc" },
  });

  const printDefault = await get("/calendar/print");
  check(printDefault.status === 200, `GET /calendar/print -> ${printDefault.status}`);
  check(printDefault.body.includes(activeSession.name), "the print view defaults to the active session");
  check(printDefault.body.includes("Generated on"), "the print view is stamped with the generation date");
  check(printDefault.body.includes("Academic Calendar"), "the print view has a document heading");
  check(!printDefault.body.includes(draft), "the print view does not include drafts");

  const printSession = await get(`/calendar/print?session=${archivedSession.id}`);
  check(printSession.status === 200, `GET /calendar/print?session=<archived> -> ${printSession.status}`);
  check(printSession.body.includes(archivedSession.name), "the archived session can be printed");

  const printSemester = await get(`/calendar/print?semester=${activeSession.semesters[0]?.id ?? ""}`);
  check(printSemester.status === 200, `GET /calendar/print?semester=<id> -> ${printSemester.status}`);
  check(printSemester.body.includes(activeSession.name), "a semester print shows its session name");

  const printMissing = await get("/calendar/print?session=does-not-exist");
  check(printMissing.status === 404, `an unknown session 404s (${printMissing.status})`);

  // =========================================================================
  section("14. SEQUENCE is monotonic across cancel and restore");
  // =========================================================================
// =========================================================================
// 14. SEQUENCE is monotonic across cancel and restore
// =========================================================================

// A subscribed client MUST ignore an update whose SEQUENCE is lower than the one
// it already holds. Cancelling and then restoring an event moves no dates, so a
// SEQUENCE derived from `version` alone would run 0 -> 1 -> 0 and leave the event
// showing as cancelled in every subscriber's calendar forever. The feed therefore
// derives SEQUENCE from the append-only revision count, which only grows.

const eventsService = await import("../lib/services/events");

const sequenceAdmin = await prisma.user.findUnique({
  where: { email: "admin@acadex.lasu.edu.ng" },
  select: { id: true },
});
if (!sequenceAdmin) throw new Error("seed data missing: admin user");
const sequenceActor = { id: sequenceAdmin.id, role: "ADMIN" as const };

const sequenceSemester = await prisma.semester.findFirst({
  where: { session: { isActive: true } },
  select: { id: true },
  orderBy: { startDate: "asc" },
});
const sequenceCategory = await prisma.eventCategory.findUnique({
  where: { slug: "lectures" },
  select: { id: true },
});
if (!sequenceSemester || !sequenceCategory) throw new Error("seed data missing");

const sequenceFixture = await eventsService.createEvent(
  sequenceActor,
  {
    title: "SEQUENCE monotonicity fixture",
    description: "Created by scripts/verify-phase4.mts",
    categoryId: sequenceCategory.id,
    semesterId: sequenceSemester.id,
    startDate: "2026-11-09",
    endDate: "2026-11-11",
    startTime: "",
    endTime: "",
    allDay: true,
    location: "",
    visibility: "PUBLIC",
    scope: "ALL",
    targetIds: [],
  },
  { publish: true },
);
check(sequenceFixture.ok, "created a published fixture event");
const sequenceFixtureId = sequenceFixture.ok ? sequenceFixture.data.eventId : "";

// The SEQUENCE the public feed advertises for that event, or null if absent.
async function feedSequence(): Promise<number | null> {
  const feed = await get("/ics/public.ics");
  const lines = logicalLines(feed.body);
  const uid = `UID:${sequenceFixtureId}@acadex.lasu.edu.ng`;
  const start = lines.findIndex((line) => line === uid);
  if (start === -1) return null;

  for (let i = start; i < Math.min(start + 12, lines.length); i += 1) {
    const match = /^SEQUENCE:(\d+)$/.exec(lines[i]);
    if (match) return Number(match[1]);
  }
  return null;
}

const seqPublished = await feedSequence();
check(seqPublished !== null, `the feed advertises the fixture (SEQUENCE ${seqPublished})`);

const sequenceCancelled = await eventsService.cancelEvent(sequenceActor, sequenceFixtureId);
check(sequenceCancelled.ok, "cancelled the fixture");
const seqCancelled = await feedSequence();
check(
  seqCancelled !== null && seqPublished !== null && seqCancelled > seqPublished,
  `the cancellation outranks the published sequence (${seqPublished} -> ${seqCancelled})`,
);

const sequenceRestored = await eventsService.publishEvent(sequenceActor, sequenceFixtureId);
check(sequenceRestored.ok, "restored the fixture");
const seqRestored = await feedSequence();
check(
  seqRestored !== null && seqCancelled !== null && seqRestored > seqCancelled,
  `the restore outranks the cancellation (${seqCancelled} -> ${seqRestored})`,
);

// Clean up: notifications first (their eventId is nulled by the cascade), then
// the audit rows this fixture wrote, then the event itself, so the closing counts
// match the baseline captured before anything ran.
await prisma.notification.deleteMany({ where: { eventId: sequenceFixtureId } });
await prisma.auditLog.deleteMany({ where: { entityId: sequenceFixtureId } });
await prisma.calendarEvent.delete({ where: { id: sequenceFixtureId } });
check(
  (await prisma.calendarEvent.findUnique({ where: { id: sequenceFixtureId } })) === null,
  "the fixture was removed",
);

  // =========================================================================
  section("15. Final database state");
  // =========================================================================

  const counts = {
    users: await prisma.user.count(),
    events: await prisma.calendarEvent.count(),
    revisions: await prisma.eventRevision.count(),
    notifications: await prisma.notification.count(),
    subscriptions: await prisma.subscription.count(),
    auditLogs: await prisma.auditLog.count(),
    sessions: await prisma.academicSession.count(),
    categories: await prisma.eventCategory.count(),
  };

  for (const [key, value] of Object.entries(counts)) {
    check(value === baseline[key as keyof typeof baseline], `${key} restored (${value})`);
  }

  const byStatus = await prisma.calendarEvent.groupBy({ by: ["status"], _count: true });
  const subscriptionsList = await prisma.subscription.findMany({
    select: { user: { select: { email: true } }, icsToken: true },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n  Final database state:");
  console.log(`    users: ${counts.users}`);
  console.log(
    `    events: ${counts.events} (${byStatus
      .map((row) => `${row.status}: ${row._count}`)
      .join(", ")})`,
  );
  console.log(`    subscriptions: ${counts.subscriptions}`);
  for (const subscription of subscriptionsList) {
    console.log(`      ${subscription.user.email} -> ${subscription.icsToken}`);
  }
  console.log(`    audit rows: ${counts.auditLogs}`);
}

// Captured before anything runs, so the closing checks compare like with like.
const baseline = {
  users: await prisma.user.count(),
  events: await prisma.calendarEvent.count(),
  revisions: await prisma.eventRevision.count(),
  notifications: await prisma.notification.count(),
  subscriptions: await prisma.subscription.count(),
  auditLogs: await prisma.auditLog.count(),
  sessions: await prisma.academicSession.count(),
  categories: await prisma.eventCategory.count(),
};

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
