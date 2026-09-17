/**
 * Acadex seed script — Lagos State University demo data.
 *
 * Seeds two academic sessions:
 *
 *   • 2025/2026 — the ARCHIVED session. Dates transcribed from LASU's
 *     published calendar and its re-announced one-week extension.
 *   • 2026/2027 — the CURRENT (active) session. Every date in this section
 *     is PROVISIONAL and UNVERIFIED — see the warning block directly above
 *     its event list before trusting or reusing any of them.
 *
 * ===========================================================================
 *  ⚠️  DEMO DATA — VERIFY BEFORE SUBMISSION  ⚠️
 * ===========================================================================
 *  The 2025/2026 dates below were transcribed from LASU's published academic
 *  calendar and from subsequent re-announcements of extensions. The calendar
 *  was revised more than once during the session, and third-party reposts
 *  disagree with each other.
 *
 *  The 2026/2027 dates are placeholders for demonstration: published
 *  reporting on the start of that session is contradictory (31 August 2026,
 *  6 October 2026 and 26 October 2026 have all been stated) and no single
 *  authoritative date could be established.
 *
 *  These dates are SEED / DEMONSTRATION DATA ONLY. They must be re-checked
 *  against the official LASU academic calendar page and the Registry before
 *  this project is submitted or demonstrated. Sources and the verification
 *  instruction are recorded in docs/seed-data-sources.md.
 *
 *  Anything not directly published by LASU (examination windows, the
 *  matriculation and convocation dates, departmental and level-targeted events)
 *  is marked [ASSUMED] at its definition below.
 * ===========================================================================
 *
 * Run with:  npx prisma db seed
 *
 * The seed is idempotent: it clears the calendar tables it owns and rebuilds
 * them, so running it repeatedly always produces the same dataset.
 */
import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

import { PrismaClient } from "../lib/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const adapter =
  url.startsWith("postgres://") || url.startsWith("postgresql://")
    ? new PrismaPg(new Pool({ connectionString: url }))
    : new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

/** Build a UTC-midnight date so stored calendar days never shift by timezone. */
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** All demo accounts share this password. Change before any real deployment. */
const DEMO_PASSWORD = "Password123!";

// ---------------------------------------------------------------------------
// Faculties and departments
// ---------------------------------------------------------------------------

