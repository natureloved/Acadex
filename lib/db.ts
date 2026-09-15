/**
 * Prisma client singleton (framework-free).
 *
 * This lives apart from `lib/prisma.ts` so that plain Node scripts - the smoke
 * test and the `verify-*` scripts - can build a real client without tripping the
 * `server-only` guard that application code relies on.
 *
 * The instance is cached on `globalThis` in development because Next.js clears
 * the module registry on every hot reload, which would otherwise open a new
 * database handle on each edit.
 *
 * The exported client is also a **query counter**. That sounds like an odd thing
 * to put in production code, and the honest answer is that it exists for
 * measurement: "how many queries does one calendar render run?" is the question
 * that catches an accidental N+1 as the project grows, and it cannot be answered
 * from outside the process. The counter is a single integer increment - the cost
 * is a function call per query - and it is read only by the development-only
 * diagnostics endpoint.
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "./generated/prisma/client";

/** Queries this process has run since the counter was last reset. */
let queryCount = 0;

export function resetQueryCount(): void {
  queryCount = 0;
}

export function getQueryCount(): number {
  return queryCount;
}

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

const client: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

/**
 * Count every operation, then hand it to the real client.
 *
 * The wrapper is cast back to `PrismaClient` so that the type every caller sees
 * is unchanged: an extension adds methods, and nothing here needs them. The cast
 * is a deliberate, documented lie about the type rather than a lie about the
 * behaviour - queries really do go through the counter.
 *
 * Note the one blind spot: operations inside `$transaction(callback)` are issued
 * by the transaction object, not by this wrapper, so they are not counted. The
 * measurement endpoint only reads, so the figure it reports is exact.
 */
export const prisma = client.$extends({
  query: {
    $allOperations({ args, query }) {
      queryCount += 1;
      return query(args);
    },
  },
}) as unknown as PrismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}
