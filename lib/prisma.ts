/**
 * Server-only entry point for the Prisma client.
 *
 * The client itself is created in `lib/db.ts` so that plain Node scripts can
 * use it too. Importing *this* module from a client component is a build-time
 * error, which is the point: no database handle can leak into the browser
 * bundle.
 */
import "server-only";

export { prisma } from "@/lib/db";
