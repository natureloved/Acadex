import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getEventForViewer, viewerFrom } from "@/lib/events";
import { icsFilename, icsNotFound, icsResponse } from "@/lib/ics-response";
import { buildEventCalendar } from "@/lib/services/ics";

/**
 * "Download this event" : a one-event `.ics` file.
 *
 * Served as an attachment (`Content-Disposition`) because this is a deliberate
 * download rather than a feed: the browser saves it and hands it to the calendar
 * application, which is what a user clicking "Download .ics" expects.
 *
 * The viewer is resolved from the session and the same `getEventForViewer` gate
 * as the detail page is applied, so this route cannot be used to fetch a draft, a
 * staff-only notice or an out-of-audience event by id : it 404s exactly where the
 * page does.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: RouteContext<"/calendar/[id]/ics">) {
  const { id } = await ctx.params;

  const viewer = viewerFrom(await getCurrentUser());
  const event = await getEventForViewer(id, viewer);

  if (!event) return icsNotFound("Event not found");

  return icsResponse(buildEventCalendar(event, { now: new Date() }), {
    filename: icsFilename(`${event.title}-${event.startAt.toISOString().slice(0, 10)}`),
    disposition: "attachment",
  });
}
