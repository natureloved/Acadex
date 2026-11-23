/**
 * Session tokens signing and verification only.
 *
 * This module is deliberately free of `next/headers` and of Prisma so that it
 * can be imported from `proxy.ts` (which runs before the app, outside the React
 * render) as well as from server components and server actions.
 *
 * The session is a signed JWT (JWS, HS256) stored in an httpOnly cookie. It is
 * *signed*, not encrypted: it carries only an id, name, email and role, none of
 * which are secret. Every authorisation decision is still re-checked against
 * the database in `lib/auth.ts` the token is a hint, never the source of
 * truth.
 */
import { jwtVerify, SignJWT } from "jose";

import { isRole, type Role } from "@/lib/constants";

export const SESSION_COOKIE_NAME = "acadex_session";

/** How long a session stays valid. */
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  /** User id (also mirrored into the standard `sub` claim). */
  userId: string;
  email: string;
  name: string;
  role: Role;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Copy .env.example to .env and set a long random value.",
    );
  }

  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Verify a session cookie and return its payload, or `null` if the token is
 * absent, malformed, expired, or signed with a different secret.
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.sub !== "string" || !isRole(payload.role)) {
      return null;
    }

    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "",
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/** Expiry date handed to `cookies().set()` so the cookie and JWT agree. */
export function sessionExpiryDate(): Date {
  return new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
}

/**
 * Cookie attributes. `httpOnly` keeps the token away from JavaScript (so an XSS
 * bug cannot steal it), `sameSite: "lax"` blocks cross-site POSTs while keeping
 * normal navigation working, and `secure` is enabled in production only so that
 * plain-HTTP local development still works.
 */
export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}
