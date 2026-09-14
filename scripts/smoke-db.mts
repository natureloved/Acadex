import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

async function main() {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const session = await prisma.academicSession.findFirst({
    where: { isActive: true },
    select: { name: true, startDate: true, endDate: true },
  });
  const events = await prisma.calendarEvent.count();
  const published = await prisma.calendarEvent.count({ where: { status: "PUBLISHED" } });
  const users = await prisma.user.count();

  console.log("active session:", JSON.stringify(session));
  console.log("calendarEvent total:", events, "| published:", published, "| users:", users);

  await prisma.$disconnect();
  console.log("DB smoke test OK");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
