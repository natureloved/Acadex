import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { generateDueReminders } from "@/lib/services/notifications";

/**
 * The reminder job, callable by a scheduler.
 *
 * `POST` is what a scheduler should use. `GET` exists for manual testing (a
 * `curl -X GET` with the header), and is deliberately no more privileged than the
 * POST : both run the job only for a caller that presents the secret.
 *
 * Three properties matter here, and they are the whole of the security story:
 *
 *  1. **It fails closed.** With `CRON_SECRET` unset the endpoint answers 503 and
 *     runs nothing. A missing configuration must never turn into an open,
 *     unauthenticated job that anyone can trigger.
 *  2. **The comparison is timing-safe.** `timingSafeEqual` compares in constant
 *     time, so an attacker cannot recover the secret byte by byte from response
 *     timings. (The length check is a deliberate exception: it leaks only the
 *     length of the secret, which is not the secret, and it keeps
 *     `timingSafeEqual` from throwing on mismatched buffers.)
 *  3. **The secret is never read from the query string.** URLs end up in access
 *     logs, browser history and `Referer` headers; a credential in one is a
 *     credential published. It comes from `Authorization: Bearer …` (what Vercel
 *     Cron sends) or from `x-cron-secret`.
 */
export const dynamic = "force-dynamic";

/** `node:crypto` is a Node built-in, so the Node runtime is not optional. */
export const runtime = "nodejs";

const SECRET_ENV_VAR = "CRON_SECRET";
const SECRET_HEADER = "x-cron-secret";

/** Pull the credential out of `Authorization: Bearer …`, if it is that shape. */
function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;

  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  // Length is not secret, and comparing buffers of different lengths would throw.
  if (providedBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(providedBytes, expectedBytes);
}

async function runReminders(request: NextRequest): Promise<NextResponse> {
  const expected = process.env[SECRET_ENV_VAR]?.trim();

  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Reminders are not configured on this deployment: set ${SECRET_ENV_VAR} to a long random ` +
          "value, then send it as `Authorization: Bearer <secret>` or `x-cron-secret`.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const provided =
    bearerToken(request.headers.get("authorization")) ??
    request.headers.get(SECRET_HEADER);

  if (!secretMatches(provided, expected)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const summary = await generateDueReminders();

    return NextResponse.json(
      { ok: true, ...summary },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // A scheduler needs a body it can log, not a bare 500 page.
    console.error("Reminder run failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "The reminder run failed.",
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runReminders(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return runReminders(request);
}
