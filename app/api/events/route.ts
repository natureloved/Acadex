import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createEvent, submitDepartmentalEvent, type EventInput } from "@/lib/services/events";

export const dynamic = "force-dynamic";

/**
 * Events REST API (Table 5.2, FR14).
 *
 * GET: Filterable list of academic events (JSON).
 * POST: Create a new calendar event (Admin publishes/drafts; Staff submits pending proposal).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId") || searchParams.get("session");
    const semesterId = searchParams.get("semesterId") || searchParams.get("semester");
    const categorySlug = searchParams.get("category");
    const venueId = searchParams.get("venueId") || searchParams.get("venue");
    const status = searchParams.get("status") ?? "PUBLISHED";
    const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 500);

    const where: Record<string, unknown> = {
      status,
    };

    if (semesterId) {
      where.semesterId = semesterId;
    } else if (sessionId) {
      where.semester = { sessionId };
    }

    if (categorySlug) {
      where.category = { slug: categorySlug };
    }

    if (venueId) {
      where.venueId = venueId;
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        visibility: true,
        scope: true,
        version: true,
        allDay: true,
        startAt: true,
        endAt: true,
        location: true,
        venueId: true,
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
            capacity: true,
            location: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
          },
        },
        semester: {
          select: {
            id: true,
            type: true,
            session: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startAt: "asc" },
      take: limit,
    });

    return NextResponse.json({
      ok: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("GET /api/events error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch calendar events." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required to create calendar events." },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as EventInput & { publish?: boolean };
    const actor = { id: user.id, role: user.role };
    const shouldPublish = body.publish !== false;

    if (user.role === "STAFF") {
      const result = await submitDepartmentalEvent(actor, body);
      if (!result.ok) {
        return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
      }
      return NextResponse.json(
        {
          ok: true,
          status: "PENDING",
          message: "Departmental event submitted for administrative approval.",
          data: result.data,
        },
        { status: 201 },
      );
    }

    if (user.role === "ADMIN") {
      const result = await createEvent(actor, body, { publish: shouldPublish });
      if (!result.ok) {
        return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
      }
      return NextResponse.json(
        {
          ok: true,
          status: shouldPublish ? "PUBLISHED" : "DRAFT",
          message: "Event created successfully.",
          data: result.data,
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Forbidden: insufficient permissions." },
      { status: 403 },
    );
  } catch (error) {
    console.error("POST /api/events error:", error);
    return NextResponse.json(
      { ok: false, error: "Invalid request payload." },
      { status: 400 },
    );
  }
}
