/**
 * HTTP verification: the parts of Phase 3 that only exist over the wire.
 *
 * Run with:  npx tsx scripts/verify-http.mts        (with `npm run dev` running)
 *
 * `scripts/verify-phase3.mts` proves the service layer; this script proves what
 * sits on top of it - proxy gating, authenticated page rendering, the audience
 * model on the public calendar, and the server actions themselves (driven the
 * way a browser with JavaScript disabled would drive them, by posting the
 * form's own `$ACTION_ID_*` field).
 *
 * It mints its own session cookies from the database, so no passwords are typed
 * and nothing has to be clicked. Everything it creates, it deletes again.
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

async function get(path: string, cookie?: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    html: await response.text(),
  };
}

/** Submit one of the page's own forms, exactly as a no-JS browser would. */
async function postForm(
  path: string,
  cookie: string,
  actionId: string,
  fields: Record<string, string>,
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
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

const formsIn = (html: string) => html.match(/<form[\s\S]*?<\/form>/g) ?? [];
const actionIdIn = (form: string) => /\$ACTION_ID_([A-Za-z0-9_-]+)/.exec(form)?.[1] ?? "";
const hiddenValue = (form: string, name: string) =>
  new RegExp(`name="${name}"\\s+value="([^"]+)"`).exec(form)?.[1] ?? "";
const paramsOf = (location: string) => new URLSearchParams(location.split("?")[1] ?? "");

async function main(): Promise<void> {
  section("Server reachable");
  try {
    const home = await get("/");
    check(home.status === 200, `GET / -> ${home.status} (is \`npm run dev\` running?)`);
  } catch {
    console.error(
      `\nCould not reach ${BASE}. Start the dev server first:  npm run dev`,
    );
    process.exitCode = 1;
    return;
  }

  const adminCookie = await mintCookie("admin@acadex.lasu.edu.ng");
  const studentCookie = await mintCookie("student@acadex.lasu.edu.ng");

  section("Anonymous visitors are gated out of the admin area");
  for (const path of [
    "/admin",
    "/admin/events",
    "/admin/events/new",
    "/admin/sessions",
    "/admin/categories",
    "/admin/import",
    "/admin/audit",
  ]) {
    const response = await get(path);
    check(
      response.status === 307 && response.location.includes("/login"),
      `${path} redirects an anonymous visitor to the login page (${response.status})`,
    );
  }

  const studentOnAdmin = await get("/admin/events", studentCookie);
  check(
    studentOnAdmin.status === 307 && studentOnAdmin.location.includes("forbidden"),
    `a signed-in student is sent to the calendar with a forbidden notice (${studentOnAdmin.status})`,
  );

  section("Administrators can open every admin screen");
  for (const path of [
    "/admin",
    "/admin/events",
    "/admin/events/new",
    "/admin/sessions",
    "/admin/categories",
    "/admin/import",
    "/admin/audit",
  ]) {
    const response = await get(path, adminCookie);
    check(response.status === 200, `${path} renders for an admin (${response.status})`);
  }

  section("Audience targeting on the public calendar");
  const wholeUniversity = "Registration for New Students (First Semester)";
  const departmentScoped = "Department of Computer Science Seminar Series";
  const levelScoped = "400 Level Project Defence Orientation";
  const staffOnly = "Faculty of Science Board Meeting";

  const anon = (await get("/calendar?range=all")).html;
  const student = (await get("/calendar?range=all", studentCookie)).html;

  check(anon.includes(wholeUniversity), "anonymous: sees whole-university events");
  check(!anon.includes(departmentScoped), "anonymous: no department-targeted events");
  check(!anon.includes(levelScoped), "anonymous: no level-targeted events");
  check(!anon.includes(staffOnly), "anonymous: no staff-only events");

  check(student.includes(wholeUniversity), "student: still sees whole-university events");
  check(student.includes(departmentScoped), "student: sees their department's events");
  check(student.includes(levelScoped), "student: sees their level's events");
  check(!student.includes(staffOnly), "student: still cannot see staff-only events");

  check(
    !student.includes("Release of First Semester Examination Timetable"),
    "drafts stay invisible in every view",
  );

  section("Server actions over HTTP (create, reject, delete)");
  const page = await get("/admin/sessions", adminCookie);
  const createForm = formsIn(page.html).find((form) => form.includes("new-name"));
  check(Boolean(createForm), "found the add-session form");
  const createAction = createForm ? actionIdIn(createForm) : "";

  const created = await postForm("/admin/sessions", adminCookie, createAction, {
    name: "2099/2100",
    startDate: "2099-09-01",
    endDate: "2100-07-31",
  });
  check(created.status === 303, `createSession -> ${created.status}`);
  check(
    (paramsOf(created.location).get("saved") ?? "").includes("Session created"),
    "the redirect carries the confirmation message",
  );

  const row = await prisma.academicSession.findUnique({
    where: { name: "2099/2100" },
    select: { id: true, isActive: true },
  });
  check(Boolean(row), "the session exists in the database");
  check(row?.isActive === false, "it was created inactive");
  check(
    (await prisma.academicSession.count({ where: { isActive: true } })) === 1,
    "exactly one session is still active",
  );

  const rejected = await postForm("/admin/sessions", adminCookie, createAction, {
    name: "2099/2105",
    startDate: "2099-09-01",
    endDate: "2100-07-31",
  });
  check(
    (paramsOf(rejected.location).get("error") ?? "").includes("consecutively"),
    "a non-consecutive session name is refused",
  );

  const second = await get("/admin/sessions", adminCookie);
  const deleteForm = formsIn(second.html).find(
    (form) => form.includes("Delete") && hiddenValue(form, "sessionId") === row?.id,
  );
  check(Boolean(deleteForm), "found the delete form for the new session");
  const deleteAction = deleteForm ? actionIdIn(deleteForm) : "";

  const removed = await postForm("/admin/sessions", adminCookie, deleteAction, {
    sessionId: row?.id ?? "",
  });
  check(removed.status === 303, `deleteSession -> ${removed.status}`);
  check(
    (await prisma.academicSession.findUnique({ where: { name: "2099/2100" } })) === null,
    "the session is gone again",
  );
  check(
    (await prisma.academicSession.count({ where: { isActive: true } })) === 1,
    "still exactly one active session",
  );
  check(
    (await prisma.calendarEvent.count()) === 30,
    "the event count is untouched (30)",
  );
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
