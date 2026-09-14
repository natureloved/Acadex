"use server";

/**
 * Authentication server actions.
 *
 * Every action re-validates its own input: a server action is a public HTTP
 * endpoint, so the HTML form's `required` attributes and the proxy's route
 * matcher are conveniences, not security boundaries.
 *
 * Note the shape of these functions — `redirect()` throws (Next.js signals a
 * redirect with a special error), so it is always called *outside* try/catch.
 */
import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/auth";
import type { AuthErrorCode } from "@/lib/auth-messages";
import { isRole, LEVELS } from "@/lib/constants";
import { authenticate } from "@/lib/credentials";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  sessionExpiryDate,
  signSession,
} from "@/lib/session";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

/** Issue the session cookie for a freshly authenticated user. */
async function startSession(user: {
  id: string;
  name: string;
  email: string;
  role: string;
}) {
  if (!isRole(user.role)) {
    throw new Error(`User ${user.id} has an unrecognised role: ${user.role}`);
  }

  const token = await signSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(sessionExpiryDate()));
}

// ---------------------------------------------------------------------------
// Log in
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData): Promise<void> {
  const email = text(formData, "email");
  const password = String(formData.get("password") ?? "");
  const next = safeInternalPath(formData.get("next"));

  if (!email || !password) {
    redirect(`/login?error=missing&next=${encodeURIComponent(next)}`);
  }

  const user = await authenticate(email, password);

  if (!user) {
    await prisma.auditLog.create({
      data: {
        action: "LOGIN_FAILED",
        entity: "User",
        metaJson: JSON.stringify({ email }),
      },
    });
    redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  await startSession(user);

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "LOGIN_SUCCEEDED",
      entity: "User",
      entityId: user.id,
      metaJson: JSON.stringify({ role: user.role }),
    },
  });

  redirect(next);
}

// ---------------------------------------------------------------------------
// Register (students only, always)
// ---------------------------------------------------------------------------

export async function registerAction(formData: FormData): Promise<void> {
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const departmentId = text(formData, "departmentId");
  const levelRaw = text(formData, "level");

  const fail = (code: AuthErrorCode): never => {
    redirect(`/register?error=${code}`);
  };

  if (!name || !email || !password) fail("invalid_input");
  if (password !== confirmPassword) fail("password_mismatch");
  if (validatePasswordStrength(password)) fail("weak_password");
  if (!email.includes("@")) fail("invalid_input");

  const level = Number.parseInt(levelRaw, 10);
  if (!LEVELS.includes(level as (typeof LEVELS)[number])) fail("invalid_input");

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) fail("email_taken");

  // The department is looked up rather than trusted: the faculty is derived from
  // it, so a crafted POST cannot attach a student to a mismatched
  // faculty/department pair.
  const department = departmentId
    ? await prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, facultyId: true },
      })
    : null;

  if (departmentId && !department) fail("invalid_input");

  const passwordHash = await hashPassword(password);

  // Self-registration ALWAYS creates a STUDENT. The role is hard-coded here and
  // never read from the submitted form, so nobody can register themselves as an
  // administrator by editing the request.
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "STUDENT",
      facultyId: department?.facultyId ?? null,
      departmentId: department?.id ?? null,
      level,
    },
    select: { id: true, name: true, email: true, role: true },
  });

  // Every account gets an ICS subscription token so it can subscribe to the
  // calendar from Google Calendar or Outlook.
  await prisma.subscription.create({
    data: { userId: user.id, icsToken: randomUUID().replaceAll("-", "") },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "USER_REGISTERED",
      entity: "User",
      entityId: user.id,
      metaJson: JSON.stringify({ role: "STUDENT", level }),
    },
  });

  await startSession(user);

  redirect("/calendar?welcome=1");
}

// ---------------------------------------------------------------------------
// Log out
// ---------------------------------------------------------------------------

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/");
}
