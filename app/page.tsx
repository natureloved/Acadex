import { LandingPage } from "@/components/landing/landing-page";
import { currentSessionLabel } from "@/lib/academic-session";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Acadex : Academic Calendar Management, beautifully run",
  description:
    "Acadex helps registrars, deans, and departments draft, approve, and publish academic calendars : semesters, exams, holidays, and registration windows : so everyone sees the same, current dates.",
};

export default async function HomePage() {
  const user = await getCurrentUser();

  // The front page shows the session the university is actually running.
  // When admin creates next year's session and makes it active, the label
  // on the front page changes with it no code change, no redeploy.
  // If the database is not reachable yet, fall back to the session label
  // computed from today's date (sessions start in September).
  let sessionLabel = currentSessionLabel();
  try {
    const active = await prisma.academicSession.findFirst({
      where: { isActive: true },
      select: { name: true },
    });
    if (active?.name) sessionLabel = active.name;
  } catch {
    // Keep the computed label; the calendar pages surface DB errors.
  }

  return (
    <LandingPage
      sessionLabel={sessionLabel}
      user={
        user
          ? {
              id: user.id,
              name: user.name,
              role: user.role,
            }
          : null
      }
    />
  );
}
