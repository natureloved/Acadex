import { NextResponse } from "next/server";

import packageJson from "../../../package.json";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Health endpoint for uptime monitoring.
 *
 * It runs a real query against a real table rather than merely opening a
 * connection, so it answers the question an operator actually has - "can this
 * instance serve requests?" - rather than the weaker "is there a socket?". An
 * unapplied migration therefore reports as unhealthy, which is the truth.
 *
 * What it deliberately omits: connection strings, host names, stack traces and
 * error messages. The detail goes to the server log, where an operator can see
 * it and a passer-by cannot.
 *
 * `mode` is included on purpose. It is not a secret - an operator needs to know
 * whether they are looking at a development instance or a deployed one - and
 * `scripts/verify-deployment.mts` uses it to decide which assertions apply
 * (a development instance *should* show the demo credentials; a deployed one
 * must not).
 */
export async function GET() {
  const startedAt = Date.now();

  const base = {
    mode: process.env.NODE_ENV ?? "development",
    version: packageJson.version,
    checkedAt: new Date().toISOString(),
  };

  try {
    const sessions = await prisma.academicSession.count();

    return NextResponse.json(
      {
        ...base,
        ok: true,
        database: "up",
        sessions,
        latencyMs: Date.now() - startedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        ...base,
        ok: false,
        database: "down",
        latencyMs: Date.now() - startedAt,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
