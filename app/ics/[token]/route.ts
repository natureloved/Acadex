import type { NextRequest } from "next/server";

import { listFeedEvents, listPublicFeedEvents, viewerFrom } from "@/lib/events";
import { icsFilename, icsNotFound, icsResponse } from "@/lib/ics-response";
import { buildCalendar } from "@/lib/services/ics";
import { resolveFeedToken } from "@/lib/services/subscriptions";

/**
 * Calendar subscription feeds.
 *
 *   GET /ics/<token>       : one person's feed (the token is the credential)
 *   GET /ics/<token>.ics   : the same thing; the suffix is decoration that makes
 *                            some calendar clients happier about MIME types
 *   GET /ics/public.ics    : the whole-university calendar, no account needed
 *
 * This route is intentionally **public**: no session, and nothing added to the
 * `proxy.ts` matcher : Google Calendar, Outlook and Apple Calendar cannot present
 * a login form, so a session check here would make the feature impossible. The
 * token is the authorisation, and everything it can reach is still filtered by
 * the audience rule in `lib/events.ts`, so a leak of one token exposes exactly
 * one person's calendar and nothing more.
 *
 * Reads are live, never cached by Next: a subscriber must see a reschedule on the
 * next poll rather than whenever a page cache happens to expire. The 15-minute
 * `Cache-Control` header is what bounds the load.
 */
export const dynamic = "force-dynamic";

/** Reserved feed names that do not belong to any user. */
const PUBLIC_TOKENS = new Set(["public", "public.ics"]);

export async function GET(_request: NextRequest, ctx: RouteContext<"/ics/[token]">) {
  const { token } = await ctx.params;
  const requested = token.trim();
  const now = new Date();

  if (PUBLIC_TOKENS.has(requested.toLowerCase())) {
    const events = await listPublicFeedEvents({ now });

    return icsResponse(
      buildCalendar(events, {
        calendarName: "LASU Academic Calendar",
        calendarDescription:
          "Every published whole-university date on the Lagos State University academic calendar, with corrections and cancellations.",
        now,
      }),
      { filename: icsFilename("acadex-university-calendar") },
    );
  }

  const resolved = await resolveFeedToken(requested);

  // An unknown or revoked token is a 404 and nothing more: confirming that a
  // token *exists* but is inactive would help someone enumerate addresses.
  if (!resolved) return icsNotFound("That calendar address is unknown or no longer valid.");

  const events = await listFeedEvents(viewerFrom(resolved.subscriber), { now });

  return icsResponse(
    buildCalendar(events, {
      calendarName: `${resolved.subscriber.name} - LASU Academic Calendar`,
      calendarDescription:
        "Published dates for your faculty, department and level, plus whole-university notices. Corrections and cancellations are applied automatically.",
      now,
    }),
    { filename: icsFilename(`${resolved.subscriber.name}-acadex-calendar`) },
  );
}
