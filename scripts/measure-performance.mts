/**
 * Performance measurement.
 *
 * Run with:  npx tsx scripts/measure-performance.mts
 *            BASE_URL=http://localhost:3100 npx tsx scripts/measure-performance.mts
 *
 * What this measures, and why each number is here:
 *
 *  - **Response time and page size** for the pages a student actually opens. The
 *    plan's target is a first paint under 2.5 s on a slow mobile connection, and
 *    the honest way to check that is to know how many bytes have to arrive:
 *    at a Nigerian 3G throughput of roughly 400 kbit/s, 25 KB of gzipped HTML is
 *    about 0.5 s of transfer, while 100 KB would be two seconds before React has
 *    even started.
 *  - **A gzipped estimate**, computed here rather than read from a header, because
 *    `next dev` does not compress and `next start` behind no proxy does not
 *    either. Compressing the body gives the number a real deployment would serve.
 *  - **The database query count** for the public calendar's data path, asked of
 *    the running server (see app/api/diagnostics/route.ts). One query per page is
 *    right; one per event would be an N+1, and this is the tripwire for it.
 *
 * Every page is fetched twice: the first request warms the route (in `next dev`
 * the first hit also compiles it), and only the second is measured. Budgets are
 * asserted and the process exits non-zero if any is exceeded.
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

// tsx does not load .env, so read the secret the same way the app does.
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** Budgets. Justified above; deliberately not tightened to the observed values. */
const BUDGETS = {
  htmlBytes: 80 * 1024,
  gzipBytes: 25 * 1024,
  responseMs: 1500,
  calendarQueries: 12,
};

let failures = 0;

const { prisma } = await import("../lib/db");
const { signSession, SESSION_COOKIE_NAME } = await import("../lib/session");

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
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

type Measurement = {
  path: string;
  status: number;
  ms: number;
  bytes: number;
  gzipBytes: number;
  cacheControl: string;
};

async function measure(path: string, cookie?: string): Promise<Measurement> {
  // Typed explicitly: hoisting the ternary into a variable loses the contextual
  // typing that made the inline form assignable to HeadersInit.
  const headers: Record<string, string> = cookie ? { Cookie: cookie } : {};

  // Warm-up: the first hit in `next dev` compiles the route.
  await fetch(`${BASE}${path}`, { headers, redirect: "manual" });

  const started = performance.now();
  const response = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  const body = await response.text();
  const ms = performance.now() - started;

  return {
    path,
    status: response.status,
    ms,
    bytes: Buffer.byteLength(body, "utf8"),
    gzipBytes: gzipSync(Buffer.from(body, "utf8")).length,
    cacheControl: response.headers.get("cache-control") ?? "-",
  };
}

async function main(): Promise<void> {
  console.log(`Target: ${BASE}\n`);

  const adminCookie = await mintCookie("admin@acadex.lasu.edu.ng");

  const event = await prisma.calendarEvent.findFirst({
    where: { status: "PUBLISHED" },
    select: { id: true },
    orderBy: { startAt: "asc" },
  });
  if (!event) throw new Error("No published event to link to");

  const targets: { path: string; cookie?: string; budget: boolean }[] = [
    { path: "/", budget: true },
    { path: "/calendar", budget: true },
    { path: `/calendar/${event.id}`, budget: true },
    { path: "/notifications", cookie: adminCookie, budget: true },
    { path: "/ics/public.ics", budget: false },
  ];

  const rows: Measurement[] = [];
  for (const target of targets) {
    rows.push(await measure(target.path, target.cookie));
  }

  console.log(
    "  path".padEnd(46) +
      "status".padEnd(8) +
      "time".padEnd(11) +
      "html".padEnd(11) +
      "gzip",
  );
  for (const row of rows) {
    console.log(
      `  ${row.path}`.padEnd(46) +
        String(row.status).padEnd(8) +
        `${row.ms.toFixed(0)} ms`.padEnd(11) +
        kb(row.bytes).padEnd(11) +
        kb(row.gzipBytes),
    );
    if (row.status !== 200) {
      console.log(`    FAIL  ${row.path} did not return 200`);
      failures += 1;
    }
  }

  const htmlRows = rows.filter((row) => !row.path.endsWith(".ics"));

  const worstHtml = htmlRows.reduce((a, b) => (a.bytes >= b.bytes ? a : b));
  const worstGzip = htmlRows.reduce((a, b) => (a.gzipBytes >= b.gzipBytes ? a : b));
  const worstTime = htmlRows.reduce((a, b) => (a.ms >= b.ms ? a : b));

  console.log("\n  === budgets ===");
  const check = (ok: boolean, message: string) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${message}`);
    if (!ok) failures += 1;
  };

  check(
    worstHtml.bytes <= BUDGETS.htmlBytes,
    `largest HTML is ${kb(worstHtml.bytes)} (${worstHtml.path}) - budget ${kb(BUDGETS.htmlBytes)}`,
  );
  check(
    worstGzip.gzipBytes <= BUDGETS.gzipBytes,
    `largest gzipped page is ${kb(worstGzip.gzipBytes)} (${worstGzip.path}) - budget ${kb(BUDGETS.gzipBytes)}`,
  );
  check(
    worstTime.ms <= BUDGETS.responseMs,
    `slowest response is ${worstTime.ms.toFixed(0)} ms (${worstTime.path}) - budget ${BUDGETS.responseMs} ms`,
  );

  // The data path behind the public calendar, straight from the server process.
  const diagnostics = await fetch(`${BASE}/api/diagnostics`, {
    headers: { Cookie: adminCookie },
    redirect: "manual",
  });

  if (diagnostics.status === 200) {
    const probe = (await diagnostics.json()) as { queries: number; ms: number };
    console.log(
      `\n  public calendar data path: ${probe.queries} queries in ${probe.ms} ms`,
    );
    check(
      probe.queries <= BUDGETS.calendarQueries,
      `${probe.queries} queries for a calendar render - budget ${BUDGETS.calendarQueries}`,
    );
    console.log(
      "  (one query per list, not per event: a rising number here means an N+1 has crept in)",
    );
  } else {
    console.log(
      `\n  diagnostics endpoint returned ${diagnostics.status} - query count not measured`,
    );
    console.log("  (it is development-only and requires an administrator session)");
  }

  const cacheControl = rows.find((row) => row.path.endsWith(".ics"))?.cacheControl;
  console.log(`\n  .ics cache-control: ${cacheControl}`);

  console.log(`\n${failures === 0 ? "all budgets met" : `${failures} budget failure(s)`}`);
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error("\nUNCAUGHT ERROR:", error);
} finally {
  await prisma.$disconnect();
}

process.exitCode = failures > 0 ? 1 : 0;
