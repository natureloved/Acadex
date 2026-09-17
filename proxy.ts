/**
 * Route protection (Next.js 16 "proxy" convention : the file formerly known as
 * middleware.ts).
 *
 * This is a fast, coarse gate: it decodes the session cookie and blocks
 * obviously unauthorised traffic before a route renders. It is deliberately not
 * the only check : every protected page and server action additionally calls
 * `requireUser()` / `requireRole()` from lib/auth.ts, because a matcher change
 * or a server function reached from a different path would otherwise silently
 * lose its protection.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    // Remember where they were headed so login can send them back.
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isStaffArea = pathname === "/staff" || pathname.startsWith("/staff/");

  const allowed =
    (isAdminArea && session.role === "ADMIN") ||
    (isStaffArea && (session.role === "ADMIN" || session.role === "STAFF")) ||
    (!isAdminArea && !isStaffArea);

  if (!allowed) {
    const forbiddenUrl = new URL("/calendar", request.url);
    forbiddenUrl.searchParams.set("error", "forbidden");
    return NextResponse.redirect(forbiddenUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/staff/:path*",
    "/calendar",
    "/calendar/:path*",
    "/notifications",
    "/notifications/:path*",
  ],
};
