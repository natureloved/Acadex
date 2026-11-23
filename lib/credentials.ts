/**
 * Credential verification.
 *
 * Kept separate from `lib/auth.ts` because it needs no request context (no
 * `next/headers`), which makes the login check directly testable from a plain
 * Node script see the verification section of README.md.
 */
import "server-only";

import { isRole, type Role } from "@/lib/constants";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * Check an email/password pair against the database.
 *
 * Returns `null` for every failure mode unknown email, inactive account,
 * wrong password, corrupted hash so callers cannot distinguish "no such user"
 * from "bad password" and enumerate accounts.
 */
export async function authenticate(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const normalisedEmail = email.trim().toLowerCase();
  if (!normalisedEmail || !password) return null;

  const user = await prisma.user.findUnique({
    where: { email: normalisedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,
    },
  });

  if (!user || !user.isActive || !isRole(user.role)) return null;

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
