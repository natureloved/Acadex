import { LandingPage } from "@/components/landing/landing-page";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Acadex : Academic Calendar Management, beautifully run",
  description:
    "Acadex helps registrars, deans, and departments draft, approve, and publish academic calendars : semesters, exams, holidays, and registration windows : so everyone sees the same, current dates.",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  return (
    <LandingPage
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
