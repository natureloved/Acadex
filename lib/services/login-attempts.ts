/**
 * Sign-in throttling.
 *
 * The credential form is the only place in Acadex where an attacker can guess a
 * secret, so it is the only place that needs a rate limit. The rule is simple:
 * **five failed attempts for one identifier within fifteen minutes locks that
 * identifier out for the rest of the window.**
 *
 * Three deliberate choices:
 *
 *  - **The record lives in the database, not in memory.** An in-process counter
 *    is cleared by every deploy, crash and `next dev` reload - which is exactly
 *    when an attacker retries. `LoginAttempt` is one row per attempt, indexed by
 *    `(identifier, createdAt)`.
 *  - **The identifier is the email as typed, lowercased, and it is not a foreign
 *    key.** An attempt against an address that does not exist is recorded and
 *    throttled exactly like one that does, so neither the lockout behaviour nor
 *    the response time discloses which accounts are real - which is also why the
 *    refusal message is the same for both.
 *  - **The client address is recorded, never trusted.** `x-forwarded-for` can be
 *    set by the caller unless a trusted proxy overwrites it; it goes into the
 *    audit trail for investigation, while the lockout keys on the identifier.
 *
 * What it does not do: it cannot stop a distributed attack from many addresses
 * against many identifiers, and it is per-process-safe only because SQLite
 * serialises writers. A multi-instance deployment would move the counters to
 * shared storage (Redis, or a Postgres table with the same shape) and add a
 * per-address limit alongside the per-identifier one.
 *
 * Framework-free, so it can be driven from `tsx` and from the server action.
 */
import { prisma } from "../db";

/** Failures allowed inside the window before the identifier is refused. */
export const MAX_FAILURES = 5;

/** How long the window is, in minutes. */
export const WINDOW_MINUTES = 15;

const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

/** How long attempt rows are kept before the opportunistic prune removes them. */
const RETAIN_MS = 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/** The minimum a header reader has to support (`Headers`, `ReadonlyHeaders`). */
export type HeaderReader = { get(name: string): string | null };

/** Emails are compared case-insensitively, so they are stored that way. */
export function normaliseIdentifier(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The client address, as best the framework can tell us.
 *
 * `x-forwarded-for` is a comma-separated list whose left-most entry is the
 * original client; `x-real-ip` is the nginx convention. Truncated to fit the
 * column, because a header is attacker-controlled input.
 */
export function clientIp(headers: HeaderReader): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 45);
  }
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 45) : "unknown";
}

export type LockoutState = {
  locked: boolean;
  /** Failures inside the current window. */
  failures: number;
  /** Seconds until the identifier may try again; 0 when not locked. */
  retryAfterSeconds: number;
};

/** Is this identifier currently locked out, and for how much longer? */
export async function lockoutState(
  identifier: string,
  now: Date = new Date(),
): Promise<LockoutState> {
  const since = new Date(now.getTime() - WINDOW_MS);

  const failures = await prisma.loginAttempt.findMany({
    where: { identifier, succeeded: false, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (failures.length < MAX_FAILURES) {
    return { locked: false, failures: failures.length, retryAfterSeconds: 0 };
  }

  // The window that matters is the failure that keeps the count at the limit:
  // once it ages out, one slot frees up and the next attempt is allowed.
  const blocking = failures[failures.length - MAX_FAILURES];
  const msUntilFree = blocking.createdAt.getTime() + WINDOW_MS - now.getTime();

  return {
    locked: true,
    failures: failures.length,
    retryAfterSeconds: Math.max(1, Math.ceil(msUntilFree / 1000)),
  };
}

/**
 * Record one attempt.
 *
 * A successful sign-in is recorded too - it is what makes the audit trail able
 * to answer "was this account attacked, and did the attacker get in?".
 */
export async function recordLoginAttempt(
  input: { identifier: string; ip: string; succeeded: boolean },
  now: Date = new Date(),
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      identifier: input.identifier,
      ip: input.ip,
      succeeded: input.succeeded,
    },
  });

  await maybePrune(now);
}

/**
 * A successful sign-in clears the identifier's failures.
 *
 * All of them, not just the ones inside the window: proving knowledge of the
 * password invalidates the earlier guesses.
 */
export async function clearFailedAttempts(
  identifier: string,
): Promise<number> {
  const { count } = await prisma.loginAttempt.deleteMany({
    where: { identifier, succeeded: false },
  });
  return count;
}

/** Remove attempt rows that no longer serve any purpose. */
export async function pruneLoginAttempts(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - RETAIN_MS) } },
  });
  return count;
}

/**
 * Prune at most once an hour, from the code path that creates the rows.
 *
 * A scheduled job would be tidier, but the table only grows when someone tries
 * to sign in, so this keeps it bounded without adding a dependency on the
 * reminder scheduler being installed.
 */
let lastPrune = 0;
async function maybePrune(now: Date): Promise<void> {
  if (now.getTime() - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now.getTime();
  await pruneLoginAttempts(now);
}
