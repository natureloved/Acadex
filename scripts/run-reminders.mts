/**
 * Run the reminder job without HTTP.
 *
 * Run with:  npx tsx scripts/run-reminders.mts        (or `npm run reminders`)
 *
 * This is the same job the `/api/reminders/run` route exposes, called directly:
 * a scheduler that would rather run a process than make a request (Windows Task
 * Scheduler, cron, a systemd timer) uses this, and so does a human who wants to
 * see what the job would do.
 *
 * Exit status is 0 when the run completed and non-zero when it failed, because a
 * scheduler that cannot tell success from failure is worse than no scheduler
 * and that is exactly the failure that a stale calendar would be blamed for.
 *
 * Optional: `--now=YYYY-MM-DD` runs the job as if that were today (UTC). It exists
 * to demonstrate and rehearse the job the seeded calendar has nothing due on
 * most days, so without it "the reminders went out" is hard to show. Nothing else
 * changes: the same events, the same audience, the same dedupe rule.
 */
import { readFileSync } from "node:fs";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

// tsx does not load .env, so read it the way the app does.
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const { prisma } = await import("../lib/db");
const { generateDueReminders } = await import("../lib/services/notifications");

/** `--now=2026-09-15` -> 2026-09-15T00:00:00Z, or undefined for "right now". */
function parseNow(argv: string[]): Date | undefined {
  const flag = argv.find((arg) => arg.startsWith("--now="));
  if (!flag) return undefined;

  const value = flag.slice("--now=".length).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`--now expects YYYY-MM-DD, got "${value}".`);
  }

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (Number.isNaN(date.getTime())) {
    throw new Error(`--now is not a real date: "${value}".`);
  }
  return date;
}

try {
  const now = parseNow(process.argv.slice(2));

  console.log("Running the Acadex reminder job...");
  console.log(`  as of: ${(now ?? new Date()).toISOString()}`);

  const summary = await generateDueReminders(now ? { now } : {});

  console.log("");
  console.log(`  7-day reminders created:  ${summary.t7}`);
  console.log(`  1-day reminders created:  ${summary.t1}`);
  console.log(`  already sent (skipped):   ${summary.skipped}`);
  console.log(`  events on a horizon:      ${summary.considered}`);
  console.log(`  audit entry:              ${summary.auditLogId}`);
  console.log("");
  console.log(
    summary.t7 + summary.t1 === 0 && summary.skipped === 0
      ? "Nothing was due today."
      : "Done. Re-running now would create nothing: a reminder is written at most once per person, event and horizon.",
  );
} catch (error) {
  console.error("REMINDER RUN FAILED:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