const FACULTIES: {
  name: string;
  code: string;
  departments: { name: string; code: string }[];
}[] = [
  {
    name: "Faculty of Science",
    code: "SCI",
    departments: [
      { name: "Computer Science", code: "CSC" },
      { name: "Mathematics", code: "MTH" },
      { name: "Physics", code: "PHY" },
      { name: "Chemistry", code: "CHM" },
      { name: "Biological Sciences", code: "BIO" },
    ],
  },
  {
    name: "Faculty of Arts",
    code: "ART",
    departments: [
      { name: "English", code: "ENG" },
      { name: "History and International Studies", code: "HIS" },
      { name: "Linguistics, African and European Languages", code: "LIN" },
      { name: "Theatre Arts", code: "THA" },
      { name: "Philosophy", code: "PHL" },
      { name: "Religions and Peace Studies", code: "REL" },
    ],
  },
  {
    name: "Faculty of Social Sciences",
    code: "SOC",
    departments: [
      { name: "Economics", code: "ECO" },
      { name: "Political Science", code: "POS" },
      // Code "SGY" is used to keep the department code distinct from the
      // Faculty of Social Sciences' own "SOC" code.
      { name: "Sociology", code: "SGY" },
      { name: "Geography and Planning", code: "GEO" },
      { name: "Mass Communication", code: "MAS" },
      { name: "Psychology", code: "PSY" },
    ],
  },
  {
    name: "Faculty of Engineering",
    code: "ENG",
    departments: [
      { name: "Mechanical Engineering", code: "MEE" },
      { name: "Electrical and Electronics Engineering", code: "EEE" },
      { name: "Civil Engineering", code: "CVE" },
      { name: "Chemical Engineering", code: "CHE" },
      { name: "Computer Engineering", code: "CPE" },
    ],
  },
  {
    name: "Faculty of Law",
    code: "LAW",
    departments: [
      { name: "Private and Business Law", code: "PBL" },
      { name: "Public Law", code: "PUB" },
    ],
  },
  {
    name: "Faculty of Education",
    code: "EDU",
    departments: [
      { name: "Educational Foundations", code: "EDF" },
      { name: "Educational Management", code: "EDM" },
      { name: "Guidance and Counselling", code: "GCE" },
      { name: "Curriculum Studies", code: "CUS" },
      { name: "Science and Technology Education", code: "STE" },
    ],
  },
  {
    name: "Faculty of Management Sciences",
    code: "MGT",
    departments: [
      { name: "Accounting", code: "ACC" },
      { name: "Business Administration", code: "BUS" },
      { name: "Banking and Finance", code: "BNF" },
      { name: "Industrial Relations and Personnel Management", code: "IRP" },
      { name: "Marketing", code: "MKT" },
      { name: "Public Administration", code: "PAD" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Event categories — each with a distinct hex colour for the calendar chips.
// ---------------------------------------------------------------------------

const CATEGORIES: { name: string; slug: string; color: string }[] = [
  { name: "Registration", slug: "registration", color: "#2563EB" },
  { name: "Lectures", slug: "lectures", color: "#2E8B67" },
  { name: "Examinations", slug: "examinations", color: "#DC2626" },
  { name: "Holidays", slug: "holidays", color: "#D97706" },
  { name: "Break", slug: "break", color: "#0891B2" },
  { name: "Convocation", slug: "convocation", color: "#7C3AED" },
  { name: "Matriculation", slug: "matriculation", color: "#DB2777" },
  { name: "Deadline", slug: "deadline", color: "#EA580C" },
  { name: "Meeting", slug: "meeting", color: "#4B5563" },
];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type SeedEvent = {
  key: string;
  title: string;
  description: string;
  categorySlug: string;
  /**
   * Academic session the event belongs to. Defaults to the archived
   * 2025/2026 session; events in the current 2026/2027 session must set it
   * explicitly because their dates are provisional placeholders.
   */
  session?: "2025/2026" | "2026/2027";
  semester: "FIRST" | "SECOND";
  start: string;
  end: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  visibility?: "PUBLIC" | "STAFF_ONLY";
  scope?: "ALL" | "FACULTY" | "DEPARTMENT" | "LEVEL";
  targets?: { targetType: "FACULTY" | "DEPARTMENT" | "LEVEL"; targetCode?: string; targetLevel?: string }[];
  location?: string;
  venueCode?: string;
  /** Set when the event's dates were moved after first publication. */
  version?: number;
  revisions?: {
    changeType: "CREATED" | "UPDATED" | "PUBLISHED" | "RESCHEDULED" | "CANCELLED";
    changedAt: string;
    note: string;
    before: { startAt: string; endAt: string } | null;
    after: { startAt: string; endAt: string };
  }[];
};

const EVENTS_2025_2026: SeedEvent[] = [
  // ---- First semester -----------------------------------------------------
  {
    key: "registration-new",
    title: "Registration for New Students (First Semester)",
    description:
      "Online registration and document screening for all newly admitted students of the 2025/2026 academic session. Fresh students should complete course registration on the university portal and report to their faculty office for physical verification.",
    categorySlug: "registration",
    semester: "FIRST",
    start: "2025-09-15",
    end: "2025-10-03",
    status: "PUBLISHED",
    location: "University Portal / Faculty Offices, LASU Ojo Campus",
  },
  {
    key: "resumption-returning",
    title: "Resumption and Registration for Returning Students; Lectures Commence",
    description:
      "Returning students resume for the first semester, complete their course registration, and lectures commence across all faculties. Students are advised to complete registration within the stipulated period.",
    categorySlug: "lectures",
    semester: "FIRST",
    start: "2025-10-06",
    end: "2025-12-19",
    status: "PUBLISHED",
    location: "All faculties, LASU Ojo Campus",
  },
  {
    key: "end-of-year-break",
    title: "End-of-Year Break",
    description:
      "End-of-year break for all students and staff. Lectures are suspended and university offices operate on reduced hours.",
    categorySlug: "break",
    semester: "FIRST",
    start: "2025-12-22",
    end: "2026-01-02",
    status: "PUBLISHED",
  },
  {
    key: "matriculation", // [ASSUMED] plausible date — not a published LASU date
    title: "Matriculation Ceremony for 2025/2026 Fresh Students",
    description:
      "Formal matriculation of newly admitted students into Lagos State University for the 2025/2026 academic session. Matriculating students are to be seated by 8:00am in full matriculation dress.",
    categorySlug: "matriculation",
    semester: "FIRST",
    start: "2026-01-14",
    end: "2026-01-14",
    status: "PUBLISHED",
    location: "Makanjuola Auditorium, LASU Ojo Campus",
  },
  {
    key: "exam-timetable-draft",
    title: "Release of First Semester Examination Timetable",
    description:
      "Draft verification of the first semester examination timetable. This entry is intentionally left in DRAFT status to demonstrate the draft/publish workflow — it is not visible on the public calendar until an administrator publishes it.",
    categorySlug: "examinations",
    semester: "FIRST",
    start: "2026-01-05",
    end: "2026-01-05",
    status: "DRAFT",
    location: "Senate Building",
  },
  {
    key: "first-semester-exams", // [ASSUMED] reasonable window inside the published semester
    title: "First Semester Examinations",
    description:
      "First semester examinations for all undergraduate levels. Students must present a valid course registration printout and matriculation number at each examination venue.",
    categorySlug: "examinations",
    semester: "FIRST",
    start: "2026-01-19",
    end: "2026-02-06",
    status: "PUBLISHED",
    location: "Examination halls, LASU Ojo Campus",
  },
  {
    key: "project-defence-orientation", // [ASSUMED] illustration of LEVEL targeting
    title: "400 Level Project Defence Orientation",
    description:
      "Orientation for all 400 level students on project supervision, the defence schedule and the format of the final-year project report.",
    categorySlug: "meeting",
    semester: "FIRST",
    start: "2026-02-10",
    end: "2026-02-10",
    status: "PUBLISHED",
    scope: "LEVEL",
    targets: [{ targetType: "LEVEL", targetLevel: "400" }],
    location: "Faculty of Science Lecture Theatre",
  },
  {
    key: "first-semester-end",
    title: "First Semester Ends",
    description:
      "End of the first semester of the 2025/2026 academic session.",
    categorySlug: "deadline",
    semester: "FIRST",
    start: "2026-02-26",
    end: "2026-02-26",
    status: "PUBLISHED",
  },
  // ---- Second semester ----------------------------------------------------
  {
    key: "second-semester-resumption",
    title: "Second Semester Resumption, Registration and Lectures",
    description:
      "Students resume for the second semester, complete registration, and lectures commence. Lectures run for twelve weeks to 22 May 2026.",
    categorySlug: "lectures",
    semester: "SECOND",
    start: "2026-03-02",
    end: "2026-05-22",
    status: "PUBLISHED",
    location: "All faculties, LASU Ojo Campus",
  },
  {
    key: "senate-results-meeting",
    title: "Senate Meeting: Consideration of First Semester Results",
    description:
      "Senate sits to consider and approve the first semester examination results. Staff only — this entry is restricted so it never appears on the public calendar.",
    categorySlug: "meeting",
    semester: "SECOND",
    start: "2026-03-10",
    end: "2026-03-10",
    status: "DRAFT",
    visibility: "STAFF_ONLY",
    location: "Senate Chamber",
  },
  {
    key: "convocation", // [ASSUMED] plausible date — not a published LASU date
    title: "Convocation Ceremony and Award of Degrees",
    description:
      "Convocation ceremony for the award of first and higher degrees, diplomas and honorary degrees. Graduands should collect their academic gowns from the Faculty Officer ahead of the ceremony.",
    categorySlug: "convocation",
    semester: "SECOND",
    start: "2026-05-13",
    end: "2026-05-15",
    status: "PUBLISHED",
    location: "Makanjuola Auditorium, LASU Ojo Campus",
  },
  {
    key: "second-semester-exams", // [ASSUMED] reasonable window; dates below are the
    // result of two recorded reschedules, which is why the revision history exists
    title: "Second Semester Examinations",
    description:
      "Second semester examinations for all undergraduate levels. This entry carries a revision history because the examination window was shifted twice after it was first approved — see the change history on this event.",
    categorySlug: "examinations",
    semester: "SECOND",
    start: "2026-06-01",
    end: "2026-06-19",
    status: "PUBLISHED",
    version: 3,
    location: "Examination halls, LASU Ojo Campus",
    revisions: [
      {
        changeType: "CREATED",
        changedAt: "2025-09-20",
        note: "Initial examination window approved by Senate.",
        before: null,
        after: { startAt: "2026-05-25", endAt: "2026-06-05" },
      },
      {
        changeType: "RESCHEDULED",
        changedAt: "2026-02-18",
        note: "Shifted by one week so the first semester could be concluded before examinations begin.",
        before: { startAt: "2026-05-25", endAt: "2026-06-05" },
        after: { startAt: "2026-06-01", endAt: "2026-06-12" },
      },
      {
        changeType: "RESCHEDULED",
        changedAt: "2026-04-08",
        note: "Senate-approved one-week extension of the second semester; examinations extended to 19 June 2026.",
        before: { startAt: "2026-06-01", endAt: "2026-06-12" },
        after: { startAt: "2026-06-01", endAt: "2026-06-19" },
      },
    ],
  },
  {
    key: "second-semester-end",
    title: "Second Semester Ends",
    description: "End of the second semester of the 2025/2026 academic session.",
    categorySlug: "deadline",
    semester: "SECOND",
    start: "2026-06-26",
    end: "2026-06-26",
    status: "PUBLISHED",
  },
  {
    key: "sessional-break",
    title: "Sessional Break Commences",
    description:
      "Sessional break commences for the 2025/2026 academic session. This date was moved from 20 July to 27 July 2026 following a one-week extension of the approved academic calendar — see the change history on this event.",
    categorySlug: "break",
    semester: "SECOND",
    start: "2026-07-27",
    end: "2026-07-27",
    status: "PUBLISHED",
    version: 2,
    revisions: [
      {
        changeType: "CREATED",
        changedAt: "2025-09-20",
        note: "Initial sessional break date announced in the approved calendar.",
        before: null,
        after: { startAt: "2026-07-20", endAt: "2026-07-20" },
      },
      {
        changeType: "RESCHEDULED",
        changedAt: "2026-06-10",
        note: "EXTENSION OF APPROVED ACADEMIC CALENDAR BY ONE WEEK: sessional break now commences Monday, 27th July 2026.",
        before: { startAt: "2026-07-20", endAt: "2026-07-20" },
        after: { startAt: "2026-07-27", endAt: "2026-07-27" },
      },
    ],
  },
  // ---- Audience-targeted examples ----------------------------------------
  {
    key: "science-board-meeting", // [ASSUMED] illustration of FACULTY targeting
    title: "Faculty of Science Board Meeting",
    description:
      "Board meeting of the Faculty of Science to consider departmental reports and first semester results. Staff of the faculty only.",
    categorySlug: "meeting",
    semester: "FIRST",
    start: "2025-11-05",
    end: "2025-11-05",
    status: "PUBLISHED",
    visibility: "STAFF_ONLY",
    scope: "FACULTY",
    targets: [{ targetType: "FACULTY", targetCode: "SCI" }],
    location: "Faculty of Science Board Room",
  },
  {
    key: "csc-seminar", // [ASSUMED] illustration of DEPARTMENT targeting
    title: "Department of Computer Science Seminar Series",
    description:
      "Monthly seminar of the Department of Computer Science. Open to all students and staff of the department.",
    categorySlug: "lectures",
    semester: "FIRST",
    start: "2025-11-19",
    end: "2025-11-19",
    status: "PUBLISHED",
    scope: "DEPARTMENT",
    targets: [{ targetType: "DEPARTMENT", targetCode: "CSC" }],
    location: "Computer Science Laboratory",
  },
];

// ===========================================================================
// EVENTS — 2026/2027 academic session (CURRENT)
// ===========================================================================
//
// PROVISIONAL — UNVERIFIED
// ------------------------
// Every date in this section is a PLACEHOLDER FOR DEMONSTRATION ONLY.
//
// As of 14 September 2026, published reporting on the start of LASU's
// 2026/2027 academic session is contradictory. Different sources state:
//
//   • Monday 31 August 2026
//   • Monday 6 October 2026   (note: 6 Oct 2026 is actually a Tuesday)
//   • Monday 26 October 2026
//
// No single authoritative date can be established, and LASU's Senate-approved
// 2026/2027 calendar could not be confirmed from an official source when this
// seed was written. The timeline below is therefore a plausible demonstration
// calendar arranged so the session is "live" today (14 Sep 2026) and the
// upcoming-events and reminder features have data to act on. None of these
// dates should be presented as confirmed.
//
// REPLACE these dates with the official Senate-approved 2026/2027 calendar
// before submission. The conflicting claims and their sources are recorded
// in docs/seed-data-sources.md.
// ===========================================================================

const EVENTS_2026_2027: SeedEvent[] = [
  // ---- First semester (2026/2027) ----------------------------------------
  // Registration opens within a week of today (14 Sep 2026) so the reminder
  // feature has a near-term published event to act on.
  {
    key: "2026-27-registration-new",
    session: "2026/2027",
    title: "First Semester Registration for New Students (2026/2027)",
    description:
      "Online registration and document screening for all newly admitted students of the 2026/2027 academic session. Fresh students should complete course registration on the university portal and report to their faculty office for physical verification.",
    categorySlug: "registration",
    semester: "FIRST",
    start: "2026-09-17",
    end: "2026-10-02",
    status: "PUBLISHED",
    location: "University Portal / Faculty Offices, LASU Ojo Campus",
  },
  {
    key: "2026-27-registration-returning",
    session: "2026/2027",
    title: "Online Course Registration for Returning Students (First Semester)",
    description:
      "Returning students complete their first semester course registration online through the university portal before lectures commence.",
    categorySlug: "registration",
    semester: "FIRST",
    start: "2026-09-21",
    end: "2026-10-09",
    status: "PUBLISHED",
    location: "University Portal",
  },
  {
    key: "2026-27-resumption-lectures",
    session: "2026/2027",
    title: "Resumption and Registration for Returning Students; Lectures Commence",
    description:
      "Returning students resume for the first semester of the 2026/2027 academic session, complete their course registration, and lectures commence across all faculties.",
    categorySlug: "lectures",
    semester: "FIRST",
    start: "2026-10-12",
    end: "2026-12-18",
    status: "PUBLISHED",
    location: "All faculties, LASU Ojo Campus",
  },
  {
    key: "2026-27-end-of-year-break",
    session: "2026/2027",
    title: "End-of-Year Break (2026/2027)",
    description:
      "End-of-year break for all students and staff. Lectures are suspended and university offices operate on reduced hours.",
    categorySlug: "break",
    semester: "FIRST",
    start: "2026-12-21",
    end: "2027-01-01",
    status: "PUBLISHED",
  },
  {
    key: "2026-27-exam-timetable-draft",
    session: "2026/2027",
    title: "Release of First Semester Examination Timetable (2026/2027)",
    description:
      "Draft verification of the first semester examination timetable for the current session. This entry is intentionally left in DRAFT status to demonstrate the draft/publish workflow — it is not visible on the public calendar until an administrator publishes it.",
    categorySlug: "examinations",
    semester: "FIRST",
    start: "2027-01-11",
    end: "2027-01-11",
    status: "DRAFT",
    location: "Senate Building",
  },
  {
    key: "2026-27-matriculation", // [ASSUMED] plausible date — not a published LASU date
    session: "2026/2027",
    title: "Matriculation Ceremony for 2026/2027 Fresh Students",
    description:
      "Formal matriculation of newly admitted students into Lagos State University for the 2026/2027 academic session. Matriculating students are to be seated by 8:00am in full matriculation dress.",
    categorySlug: "matriculation",
    semester: "FIRST",
    start: "2027-01-20",
    end: "2027-01-20",
    status: "PUBLISHED",
    location: "Makanjuola Auditorium, LASU Ojo Campus",
  },
  {
    key: "2026-27-first-semester-exams", // [ASSUMED] reasonable window inside the provisional semester
    session: "2026/2027",
    title: "First Semester Examinations (2026/2027)",
    description:
      "First semester examinations for all undergraduate levels. Students must present a valid course registration printout and matriculation number at each examination venue.",
    categorySlug: "examinations",
    semester: "FIRST",
    start: "2027-01-25",
    end: "2027-02-12",
    status: "PUBLISHED",
    location: "Examination halls, LASU Ojo Campus",
  },
  {
    key: "2026-27-first-semester-end",
    session: "2026/2027",
    title: "First Semester Ends (2026/2027)",
    description: "End of the first semester of the 2026/2027 academic session.",
    categorySlug: "deadline",
    semester: "FIRST",
    start: "2027-02-19",
    end: "2027-02-19",
    status: "PUBLISHED",
  },
  // ---- Second semester (2026/2027) ---------------------------------------
  {
    key: "2026-27-second-semester-resumption",
    session: "2026/2027",
    title: "Second Semester Resumption, Registration and Lectures (2026/2027)",
    description:
      "Students resume for the second semester of the 2026/2027 academic session, complete registration, and lectures commence.",
    categorySlug: "lectures",
    semester: "SECOND",
    start: "2027-03-01",
    end: "2027-05-21",
    status: "PUBLISHED",
    location: "All faculties, LASU Ojo Campus",
  },
  {
    key: "2026-27-senate-results-meeting",
    session: "2026/2027",
    title: "Senate Meeting: Consideration of First Semester Results (2026/2027)",
    description:
      "Senate sits to consider and approve the first semester examination results for the current session. Staff only — this entry is restricted so it never appears on the public calendar.",
    categorySlug: "meeting",
    semester: "SECOND",
    start: "2027-03-09",
    end: "2027-03-09",
    status: "DRAFT",
    visibility: "STAFF_ONLY",
    location: "Senate Chamber",
  },
  {
    key: "2026-27-second-semester-exams", // [ASSUMED] reasonable window inside the provisional semester
    session: "2026/2027",
    title: "Second Semester Examinations (2026/2027)",
    description:
      "Second semester examinations for all undergraduate levels.",
    categorySlug: "examinations",
    semester: "SECOND",
    start: "2027-05-24",
    end: "2027-06-11",
    status: "PUBLISHED",
    location: "Examination halls, LASU Ojo Campus",
  },
  {
    key: "2026-27-convocation", // [ASSUMED] plausible date — not a published LASU date
    session: "2026/2027",
    title: "Convocation Ceremony and Award of Degrees (2026/2027)",
    description:
      "Convocation ceremony for the award of first and higher degrees, diplomas and honorary degrees. Graduands should collect their academic gowns from the Faculty Officer ahead of the ceremony.",
    categorySlug: "convocation",
    semester: "SECOND",
    start: "2027-06-16",
    end: "2027-06-18",
    status: "PUBLISHED",
    location: "Makanjuola Auditorium, LASU Ojo Campus",
  },
  {
    key: "2026-27-second-semester-end",
    session: "2026/2027",
    title: "Second Semester Ends (2026/2027)",
    description: "End of the second semester of the 2026/2027 academic session.",
    categorySlug: "deadline",
    semester: "SECOND",
    start: "2027-06-25",
    end: "2027-06-25",
    status: "PUBLISHED",
  },
  {
    key: "2026-27-sessional-break",
    session: "2026/2027",
    title: "Sessional Break Commences (2026/2027)",
    description:
      "Sessional break commences for the 2026/2027 academic session.",
    categorySlug: "break",
    semester: "SECOND",
    start: "2027-06-28",
    end: "2027-06-28",
    status: "PUBLISHED",
  },
];

/** Combined seed list: the archived session first, then the current one. */
const EVENTS: SeedEvent[] = [...EVENTS_2025_2026, ...EVENTS_2026_2027];

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  // This script DELETES every row before recreating the demo data, and the
  // accounts it creates have a password published in the README. It must never
  // run against a real deployment by accident, so it refuses in production
  // unless it is explicitly told that is what is wanted.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DESTRUCTIVE_SEED !== "1"
  ) {
    console.error(
      [
        "Refusing to seed: NODE_ENV is production.",
        "",
        "This script deletes every row and recreates demo accounts whose",
        "password is published in this repository. If that is genuinely what",
        "you want, re-run with ALLOW_DESTRUCTIVE_SEED=1.",
      ].join("\n"),
    );
    process.exit(1);
  }

  console.log("Seeding Acadex demo data (LASU 2025/2026 archive + 2026/2027 current)...\n");

  // --- Reset, in foreign-key-safe order ------------------------------------
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.eventRevision.deleteMany();
  await prisma.eventTarget.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.eventCategory.deleteMany();
  await prisma.semester.deleteMany();
  await prisma.academicSession.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.faculty.deleteMany();

  // --- Venues / Resources --------------------------------------------------
  const VENUES = [
    { name: "Buba Marwa Auditorium", code: "BMA", capacity: 3000, location: "Main Campus Ojo" },
    { name: "MBA Hall", code: "MBA", capacity: 800, location: "Faculty of Management Sciences" },
    { name: "Faculty of Science Lecture Theatre", code: "SLT", capacity: 500, location: "Faculty of Science Complex" },
    { name: "3-in-1 Lecture Hall", code: "3IN1", capacity: 1200, location: "New Faculty of Education" },
    { name: "University Library Auditorium", code: "ULA", capacity: 250, location: "Fatai Owodunni Library" },
    { name: "Senate Chamber", code: "SC", capacity: 150, location: "Babaginda Senate Building" },
  ];

  const venueIdByCode = new Map<string, string>();
  for (const venue of VENUES) {
    const createdVenue = await prisma.venue.create({ data: venue });
    venueIdByCode.set(venue.code, createdVenue.id);
  }
  console.log(`  venues: ${VENUES.length} (auditoriums, lecture theatres, halls)`);

  // --- Faculties and departments -------------------------------------------
  const departmentIdByCode = new Map<string, string>();
  const facultyIdByCode = new Map<string, string>();

  for (const faculty of FACULTIES) {
    const created = await prisma.faculty.create({
      data: { name: faculty.name, code: faculty.code },
    });
    facultyIdByCode.set(faculty.code, created.id);

    for (const department of faculty.departments) {
      const createdDepartment = await prisma.department.create({
        data: {
          name: department.name,
          code: department.code,
          facultyId: created.id,
        },
      });
      departmentIdByCode.set(department.code, createdDepartment.id);
    }
  }

  console.log(
    `  faculties: ${FACULTIES.length}, departments: ${departmentIdByCode.size}`,
  );

  // --- Users ---------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const admin = await prisma.user.create({
    data: {
      name: "Acadex Administrator",
      email: "admin@acadex.lasu.edu.ng",
      passwordHash,
      role: "ADMIN",
    },
  });

  const staff = await prisma.user.create({
    data: {
      name: "Dr. Folasade Adeniran",
      email: "staff@acadex.lasu.edu.ng",
      passwordHash,
      role: "STAFF",
      facultyId: facultyIdByCode.get("SCI")!,
      departmentId: departmentIdByCode.get("CSC")!,
    },
  });

  const student = await prisma.user.create({
    data: {
      name: "Tunde Balogun",
      email: "student@acadex.lasu.edu.ng",
      passwordHash,
      role: "STUDENT",
      facultyId: facultyIdByCode.get("SCI")!,
      departmentId: departmentIdByCode.get("CSC")!,
      level: 400,
    },
  });

  console.log(`  users: 3 (admin, staff, student) — password "${DEMO_PASSWORD}"`);

  // --- Categories ----------------------------------------------------------
  const categoryIdBySlug = new Map<string, string>();
  for (const category of CATEGORIES) {
    const created = await prisma.eventCategory.create({ data: category });
    categoryIdBySlug.set(category.slug, created.id);
  }
  console.log(`  event categories: ${CATEGORIES.length}`);

  // --- Sessions and semesters ---------------------------------------------
  // Exactly one session is active at a time: 2026/2027 is current, 2025/2026
  // is retained as the archived session (its events, revisions and targeting
  // examples stay intact for the demo).
  const SESSIONS: {
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
    /** Default date for `publishedAt` and the auto CREATED revision. */
    publishedOn: string;
    semesters: { type: "FIRST" | "SECOND"; startDate: string; endDate: string }[];
  }[] = [
    {
      name: "2025/2026",
      startDate: "2025-09-15",
      endDate: "2026-07-27",
      isActive: false,
      publishedOn: "2025-09-20",
      semesters: [
        { type: "FIRST", startDate: "2025-09-15", endDate: "2026-02-26" },
        { type: "SECOND", startDate: "2026-03-02", endDate: "2026-06-26" },
      ],
    },
    {
      // Current session. PROVISIONAL — UNVERIFIED dates; see the warning
      // block above EVENTS_2026_2027.
      name: "2026/2027",
      startDate: "2026-09-17",
      endDate: "2027-06-28",
      isActive: true,
      publishedOn: "2026-08-01",
      semesters: [
        { type: "FIRST", startDate: "2026-09-17", endDate: "2027-02-19" },
        { type: "SECOND", startDate: "2027-03-01", endDate: "2027-06-25" },
      ],
    },
  ];

  const semesterIdByKey = new Map<string, string>();
  const publishedOnBySession = new Map<string, string>();

  for (const session of SESSIONS) {
    const created = await prisma.academicSession.create({
      data: {
        name: session.name,
        startDate: d(session.startDate),
        endDate: d(session.endDate),
        isActive: session.isActive,
      },
    });
    publishedOnBySession.set(session.name, session.publishedOn);

    for (const semester of session.semesters) {
      const createdSemester = await prisma.semester.create({
        data: {
          sessionId: created.id,
          type: semester.type,
          startDate: d(semester.startDate),
          endDate: d(semester.endDate),
        },
      });
      semesterIdByKey.set(`${session.name}:${semester.type}`, createdSemester.id);
    }

    console.log(
      `  academic session: ${session.name} (${session.isActive ? "active" : "archived"}, 2 semesters)`,
    );
  }

  // --- Events, targets and revision history --------------------------------
  const eventIdByKey = new Map<string, string>();
  let publishedCount = 0;
  let draftCount = 0;
  let revisionCount = 0;

  for (const event of EVENTS) {
    const sessionName = event.session ?? "2025/2026";
    const publishedOn = publishedOnBySession.get(sessionName)!;

    const created = await prisma.calendarEvent.create({
      data: {
        title: event.title,
        description: event.description,
        categoryId: categoryIdBySlug.get(event.categorySlug)!,
        semesterId: semesterIdByKey.get(`${sessionName}:${event.semester}`)!,
        startAt: d(event.start),
        endAt: d(event.end),
        allDay: true,
        location: event.location ?? null,
        venueId: event.venueCode ? venueIdByCode.get(event.venueCode) ?? null : null,
        status: event.status,
        visibility: event.visibility ?? "PUBLIC",
        scope: event.scope ?? "ALL",
        createdById: admin.id,
        publishedAt: event.status === "PUBLISHED" ? d(publishedOn) : null,
        version: event.version ?? 1,
      },
    });

    eventIdByKey.set(event.key, created.id);

    if (event.status === "PUBLISHED") publishedCount += 1;
    if (event.status === "DRAFT") draftCount += 1;

    // Audience targeting when the scope is narrower than the whole university.
    for (const target of event.targets ?? []) {
      const targetId =
        target.targetType === "LEVEL"
          ? target.targetLevel!
          : target.targetType === "FACULTY"
            ? facultyIdByCode.get(target.targetCode!)!
            : departmentIdByCode.get(target.targetCode!)!;

      await prisma.eventTarget.create({
        data: {
          eventId: created.id,
          targetType: target.targetType,
          targetId,
        },
      });
    }

    // Revision history. Events with an explicit script get their hand-written
    // history; every other event gets the automatic CREATED (+ PUBLISHED) trail.
    const revisions = event.revisions ?? [
      {
        changeType: "CREATED" as const,
        changedAt: publishedOn,
        note:
          sessionName === "2026/2027"
            ? "Event created from the PROVISIONAL 2026/2027 academic calendar (unverified — see docs/seed-data-sources.md)."
            : "Event created from the approved 2025/2026 academic calendar.",
        before: null,
        after: { startAt: event.start, endAt: event.end },
      },
      ...(event.status === "PUBLISHED"
        ? [
            {
              changeType: "PUBLISHED" as const,
              changedAt: publishedOn,
              note: "Published to the public calendar.",
              before: { startAt: event.start, endAt: event.end },
              after: { startAt: event.start, endAt: event.end },
            },
          ]
        : []),
    ];

    for (const revision of revisions) {
      const before = revision.before
        ? { startAt: d(revision.before.startAt), endAt: d(revision.before.endAt) }
        : null;
      const after = { startAt: d(revision.after.startAt), endAt: d(revision.after.endAt) };

      await prisma.eventRevision.create({
        data: {
          eventId: created.id,
          changedById: admin.id,
          changedAt: d(revision.changedAt),
          changeType: revision.changeType,
          note: revision.note,
          diffJson: JSON.stringify({ before, after }),
        },
      });
      revisionCount += 1;
    }
  }

  console.log(
    `  events: ${EVENTS.length} (${publishedCount} published, ${draftCount} draft), ` +
      `${revisionCount} revision records`,
  );

  // --- Subscriptions (ICS feed tokens) -------------------------------------
  await prisma.subscription.createMany({
    data: [
      { userId: admin.id, icsToken: "demo-ics-admin-8f3a1c9e5b7d4260" },
      { userId: staff.id, icsToken: "demo-ics-staff-2d6e4a7b9c1f5308" },
      { userId: student.id, icsToken: "demo-ics-student-5a9c7e2f4b8d0136" },
    ],
  });

  // --- Notifications about the rescheduled examinations --------------------
  const examsEventId = eventIdByKey.get("second-semester-exams")!;
  const breakEventId = eventIdByKey.get("sessional-break")!;
  // Current-session reminder so the notification centre has live content too.
  const currentRegistrationId = eventIdByKey.get("2026-27-registration-new")!;

  await prisma.notification.createMany({
    data: [
      {
        userId: student.id,
        eventId: examsEventId,
        type: "EVENT_RESCHEDULED",
        title: "Second Semester Examinations moved",
        body: "The second semester examinations have been extended by one week. They now run from 1 June to 19 June 2026. Open the event to see what changed.",
      },
      {
        userId: student.id,
        eventId: breakEventId,
        type: "EVENT_RESCHEDULED",
        title: "Sessional break now begins 27 July 2026",
        body: "The approved academic calendar was extended by one week, so the sessional break now commences on Monday, 27 July 2026 instead of 20 July 2026.",
      },
      {
        userId: staff.id,
        eventId: examsEventId,
        type: "EVENT_RESCHEDULED",
        title: "Examination window extended",
        body: "Senate approved a one-week extension of the second semester. Invigilation rotas have been updated accordingly.",
      },
      {
        userId: student.id,
        eventId: currentRegistrationId,
        type: "REMINDER",
        title: "2026/2027 registration opens this week",
        body: "First semester registration for newly admitted students of the 2026/2027 academic session opens on Thursday, 17 September 2026. (Provisional demo date — check the official calendar.)",
      },
    ],
  });

  // --- Audit log -----------------------------------------------------------
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: "SEED_DATABASE",
        entity: "System",
        entityId: null,
        metaJson: JSON.stringify({
          sessions: [
            "2025/2026 (approved calendar)",
            "2026/2027 (provisional — unverified)",
          ],
          events: EVENTS.length,
          source: "prisma/seed.ts",
          warning: "Demo data — verify against official LASU calendar before submission",
        }),
        createdAt: d("2025-09-20"),
      },
      {
        actorId: admin.id,
        action: "EVENT_PUBLISHED",
        entity: "CalendarEvent",
        entityId: examsEventId,
        metaJson: JSON.stringify({ title: "Second Semester Examinations", version: 3 }),
        createdAt: d("2026-04-08"),
      },
      {
        actorId: staff.id,
        action: "EVENT_VIEWED",
        entity: "CalendarEvent",
        entityId: examsEventId,
        metaJson: JSON.stringify({ reason: "Checked revised examination window" }),
        createdAt: d("2026-04-09"),
      },
    ],
  });

  console.log(`  subscriptions: 3, notifications: 4, audit log entries: 3`);
  console.log("\nSeeding complete.");
  console.log(
    "\n⚠️  Reminder: these dates are demo data derived from published LASU\n" +
      "    announcements (2025/2026) and provisional placeholders (2026/2027).\n" +
      "    Verify them against the official LASU calendar before submission.\n" +
      "    See docs/seed-data-sources.md.\n",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seeding failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
