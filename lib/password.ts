/**
 * Password hashing.
 *
 * bcryptjs is a pure-JavaScript implementation of bcrypt, chosen deliberately:
 * the `bcrypt` package needs node-gyp to build a native addon, and this machine
 * has no C++ build toolchain.
 */
import bcrypt from "bcryptjs";

/** Cost factor. 12 is a reasonable 2020s default for a server-side app. */
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await bcrypt.compare(plain, passwordHash);
  } catch {
    // A malformed hash in the database must read as "wrong password", not as a
    // 500 error that leaks which accounts exist.
    return false;
  }
}

/**
 * Minimum password policy, enforced on registration and reused by the seed so
 * demo accounts satisfy the same rules a real student would.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (!/[A-Za-z]/.test(password)) {
    return "Password must contain at least one letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  return null;
}
