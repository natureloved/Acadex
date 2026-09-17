/**
 * Deployment smoke test.
 *
 * Run with:  BASE_URL=https://your-app.example.com npx tsx scripts/verify-deployment.mts
 *            BASE_URL=http://localhost:3100 npx tsx scripts/verify-deployment.mts
 *
 * Point it at a local production build first (`npm run build && npm run start`),
 * then at the real deployment. It is read-only: every request is a GET and
 * nothing on the target is modified.
 *
 * Two assertions are mode-dependent, and the script works out the target's mode
 * by asking the target itself (`/api/health` reports it) rather than guessing
 * from the URL:
 *
 *  - **HSTS** must be present over HTTPS and absent over plain HTTP. Browsers
 *    ignore Strict-Transport-Security on plain HTTP *except* for localhost, which
 *    they treat as trustworthy - so sending it from a development server would pin
 *    every other local project to HTTPS. The same target therefore must NOT send it
 *    locally, and must send it once deployed.
 *  - **The demo credentials panel** must be visible in development (it is a
 *    deliberate affordance for marking) and absent in production, where it would
 *    be advertising a working administrator password.
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const isHttps = BASE.startsWith("https://");

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

type Fetched = { status: number; headers: Headers; body: string; location: string };

async function get(path: string): Promise<Fetched> {
  const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
    location: response.headers.get("location") ?? "",
  };
}

async function main(): Promise<void> {
  console.log(`Target: ${BASE}`);
  console.log(`Scheme: ${isHttps ? "https (treating as deployed)" : "http (treating as local)"}`);

  // -------------------------------------------------------------------------
  section("1. Health and reachability");
  // -------------------------------------------------------------------------

  const health = await get("/api/health");

  if (health.status !== 200) {
    check(false, `/api/health returned ${health.status}`);
    console.log("\n  Cannot continue without a healthy target.");
    console.log(`  Body: ${health.body.slice(0, 300)}`);
    return;
  }

  let payload: {
    ok?: boolean;
    database?: string;
    mode?: string;
    version?: string;
    latencyMs?: number;
  } = {};
  try {
    payload = JSON.parse(health.body) as typeof payload;
  } catch {
    check(false, "/api/health did not return JSON");
  }

  const mode = payload.mode ?? "unknown";
  const isProduction = mode === "production";

  check(health.status === 200, "the health endpoint answers 200");
  check(payload.ok === true, "health reports ok: true");
  check(payload.database === "up", `health reports the database up (${payload.database})`);
  check(
    health.headers.get("cache-control")?.includes("no-store") === true,
    "the health response is not cached",
  );
  console.log(
    `    mode reported by the target: ${mode} (this drives the mode-dependent checks below)`,
  );
  console.log(
    `    version ${payload.version ?? "?"}, database round-trip ${payload.latencyMs ?? "?"} ms`,
  );
  check(
    !/stack|at \w+ \(|connection string|password/i.test(health.body),
    "the health body leaks no internals",
  );

  // -------------------------------------------------------------------------
  section("2. Public pages");
  // -------------------------------------------------------------------------

  for (const path of ["/", "/calendar", "/login", "/subscribe"]) {
    const page = await get(path);
    check(page.status === 200, `${path} returns 200 (${page.status})`);
  }

  // -------------------------------------------------------------------------
  section("3. The calendar feed is subscribable");
  // -------------------------------------------------------------------------

  const feed = await get("/ics/public.ics");
  check(feed.status === 200, `the public feed returns 200 (${feed.status})`);
  check(
    (feed.headers.get("content-type") ?? "").includes("text/calendar"),
    `the feed is served as text/calendar (${feed.headers.get("content-type") ?? "-"})`,
  );
  check(feed.body.includes("BEGIN:VCALENDAR"), "the feed has a calendar envelope");
  check(feed.body.includes("BEGIN:VEVENT"), "the feed contains at least one event");
  check(
    feed.body.includes("\r\n"),
    "the feed uses CRLF line endings, as RFC 5545 requires",
  );

  // -------------------------------------------------------------------------
  section("4. Private areas refuse anonymous visitors");
  // -------------------------------------------------------------------------

  for (const path of ["/admin", "/notifications"]) {
    const page = await get(path);
    const redirects = page.status === 307 || page.status === 302 || page.status === 303;
    check(
      redirects || page.status === 404,
      `${path} does not serve content to an anonymous visitor (${page.status})`,
    );
  }

  // -------------------------------------------------------------------------
  section("5. Security headers");
  // -------------------------------------------------------------------------

  const home = await get("/");

  check(
    (home.headers.get("content-security-policy") ?? "").includes("default-src 'self'"),
    "Content-Security-Policy is present",
  );
  check(
    home.headers.get("x-content-type-options") === "nosniff",
    "X-Content-Type-Options: nosniff",
  );
  check(
    (home.headers.get("referrer-policy") ?? "").length > 0,
    "Referrer-Policy is present",
  );
  check(
    (home.headers.get("x-frame-options") ?? "").length > 0,
    "X-Frame-Options is present",
  );
  check(
    (home.headers.get("permissions-policy") ?? "").length > 0,
    "Permissions-Policy is present",
  );

  const hsts = home.headers.get("strict-transport-security") ?? "";
  if (isHttps) {
    check(hsts.includes("max-age="), `HSTS is present over https (${hsts || "absent"})`);
  } else {
    check(
      hsts === "",
      `HSTS is absent over plain http (${hsts || "absent"}) - correct, and deliberate`,
    );
  }

  // -------------------------------------------------------------------------
  section("6. The target does not advertise demo credentials");
  // -------------------------------------------------------------------------

  const login = await get("/login");
  const showsDemoPanel = login.body.includes("Demo accounts (seed data)");

  if (mode === "unknown") {
    check(
      false,
      "could not establish the target's mode, so the demo-credentials panel was not judged",
    );
  } else if (isProduction) {
    check(
      !showsDemoPanel,
      "the sign-in page does NOT advertise demo credentials (production)",
    );
  } else {
    check(
      showsDemoPanel,
      "the sign-in page shows demo credentials (development, as intended)",
    );
  }

  console.log(
    `\n${passed} passed, ${failed} failed` +
      (failed === 0 ? " - the target is behaving as a deployment should" : ""),
  );
}

try {
  await main();
} catch (error) {
  failed += 1;
  console.error("\nUNCAUGHT ERROR:", error);
  console.error(`\nIs the target reachable? Base URL: ${BASE}`);
}

process.exitCode = failed > 0 ? 1 : 0;
