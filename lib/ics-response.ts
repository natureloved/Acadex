/**
 * HTTP response helper for the `.ics` routes.
 *
 * Kept apart from `lib/services/ics.ts` so that the builder stays framework-free
 * (and testable from `tsx`), while the wire details content type, caching and
 * filename are written once for all three feed routes.
 */
import { NextResponse } from "next/server";

/**
 * A calendar response.
 *
 * `Cache-Control: public, max-age=900` matches the `PT1H`/15-minute refresh
 * window the feed advertises: clients and any proxy in between may reuse the
 * response for 15 minutes, which keeps a popular feed from re-querying SQLite on
 * every poll by every subscriber. The token is part of the URL, so the cached
 * response is scoped to exactly one subscriber.
 */
export function icsResponse(
  body: string,
  options: { filename: string; disposition?: "inline" | "attachment" },
): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=900",
      "Content-Disposition": `${options.disposition ?? "inline"}; filename="${options.filename}"`,
    },
  });
}

/** A 404 that is not cached, for an unknown or revoked feed token. */
export function icsNotFound(message = "Not found"): NextResponse {
  return new NextResponse(message, {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Turn a title or name into a safe download filename.
 *
 * Anything outside `[a-z0-9]` collapses to a hyphen, so a title containing a
 * quote, a slash or a newline cannot break out of the `Content-Disposition`
 * header.
 */
export function icsFilename(value: string, fallback = "acadex-calendar"): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  return `${slug || fallback}.ics`;
}
