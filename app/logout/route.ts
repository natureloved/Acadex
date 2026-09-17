/**
 * /logout : clears the session cookie and returns to the landing page.
 *
 * The header uses the `logoutAction` server action instead; this route handler
 * exists so that a plain link or a form post to `/logout` also works (useful
 * for a printed link or a quick manual sign-out during a demo).
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/session";

function signOut(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));

  // Delete the cookie on the outgoing response rather than via cookies() so the
  // header is unambiguously attached to this redirect.
  response.cookies.delete(SESSION_COOKIE_NAME);

  return response;
}

export function GET(request: NextRequest) {
  return signOut(request);
}

export function POST(request: NextRequest) {
  return signOut(request);
}
