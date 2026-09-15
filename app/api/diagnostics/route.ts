import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getQueryCount, resetQueryCount } from "@/lib/db";
import {
  getCategoryOptions,
  getSemesterOptions,
  getSessionOptions,
  listAgenda,
} from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * Development-only measurement endpoint.
 *
 * "How many database queries does one calendar render run?" is the question that
 * catches an accidental N+1 as the project grows, and it cannot be answered from
 * outside the server process - the counter lives in `lib/db.ts`, in this process.
 * So the server answers it about itself.
 *
 * This deliberately does NOT render the page: it runs the same *queries* the page
 * runs, in the same way, and reports what they cost. That keeps it honest about
 * the data layer (which is what an N+1 lives in) without pretending to measure
 * React's render time.
 *
 * Guarded three ways: production returns 404, a non-administrator gets the same
 * 404 rather than a 403 (so an anonymous caller learns nothing about whether the
 * endpoint exists), and nothing here mutates anything.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  resetQueryCount();
  const started = performance.now();

  // Exactly the reads /calendar performs for an anonymous visitor.
  await Promise.all([
    listAgenda({ viewer: null, range: "upcoming" }),
    getSessionOptions(),
    getSemesterOptions(),
    getCategoryOptions(),
  ]);

  const ms = performance.now() - started;

  return NextResponse.json({
    probe: "public-calendar-data",
    queries: getQueryCount(),
    ms: Math.round(ms * 10) / 10,
  });
}
