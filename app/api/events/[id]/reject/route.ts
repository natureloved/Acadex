import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { rejectEvent } from "@/lib/services/events";

export const dynamic = "force-dynamic";

/**
 * Event Rejection REST API (FR13).
 *
 * PATCH: Rejects a pending departmental submission with an administrative reason.
 */
export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json(
      { ok: false, error: "Administrator privileges required to reject events." },
      { status: 403 },
    );
  }

  const { id } = await props.params;

  try {
    const body = await request.json();
    const reason = body?.reason?.trim() || "Event does not meet university academic calendar guidelines.";

    const actor = { id: user.id, role: user.role };
    const result = await rejectEvent(actor, id, reason);

    if (!result.ok) {
      return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Event submission rejected. The submitting staff member has been notified.",
      data: result.data,
    });
  } catch (error) {
    console.error("PATCH /api/events/[id]/reject error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error during event rejection." },
      { status: 500 },
    );
  }
}
