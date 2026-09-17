import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { approveEvent } from "@/lib/services/events";

export const dynamic = "force-dynamic";

/**
 * Event Approval REST API (FR13).
 *
 * PATCH: Approves a pending departmental submission and publishes it to the calendar.
 */
export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json(
      { ok: false, error: "Administrator privileges required to approve events." },
      { status: 403 },
    );
  }

  const { id } = await props.params;

  try {
    let note: string | undefined;
    try {
      const body = await request.json();
      note = body.note;
    } catch {
      // Body is optional
    }

    const actor = { id: user.id, role: user.role };
    const result = await approveEvent(actor, id, note);

    if (!result.ok) {
      return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Event approved and published to academic calendar.",
      data: result.data,
    });
  } catch (error) {
    console.error("PATCH /api/events/[id]/approve error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error during event approval." },
      { status: 500 },
    );
  }
}
