import { readFileSync } from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const BASE = process.env.BASE_URL ?? "http://localhost:3002";

const { prisma } = await import("../lib/db");
const { signSession, SESSION_COOKIE_NAME } = await import("../lib/session");

async function mintCookie(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new Error(`No seeded user with email ${email}`);

  const token = await signSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role === "ADMIN" || user.role === "STAFF" ? user.role : "STUDENT",
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function checkUI() {
  console.log("=== Checking Landing Page Buttons ===");

  // 1. Signed out check
  const anonRes = await fetch(`${BASE}/`);
  const anonHtml = await anonRes.text();

  const anonHasSignIn = anonHtml.includes("Sign in");
  const anonHasOpenCalendar = anonHtml.includes("Open Calendar");
  console.log(`Signed out has 'Sign in': ${anonHasSignIn}`);
  console.log(`Signed out has 'Open Calendar': ${anonHasOpenCalendar}`);
  if (!anonHasSignIn || anonHasOpenCalendar) {
    throw new Error("FAIL: Signed out visitor should see 'Sign in' and NOT 'Open Calendar'");
  }
  console.log("  PASS: Anonymous visitor sees 'Sign in' and not 'Open Calendar'");

  // 2. Signed in student check
  const studentCookie = await mintCookie("student@acadex.lasu.edu.ng");
  const studentRes = await fetch(`${BASE}/`, {
    headers: { Cookie: studentCookie },
  });
  const studentHtml = await studentRes.text();

  const studentHasOpenCalendar = studentHtml.includes("Open Calendar");
  console.log(`Signed in has 'Open Calendar': ${studentHasOpenCalendar}`);
  if (!studentHasOpenCalendar) {
    throw new Error("FAIL: Authenticated user should see 'Open Calendar'");
  }
  console.log("  PASS: Authenticated user sees 'Open Calendar'");

  console.log("\nAll UI button tests PASSED!");
}

checkUI().catch((err) => {
  console.error(err);
  process.exit(1);
});
