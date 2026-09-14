/**
 * Server-side authorisation helpers (the "data access layer").
 *
 * Every protected page, server action and route handler calls into this module.
 * The role checks live here — next to the data — and not in the UI, so hiding a
 * link is never the only thing standing between a student and an admin action.
 */
import "server-only";

import { cache } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isRole, type Role } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  facultyId: string | null;
  departmentId: string | null;
  level: number | null;
  facultyName: string | null;
  facultyCode: string | null;
  departmentName: string | null;
  departmentCode: string | null;
};

/**
 * Resolve the signed-in user for the current request.
 *
 * The JWT only tells us *who claims to be calling*; the role and the account's
 * active flag are re-read from the database on every request, so demoting or
 * deactivating a user takes effect immediately rather than when their token
 * happens to expire.
 *
 * Wrapped in React's `cache()` so the layout, the page and any nested component
 * share a single database round-trip per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      facultyId: true,
      departmentId: true,
      level: true,
      faculty: { select: { name: true, code: true } },
      department: { select: { name: true, code: true } },
    },
  });

  // A token that no longer maps to a live account is treated as no session at
  // all — this is how deactivation and deletion revoke access.
  if (!user || !user.isActive || !isRole(user.role)) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    facultyId: user.facultyId,
    departmentId: user.departmentId,
    level: user.level,
    facultyName: user.faculty?.name ?? null,
    facultyCode: user.faculty?.code ?? null,
    departmentName: user.department?.name ?? null,
    departmentCode: user.department?.code ?? null,
  };
});

/**
 * Require a signed-in user, or send the visitor to the login page.
 *
 * `nextPath` is echoed back through the `next` query parameter so the user
 * lands where they intended after signing in.
 */
export async function requireUser(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }

  return user;
}

/**
 * Require a signed-in user holding one of `roles`.
 *
 * Anonymous visitors are sent to `/login`; signed-in users with the wrong role
 * are sent to the public calendar with a `forbidden` flag rather than being
 * shown a broken page.
 */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (!roles.includes(user.role)) {
    redirect("/calendar?error=forbidden");
  }

  return user;
}

/** Non-throwing variant, for rendering decisions inside a component. */
export function hasRole(user: CurrentUser | null, ...roles: Role[]): boolean {
  return user !== null && roles.includes(user.role);
}

/**
 * Only allow redirecting to a path inside this site.
 *
 * Without this check, `/login?next=https://evil.example` would turn the login
 * form into an open redirect that lends our domain's credibility to a phishing
 * page.
 */
export function safeInternalPath(value: unknown, fallback = "/calendar"): string {
  if (typeof value !== "string") return fallback;
  // Must be a root-relative path, and must not be protocol-relative ("//host").
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
