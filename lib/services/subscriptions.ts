/**
 * Calendar subscription service.
 *
 * A subscription is the "secret iCal address" pattern: the URL contains a random
 * token and *is* the credential, because calendar clients (Google, Outlook,
 * Apple) cannot present a login form. Everything about this module follows from
 * that:
 *
 *  - the token is long, random and unguessable, and issuing or rotating one is
 *    the only way to change who can read a personal feed;
 *  - rotating invalidates the previous URL immediately, which is the user's
 *    remedy if the address leaks;
 *  - a rotation is an auditable event, but the token value itself is never
 *    written to the audit log — logging a secret defeats the point of being
 *    able to rotate it.
 *
 * Framework-free (no `next/*`), so `scripts/verify-phase4.mts` can rotate a real
 * token, check the URLs, and put the original value back.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "../db";
import type { Role } from "../constants";
import {
  fail,
  succeed,
  writeAudit,
  type Actor,
  type ServiceResult,
} from "./shared";

/**
 * 24 random bytes -> 48 hex characters. Guessing one is not a practical attack,
 * and it survives being pasted into a calendar client without URL escaping.
 */
const TOKEN_BYTES = 24;

/** The `.ics` suffix is part of the URL, not of the token. */
const ICS_SUFFIX = ".ics";

export type SubscriptionRecord = {
  id: string;
  userId: string;
  icsToken: string;
  createdAt: Date;
};

/**
 * The subscriber behind a token: exactly the fields the audience rule needs
 * (`canViewEvent`), read fresh from the database on every feed request so that a
 * faculty transfer or a deactivation takes effect on the next poll.
 */
export type FeedSubscriber = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  facultyId: string | null;
  departmentId: string | null;
  level: number | null;
};

export function generateIcsToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** Strip the optional `.ics` suffix and surrounding whitespace from a URL token. */
export function normaliseToken(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.toLowerCase().endsWith(ICS_SUFFIX)
    ? trimmed.slice(0, -ICS_SUFFIX.length)
    : trimmed;
}

/**
 * The user's subscription, created on first visit to /subscribe.
 *
 * Seeded users already have a row, but accounts created before the feature
 * existed (or by the seed script of an earlier phase) do not — hence the create
 * branch. Two concurrent requests can both miss the `findUnique`, so the unique
 * constraint on `userId` is treated as "someone else just created it" rather
 * than as an error.
 */
export async function getOrCreateSubscription(userId: string): Promise<SubscriptionRecord> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing;

  try {
    return await prisma.subscription.create({
      data: { userId, icsToken: generateIcsToken() },
    });
  } catch {
    const raced = await prisma.subscription.findUnique({ where: { userId } });
    if (raced) return raced;
    throw new Error(`Could not create a calendar subscription for user ${userId}.`);
  }
}

/**
 * Resolve a feed token to the person it belongs to, or `null` when the token is
 * unknown or the account has been deactivated.
 *
 * Deactivation matters: the feed route is public, so an account that has been
 * switched off must stop leaking events to whoever still holds the URL.
 */
export async function resolveFeedToken(
  rawToken: string,
): Promise<{ subscription: SubscriptionRecord; subscriber: FeedSubscriber } | null> {
  const token = normaliseToken(rawToken);
  if (token.length === 0) return null;

  const subscription = await prisma.subscription.findUnique({
    where: { icsToken: token },
    select: {
      id: true,
      userId: true,
      icsToken: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          facultyId: true,
          departmentId: true,
          level: true,
        },
      },
    },
  });

  if (!subscription || !subscription.user.isActive) return null;

  return {
    subscription: {
      id: subscription.id,
      userId: subscription.userId,
      icsToken: subscription.icsToken,
      createdAt: subscription.createdAt,
    },
    subscriber: {
      userId: subscription.user.id,
      name: subscription.user.name,
      email: subscription.user.email,
      role: subscription.user.role as Role,
      facultyId: subscription.user.facultyId,
      departmentId: subscription.user.departmentId,
      level: subscription.user.level,
    },
  };
}

/**
 * Issue a new token for `userId`, invalidating the old URL.
 *
 * A user may only rotate their own feed: the token is a bearer credential for
 * that person's audience, so letting one account mint or revoke another's would
 * be a privilege-escalation hole. The rewrite and the audit row commit together
 * — a rotation that happened but was not recorded would be exactly the kind of
 * silent change the rest of Acadex works hard to avoid.
 */
export async function rotateSubscriptionToken(
  actor: Actor,
  userId: string = actor.id,
): Promise<ServiceResult<{ icsToken: string }>> {
  if (actor.id !== userId) {
    return fail("You can only regenerate the subscription address for your own account.");
  }

  const existing = await getOrCreateSubscription(userId);
  const icsToken = generateIcsToken();

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: existing.id }, data: { icsToken } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "SUBSCRIPTION_TOKEN_ROTATED",
      entity: "Subscription",
      entityId: existing.id,
      // Deliberately no token values: the old one is now useless and the new one
      // must not live anywhere but the subscription row.
      meta: { userId, previousTokenRevoked: true },
    });
  });

  return succeed({ icsToken });
}
