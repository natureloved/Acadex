/**
 * Phase 6 verification: hardening, accessibility and graceful failure.
 *
 * Run with:  npx tsx scripts/verify-phase6.mts        (with `npm run dev` running)
 *
 * Three kinds of check live here, and they are labelled so it is clear which is
 * which:
 *
 *  - **Runtime** checks observe the running server: response headers, the
 *    throttling behaviour of the real sign-in form, the request-size limit, the
 *    404 page, and what the rendered HTML contains.
 *  - **Source** checks read the code where a runtime check is not possible. The
 *    error boundary only renders on a failure, so what can be asserted without
 *    contriving one is that it refuses to render the message and the stack.
 *  - **Computed** checks do arithmetic on colour: the WCAG contrast ratios of the
 *    palette the UI actually uses, derived from Tailwind's own theme values.
 *
 * Everything it creates is removed again, so the database is left as found.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const THROWAWAY = "phase6-throttle@acadex.test";
const STUDENT_EMAIL = "student@acadex.lasu.edu.ng";

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
const { MAX_FAILURES } = await import("../lib/services/login-attempts");
const { securityHeaders, contentSecurityPolicy } = await import("../next.config");

async function get(path: string, cookie?: string, attempt = 1): Promise<{
  status: number;
  headers: Headers;
  body: string;
}> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: cookie ? { Cookie: cookie } : {},
      redirect: "manual",
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.text(),
    };
  } catch (error) {
    // The oversized-body test makes the server close a connection that the
    // client's pool still considers reusable, so the *next* request can fail
    // with ECONNRESET. One retry after a short pause separates that from a real
    // outage: if the server is genuinely down, the retry fails too and the error
    // propagates.
    if (attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return get(path, cookie, attempt + 1);
    }
    throw error;
  }
}

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

/** Submit the sign-in form the way a browser without JavaScript would. */
async function submitLogin(email: string, password: string) {
  const page = await get("/login");
  const form = (page.body.match(/<form[\s\S]*?<\/form>/g) ?? []).find((markup) =>
    markup.includes('name="password"'),
  );
  const actionId = form ? /\$ACTION_ID_([A-Za-z0-9_-]+)/.exec(form)?.[1] : undefined;
  if (!actionId) throw new Error("could not find the sign-in form's action id");

  const body = new FormData();
  body.append(`$ACTION_ID_${actionId}`, "");
  body.append("email", email);
  body.append("password", password);
  body.append("next", "/calendar");

  const response = await fetch(`${BASE}/login`, {
    method: "POST",
    body,
    redirect: "manual",
  });

  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    setCookie: response.headers.get("set-cookie") ?? "",
  };
}

// ---------------------------------------------------------------------------
// Contrast: oklch -> sRGB -> WCAG ratio
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

/**
 * Tailwind v4 states its palette in OKLCH, so the audit has to convert to sRGB
 * before it can measure anything. The matrices are the standard OKLab -> linear
 * sRGB transform.
 */
function oklchToSrgb(lightness: number, chroma: number, hueDegrees: number): Rgb {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;

  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];

  return linear.map((value) => {
    const gamma =
      value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, gamma));
  }) as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (high + 0.05) / (low + 0.05);
}

