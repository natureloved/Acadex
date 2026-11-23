// Prisma CLI configuration (Prisma 7).
// Prisma 7 no longer reads the datasource URL from schema.prisma, and it does
// not load .env automatically hence the explicit `dotenv/config` import.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Run with: npx prisma db seed
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
