import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createVenue, listVenuesForAdmin } from "@/lib/services/venues";

export const dynamic = "force-dynamic";

/**
 * Institutional Venues REST API (FR3, FR9, Table 3.8).
 *
 * GET: Retrieve list of venues and their capacities/locations.
 * POST: Create/register a new institutional venue (Admin only).
 */
export async function GET() {
  try {
    const venues = await listVenuesForAdmin();
    return NextResponse.json({
      ok: true,
      count: venues.length,
      venues,
    });
  } catch (error) {
    console.error("GET /api/venues error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch institutional venues." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json(
      { ok: false, error: "Administrator privileges required to register venues." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const actor = { id: user.id, role: user.role };

    const result = await createVenue(actor, {
      name: body.name,
      code: body.code,
      capacity: body.capacity !== undefined ? Number(body.capacity) : null,
      location: body.location || null,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Institutional venue created successfully.",
        data: result.data,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/venues error:", error);
    return NextResponse.json(
      { ok: false, error: "Invalid request payload for venue creation." },
      { status: 400 },
    );
  }
}