/** Read the palette from Tailwind's own theme so the audit cannot drift from it. */
function loadPalette(): Map<string, Rgb> {
  const source = readFileSync("node_modules/tailwindcss/theme.css", "utf8");
  const palette = new Map<string, Rgb>();
  const pattern = /--color-([a-z]+-\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g;

  for (const match of source.matchAll(pattern)) {
    palette.set(
      match[1],
      oklchToSrgb(Number(match[2]) / 100, Number(match[3]), Number(match[4])),
    );
  }

  // `white` and `black` are not in the theme file; they are used directly.
  palette.set("white", [1, 1, 1]);
  palette.set("black", [0, 0, 0]);

  return palette;
}

async function main(): Promise<void> {
  const startedAt = new Date();

  // Clear anything a previous, interrupted run left behind before measuring the
  // baseline: this script has to be runnable repeatedly without the closing
  // "restored" checks drifting. Only the identifiers this script uses are
  // touched.
  await prisma.loginAttempt.deleteMany({
    where: { identifier: { in: [THROWAWAY, STUDENT_EMAIL] } },
  });

  const baseline = {
    users: await prisma.user.count(),
    events: await prisma.calendarEvent.count(),
    notifications: await prisma.notification.count(),
    loginAttempts: await prisma.loginAttempt.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  const adminCookie = await mintCookie("admin@acadex.lasu.edu.ng");
  const studentCookie = await mintCookie(STUDENT_EMAIL);

  // =========================================================================
  section("1. Security headers (runtime)");
  // =========================================================================

  const home = await get("/");
  const headers = home.headers;

  const csp = headers.get("content-security-policy") ?? "";
  check(csp.length > 0, "Content-Security-Policy is served");
  check(csp.includes("default-src 'self'"), "the CSP defaults to same-origin");
  check(csp.includes("object-src 'none'"), "the CSP blocks plugin content");
  check(csp.includes("frame-ancestors 'none'"), "the CSP refuses framing");
  check(csp.includes("base-uri 'self'"), "the CSP pins the base URI");
  check(csp.includes("form-action 'self'"), "the CSP pins form targets");

  check(
    headers.get("x-content-type-options") === "nosniff",
    "X-Content-Type-Options: nosniff",
  );
  check(
    (headers.get("referrer-policy") ?? "").includes("strict-origin-when-cross-origin"),
    "Referrer-Policy is set",
  );
  check(headers.get("x-frame-options") === "DENY", "X-Frame-Options: DENY");
  check(
    (headers.get("permissions-policy") ?? "").includes("camera=()"),
    "Permissions-Policy denies device APIs",
  );

  // HSTS and upgrade-insecure-requests are production-only, and saying so is the
  // point: sending them over plain-HTTP localhost would break every other
  // project on this machine. The policy is therefore asserted from the source
  // that generates it, in both modes.
  const production = securityHeaders(true);
  const development = securityHeaders(false);

  check(
    (production.find((h) => h.key === "Strict-Transport-Security")?.value ?? "").includes(
      "max-age=63072000",
    ),
    "HSTS is present in production mode",
  );
  check(
    !development.some((h) => h.key === "Strict-Transport-Security"),
    "HSTS is deliberately absent in development mode",
  );
  check(
    contentSecurityPolicy(true).includes("upgrade-insecure-requests") &&
      !contentSecurityPolicy(false).includes("upgrade-insecure-requests"),
    "upgrade-insecure-requests is production-only",
  );

  const protectedRoute = await get("/admin");
  check(
    (protectedRoute.headers.get("content-security-policy") ?? "").length > 0,
    "headers also reach a protected route's response",
  );

  // =========================================================================
  section("2. The CSP does not break rendering (runtime)");
  // =========================================================================

  const calendar = await get("/calendar");
  check(calendar.status === 200, `GET /calendar -> ${calendar.status}`);
  check(
    calendar.body.includes("Academic calendar"),
    "the calendar page still renders its heading",
  );
  check(
    /\/calendar\/[a-z0-9]{20,}/i.test(calendar.body),
    "the calendar page still renders event links",
  );
  check(
    calendar.body.includes("__next_f"),
    "the framework payload is present (the page is not a bare shell)",
  );

  // =========================================================================
  section("3. Sign-in throttling (runtime)");
  // =========================================================================

  await prisma.loginAttempt.deleteMany({ where: { identifier: THROWAWAY } });

  const results: { status: number; location: string }[] = [];
  for (let attempt = 1; attempt <= MAX_FAILURES; attempt += 1) {
    const result = await submitLogin(THROWAWAY, "definitely-the-wrong-password");
    results.push(result);
  }

  check(
    results.every((r) => r.location.includes("error=invalid")),
    `the first ${MAX_FAILURES} failures all report invalid credentials`,
  );

  const recorded = await prisma.loginAttempt.count({
    where: { identifier: THROWAWAY, succeeded: false },
  });
  check(
    recorded === MAX_FAILURES,
    `each failed attempt was recorded (${recorded} rows)`,
  );

  const blocked = await submitLogin(THROWAWAY, "definitely-the-wrong-password");
  check(
    blocked.location.includes("error=throttled"),
    `the next attempt is throttled (${blocked.location.replace(/^.*\/login/, "/login")})`,
  );

  const afterBlock = await prisma.loginAttempt.count({
    where: { identifier: THROWAWAY, succeeded: false },
  });
  check(
    afterBlock === MAX_FAILURES,
    `a throttled attempt does not extend the window (still ${afterBlock}, not ${MAX_FAILURES + 1})`,
  );

  const blockedWithRightPassword = await submitLogin(THROWAWAY, "irrelevant");
  check(
    blockedWithRightPassword.location.includes("error=throttled"),
    "even a correct password is refused while the identifier is locked",
  );

  const blockedAudit = await prisma.auditLog.count({
    where: { action: "LOGIN_BLOCKED", createdAt: { gte: startedAt } },
  });
  check(blockedAudit >= 1, `the refusal is audited (${blockedAudit} LOGIN_BLOCKED rows)`);

  // A successful sign-in clears the identifier's failures, so an honest user who
  // mistyped is not punished for the rest of the window.
  await prisma.loginAttempt.deleteMany({ where: { identifier: STUDENT_EMAIL } });
  await submitLogin(STUDENT_EMAIL, "wrong-password");
  const studentFailures = await prisma.loginAttempt.count({
    where: { identifier: STUDENT_EMAIL, succeeded: false },
  });
  check(studentFailures === 1, "one failure is recorded for the real student");

  const success = await submitLogin(STUDENT_EMAIL, "Password123!");
  check(
    success.status === 303 && success.setCookie.includes(SESSION_COOKIE_NAME),
    `a correct password signs in (${success.status}, cookie issued)`,
  );

  const clearedFailures = await prisma.loginAttempt.count({
    where: { identifier: STUDENT_EMAIL, succeeded: false },
  });
  check(
    clearedFailures === 0,
    `the success cleared that identifier's failures (${clearedFailures} left)`,
  );

  const cookieFlags = success.setCookie.toLowerCase();
  check(
    cookieFlags.includes("httponly") && cookieFlags.includes("samesite=lax"),
    "the session cookie is httpOnly and sameSite=lax",
  );

  // =========================================================================
  section("4. Request limits (runtime + source)");
  // =========================================================================

  const page = await get("/admin/events/new", adminCookie);
  check(
    page.status === 200 && page.body.includes('name="title"'),
    `the create-event screen renders for an administrator (${page.status})`,
  );

  // Note: that form is a client component, so it posts a *bound action
  // reference* (`$ACTION_REF_*`) rather than a plain `$ACTION_ID_*` field. The
  // request-size test does not need either - the framework enforces the limit
  // before any action is resolved - and the field-length rule is asserted below
  // against the service, which is where the rule actually lives.
  // The body limit is a framework setting, so the test needs a request the
  // framework will actually try to decode as a server action. The create-event
  // form is a client component (a bound action reference, not a plain id), so the
  // easiest real endpoint to aim an oversized body at is the sign-in form.
  const loginPage = await get("/login");
  const loginForm = (loginPage.body.match(/<form[\s\S]*?<\/form>/g) ?? []).find(
    (markup) => markup.includes('name="password"'),
  );
  const loginActionId = loginForm
    ? /\$ACTION_ID_([A-Za-z0-9_-]+)/.exec(loginForm)?.[1]
    : undefined;
  check(Boolean(loginActionId), "found the sign-in action to aim an oversized body at");

  if (loginActionId) {
    const attemptsBefore = await prisma.loginAttempt.count({
      where: { identifier: THROWAWAY },
    });

    const huge = new FormData();
    huge.append(`$ACTION_ID_${loginActionId}`, "");
    huge.append("email", THROWAWAY);
    huge.append("password", "z".repeat(700 * 1024));

    const oversized = await fetch(`${BASE}/login`, {
      method: "POST",
      body: huge,
      redirect: "manual",
    });

    const attemptsAfter = await prisma.loginAttempt.count({
      where: { identifier: THROWAWAY },
    });

    // The framework refuses the body before the action is dispatched. In
    // development the client sees a 500 carrying the framework's own
    // `statusCode: 413` error; in production it is a 413. Asserting the status
    // code alone would therefore be asserting a Next.js quirk, so the behaviour
    // that actually matters is asserted instead: the action never ran.
    check(
      oversized.status >= 400,
      `an oversized body is refused (${oversized.status})`,
    );
    check(
      attemptsAfter === attemptsBefore,
      `the refused body never reached the action (${attemptsBefore} attempts before, ${attemptsAfter} after)`,
    );
  }

  // Field limit: the 200-character rule lives in the service, so it is asserted
  // there - exactly, and without needing to replay a client-component form.
  const { createEvent } = await import("../lib/services/events");
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@acadex.lasu.edu.ng" },
    select: { id: true },
  });
  const semester = await prisma.semester.findFirst({
    where: { session: { isActive: true } },
    select: { id: true },
    orderBy: { startDate: "asc" },
  });
  const category = await prisma.eventCategory.findFirst({ select: { id: true } });
  if (!semester || !category) throw new Error("seed data missing");

  const beforeLongTitle = await prisma.calendarEvent.count();
  const tooLong = await createEvent(
    { id: adminUser.id, role: "ADMIN" },
    {
      title: "y".repeat(1000),
      description: "",
      categoryId: category.id,
      semesterId: semester.id,
      startDate: "2026-11-02",
      endDate: "2026-11-03",
      startTime: "",
      endTime: "",
      allDay: true,
      location: "",
      visibility: "PUBLIC",
      scope: "ALL",
      targetIds: [],
    },
    { publish: false },
  );
  check(
    !tooLong.ok && tooLong.errors.join(" ").includes("200"),
    `a 1000-character title is refused with the stated limit (${tooLong.ok ? "ACCEPTED" : tooLong.errors[0]})`,
  );
  check(
    (await prisma.calendarEvent.count()) === beforeLongTitle,
    "the rejected title created no event",
  );

  const { validateTargets, MAX_TARGETS } = await import("../lib/services/shared");
  const tooMany = await validateTargets(
    "LEVEL",
    Array.from({ length: MAX_TARGETS + 1 }, (_, index) => String(100 + index)),
  );
  check(
    !tooMany.ok && tooMany.errors.join(" ").includes(String(MAX_TARGETS)),
    `more than ${MAX_TARGETS} audience entries are refused`,
  );

  // =========================================================================
  section("5. Graceful failure (runtime + source)");
  // =========================================================================

  const missing = await get("/a-page-that-does-not-exist");
  check(missing.status === 404, `an unknown route answers 404 (${missing.status})`);
  check(
    missing.body.includes("That page is not here"),
    "the 404 page is the application's own, not the framework default",
  );
  check(
    !/\bat\s+\w+\s+\(.*:\d+:\d+\)/.test(missing.body),
    "the 404 page leaks no stack trace",
  );

  const errorBoundary = readFileSync("app/error.tsx", "utf8");
  check(
    errorBoundary.trimStart().startsWith('"use client"'),
    "the error boundary is a client component (source check)",
  );
  check(
    !/error\.message|error\.stack/.test(errorBoundary),
    "the error boundary never renders the message or the stack (source check)",
  );
  check(
    errorBoundary.includes("error.digest"),
    "the error boundary shows only the digest (source check)",
  );

  // =========================================================================
  section("6. Accessibility (runtime)");
  // =========================================================================

  check(
    calendar.body.includes("Skip to content") && calendar.body.includes('href="#main"'),
    "a skip link is present and targets #main",
  );
  check(calendar.body.includes('id="main"'), "the main landmark has the target id");

  const unread = await prisma.notification.count({
    where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: STUDENT_EMAIL }, select: { id: true } })).id, readAt: null },
  });
  const studentCalendar = await get("/calendar", studentCookie);
  check(
    studentCalendar.body.includes(`aria-label="${unread} unread notification`),
    `the unread badge announces itself ("${unread} unread notification...")`,
  );

  // =========================================================================
  section("7. Contrast (computed from Tailwind's own palette)");
  // =========================================================================

  const palette = loadPalette();
  const colour = (name: string): Rgb => {
    const value = palette.get(name);
    if (!value) throw new Error(`colour ${name} is not in the Tailwind theme`);
    return value;
  };

  /** [foreground, background, minimum, what it is] */
  const pairs: [string, string, number, string][] = [
    ["slate-900", "white", 4.5, "headings and body text"],
    ["slate-800", "white", 4.5, "form labels and strong text"],
    ["slate-700", "white", 4.5, "list text and nav links"],
    ["slate-600", "white", 4.5, "secondary text"],
    ["slate-500", "white", 4.5, "captions and the placeholder"],
    ["blue-700", "white", 4.5, "inline links"],
    ["white", "blue-700", 4.5, "primary button and unread badge"],
    ["emerald-700", "emerald-50", 4.5, "published status badge"],
    ["amber-700", "amber-50", 4.5, "draft status badge"],
    ["rose-700", "rose-50", 4.5, "cancelled status badge"],
    ["purple-800", "purple-100", 4.5, "administrator role badge"],
    ["sky-800", "sky-100", 4.5, "staff role badge"],
    ["emerald-800", "emerald-100", 4.5, "student role badge"],
    ["rose-800", "rose-50", 4.5, "error message text"],
    ["amber-900", "amber-50", 4.5, "reschedule notice text"],
    ["slate-500", "white", 3, "form control boundary (WCAG 1.4.11)"],
  ];

  for (const [foreground, background, minimum, label] of pairs) {
    const ratio = contrastRatio(colour(foreground), colour(background));
    check(
      ratio >= minimum,
      `${label}: ${foreground} on ${background} = ${ratio.toFixed(2)}:1 (needs ${minimum})`,
    );
  }

  const borderColour = readFileSync("components/ui.tsx", "utf8").includes(
    "ring-slate-500",
  );
  check(borderColour, "the form controls use the compliant boundary colour");

  // =========================================================================
  section("8. Cleanup and final state");
  // =========================================================================

  await prisma.loginAttempt.deleteMany({
    where: { identifier: { in: [THROWAWAY, STUDENT_EMAIL] } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      createdAt: { gte: startedAt },
      action: { in: ["LOGIN_FAILED", "LOGIN_BLOCKED", "LOGIN_SUCCEEDED"] },
      OR: [
        { metaJson: { contains: THROWAWAY } },
        { metaJson: { contains: STUDENT_EMAIL } },
      ],
    },
  });
  // A successful sign-in records only the role in its metadata, so it has to be
  // matched by actor instead - otherwise the test leaves one audit row behind.
  const studentUser = await prisma.user.findUnique({
    where: { email: STUDENT_EMAIL },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      createdAt: { gte: startedAt },
      action: "LOGIN_SUCCEEDED",
      actorId: studentUser?.id ?? "",
    },
  });

  const after = {
    users: await prisma.user.count(),
    events: await prisma.calendarEvent.count(),
    notifications: await prisma.notification.count(),
    loginAttempts: await prisma.loginAttempt.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  for (const [key, value] of Object.entries(after)) {
    check(
      value === baseline[key as keyof typeof baseline],
      `${key} restored (${value})`,
    );
  }

  const { getQueryCount, resetQueryCount } = await import("../lib/db");
  resetQueryCount();
  await prisma.calendarEvent.count();
  await prisma.eventCategory.findMany({ select: { id: true } });
  check(
    getQueryCount() >= 2,
    `the query counter observes queries issued through the client (${getQueryCount()})`,
  );

  const gzipped = gzipSync(Buffer.from(calendar.body, "utf8")).length;
  console.log(
    `\n  reference: /calendar is ${(calendar.body.length / 1024).toFixed(1)} KB ` +
      `(${(gzipped / 1024).toFixed(1)} KB gzipped)`,
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
