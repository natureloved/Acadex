import { NextResponse } from "next/server";

import { checkIntervalConflict } from "@/lib/services/events";

export const dynamic = "force-dynamic";

/**
 * Figure 5.3 Interval-Overlap Scheduling Conflict Detection API.
 *
 * Checks whether a proposed date/time interval clashes with existing events
 * booked in the same institutional venue.
 *
 * Overlap condition:
 * (startA < endB) AND (startB < endA)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      venueId,
      startDatetime,
      endDatetime,
      startDate,
      endDate,
      startTime,
      endTime,
      excludeEventId,
    } = body;

    const start =
      startDatetime ||
      (startDate
        ? startTime
          ? `${startDate}T${startTime}:00Z`
          : `${startDate}T00:00:00Z`
        : null);

    const end =
      endDatetime ||
      (endDate
        ? endTime
          ? `${endDate}T${endTime}:00Z`
          : `${endDate}T23:59:59Z`
        : null);

    if (!start || !end) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "startDatetime and endDatetime (or startDate and endDate) are required.",
        },
        { status: 400 },
      );
    }

    const result = await checkIntervalConflict({
      venueId: venueId || undefined,
      startDatetime: start,
      endDatetime: end,
      excludeEventId,
    });

    return NextResponse.json({
      ok: true,
      hasConflict: result.hasConflict,
      conflictCount: result.conflicts.length,
      algorithm: "Figure 5.3 (startA < endB && startB < endA)",
      conflicts: result.conflicts,
    });
  } catch (error) {
    console.error("POST /api/events/check-conflict error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to evaluate schedule conflict." },
      { status: 500 },
    );
  }
}
