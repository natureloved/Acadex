/**
 * Prisma client singleton (framework-free).
 *
 * This lives apart from `lib/prisma.ts` so that plain Node scripts - the smoke
 * test and `scripts/verify-phase3.mts` - can build a real client without
 * tripping the `server-only` guard that application code relies on.
 *
 * The instance is cached on `globalThis` in development because Next.js clears
 * the module registry on every hot reload, which would otherwise open a new
 * database handle on each edit.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "./generated/prisma/client";

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and run `npx prisma migrate dev`.",
    );
  }

  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
