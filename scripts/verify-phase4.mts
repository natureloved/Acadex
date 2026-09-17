/**
 * Verification test script for Acadex Phase 4 enhancements:
 * - Institutional Venue CRUD (Table 3.8)
 * - Figure 5.3 interval-overlap conflict detection algorithm
 * - Staff departmental event proposal & administrative approval workflow (FR13)
 *
 * Run with: `npx tsx scripts/verify-phase4.mts`
 */
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

const { prisma } = await import("../lib/db");
const {
  approveEvent,
  checkIntervalConflict,
  createEvent,
  rejectEvent,
  submitDepartmentalEvent,
} = await import("../lib/services/events");
const {
  createVenue,
  deleteVenue,
  listVenuesForAdmin,
} = await import("../lib/services/venues");

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`);
    passed++;
  } else {
    console.error(`  FAIL  ${message}`);
    failed++;
  }
}

async function main() {
  console.log("=== Acadex Phase 4 Verification Suite ===");

  // Lookup test actors and semester
  const [adminUser, staffUser, activeSemester, category] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } }),
    prisma.user.findFirstOrThrow({ where: { role: "STAFF" } }),
    prisma.semester.findFirstOrThrow({
      where: { session: { isActive: true } },
      include: { session: true },
    }),
    prisma.eventCategory.findFirstOrThrow({ where: { slug: "lectures" } }),
  ]);

  const adminActor = { id: adminUser.id, role: adminUser.role as "ADMIN" };
  const staffActor = { id: staffUser.id, role: staffUser.role as "STAFF" };

  console.log(`\n=== 1. Institutional Venues (Table 3.8) ===`);
  // Clean up any stale test venues from interrupted runs
  await prisma.calendarEvent.deleteMany({
    where: { title: { in: ["Morning Faculty Colloquium", "Computer Science Project Defense", "Unscheduled Departmental Gala"] } },
  });
  await prisma.venue.deleteMany({
    where: { OR: [{ code: { startsWith: "TEST_" } }, { name: { contains: "Verification Test Theatre" } }] },
  });

  const uniqueVenueCode = `TEST_${Date.now().toString().slice(-6)}`;
  const testVenueName = `Verification Test Theatre ${uniqueVenueCode}`;
  const venueCreateResult = await createVenue(adminActor, {
    name: testVenueName,
    code: uniqueVenueCode,
    capacity: 750,
    location: "Main Campus Testing Wing",
  });

  assert(venueCreateResult.ok, "createVenue succeeds with valid payload");
  const testVenueId = venueCreateResult.ok ? venueCreateResult.data.venueId : "";

  const duplicateCodeResult = await createVenue(adminActor, {
    name: `Another Venue ${uniqueVenueCode}`,
    code: uniqueVenueCode,
  });
  assert(!duplicateCodeResult.ok, "duplicate venue code is rejected");

  const venuesList = await listVenuesForAdmin();
  const createdInList = venuesList.some((v) => v.id === testVenueId && v.code === uniqueVenueCode);
  assert(createdInList, "newly created venue appears in listVenuesForAdmin");

  console.log(`\n=== 2. Figure 5.3 Interval-Overlap Scheduling Conflict Detection ===`);
  // Create first event in this venue: 2026-11-10 from 10:00 to 12:00
  const event1Result = await createEvent(
    adminActor,
    {
      title: "Morning Faculty Colloquium",
      description: "Session A in test venue",
      categoryId: category.id,
      semesterId: activeSemester.id,
      venueId: testVenueId,
      startDate: "2026-11-10",
      endDate: "2026-11-10",
      startTime: "10:00",
      endTime: "12:00",
      allDay: false,
      location: "Verification Test Theatre",
      visibility: "PUBLIC",
      scope: "ALL",
      targetIds: [],
    },
    { publish: true },
  );
  assert(event1Result.ok, "Event 1 created and published in test venue (10:00 - 12:00)");
  const event1Id = event1Result.ok ? event1Result.data.eventId : "";

  // Test Case A: Overlapping interval (11:00 to 13:00) in same venue -> CONFLICT!
  const clashCheck = await checkIntervalConflict({
    venueId: testVenueId,
    startDatetime: "2026-11-10T11:00:00Z",
    endDatetime: "2026-11-10T13:00:00Z",
  });
  assert(clashCheck.hasConflict === true, "Figure 5.3 detects overlapping interval (11:00 - 13:00)");
  assert(clashCheck.conflicts.length === 1, "exactly 1 conflicting event identified");
  assert(clashCheck.conflicts[0]?.id === event1Id, "clashing event ID matches Event 1");

  // Test Case B: Adjacent interval (12:00 to 14:00) in same venue -> NO CLASH
  const adjacentCheck = await checkIntervalConflict({
    venueId: testVenueId,
    startDatetime: "2026-11-10T12:00:00Z",
    endDatetime: "2026-11-10T14:00:00Z",
  });
  assert(adjacentCheck.hasConflict === false, "adjacent interval (12:00 - 14:00) does not conflict");

  // Test Case C: Excluding Event 1 itself (for editing existing event without self-clash)
  const selfCheck = await checkIntervalConflict({
    venueId: testVenueId,
    startDatetime: "2026-11-10T10:00:00Z",
    endDatetime: "2026-11-10T12:00:00Z",
    excludeEventId: event1Id,
  });
  assert(selfCheck.hasConflict === false, "excludeEventId prevents false self-conflict during edits");

  console.log(`\n=== 3. Staff Departmental Submission & Approval Workflow (FR13) ===`);
  // Staff submits proposal
  const submissionResult = await submitDepartmentalEvent(staffActor, {
    title: "Computer Science Project Defense",
    description: "Final year mock defense session",
    categoryId: category.id,
    semesterId: activeSemester.id,
    venueId: testVenueId,
    startDate: "2026-11-12",
    endDate: "2026-11-12",
    startTime: "09:00",
    endTime: "16:00",
    allDay: false,
    location: "Verification Test Theatre",
    visibility: "PUBLIC",
    scope: "DEPARTMENT",
    targetIds: staffUser.departmentId ? [staffUser.departmentId] : [],
  });

  assert(submissionResult.ok, "staff member can submit departmental event proposal");
  const submissionId = submissionResult.ok ? submissionResult.data.eventId : "";

  const pendingEvent = await prisma.calendarEvent.findUnique({
    where: { id: submissionId },
  });
  assert(pendingEvent?.status === "PENDING", "submitted proposal receives PENDING status");

  // Public calendar check: PENDING event must NOT appear on public calendar
  const publicEvents = await prisma.calendarEvent.findMany({
    where: { status: "PUBLISHED" },
  });
  assert(!publicEvents.some((e) => e.id === submissionId), "pending proposal is hidden from public calendar");

  // Admin approves proposal
  const approvalResult = await approveEvent(adminActor, submissionId, "Approved by Faculty Academic Board.");
  assert(approvalResult.ok, "administrator can approve pending proposal");

  const approvedEvent = await prisma.calendarEvent.findUnique({
    where: { id: submissionId },
    include: { revisions: true },
  });
  assert(approvedEvent?.status === "PUBLISHED", "approved event transitions to PUBLISHED status");
  assert(approvedEvent?.publishedAt !== null, "publishedAt timestamp is set upon approval");
  assert(
    Boolean(approvedEvent?.revisions.some((r) => r.changeType === "APPROVED")),
    "APPROVED revision is recorded in event history",
  );

  // Test Rejection workflow
  const rejectProposalResult = await submitDepartmentalEvent(staffActor, {
    title: "Unscheduled Departmental Gala",
    description: "Proposed social gathering during exam week",
    categoryId: category.id,
    semesterId: activeSemester.id,
    startDate: "2026-11-15",
    endDate: "2026-11-15",
    startTime: "",
    endTime: "",
    allDay: true,
    location: "",
    visibility: "PUBLIC",
    scope: "DEPARTMENT",
    targetIds: staffUser.departmentId ? [staffUser.departmentId] : [],
  });
  assert(rejectProposalResult.ok, "second proposal submitted for rejection test");
  const rejectProposalId = rejectProposalResult.ok ? rejectProposalResult.data.eventId : "";

  const rejectResult = await rejectEvent(
    adminActor,
    rejectProposalId,
    "Social events cannot be scheduled during revision week.",
  );
  assert(rejectResult.ok, "administrator can reject proposal with reason");

  const rejectedEvent = await prisma.calendarEvent.findUnique({
    where: { id: rejectProposalId },
    include: { revisions: true },
  });
  assert(rejectedEvent?.status === "REJECTED", "rejected proposal transitions to REJECTED status");
  assert(
    Boolean(rejectedEvent?.revisions.some((r) => r.changeType === "REJECTED" && r.note?.includes("revision week"))),
    "REJECTED revision contains admin reason",
  );

  console.log(`\n=== 4. Cleanup & Invariant Integrity ===`);
  // Clean up created events
  await prisma.eventRevision.deleteMany({
    where: { eventId: { in: [event1Id, submissionId, rejectProposalId] } },
  });
  await prisma.eventTarget.deleteMany({
    where: { eventId: { in: [event1Id, submissionId, rejectProposalId] } },
  });
  await prisma.calendarEvent.deleteMany({
    where: { id: { in: [event1Id, submissionId, rejectProposalId] } },
  });

  // Now delete test venue
  const venueDeleteResult = await deleteVenue(adminActor, testVenueId);
  assert(venueDeleteResult.ok, "test venue deleted after event cleanup");

  console.log(`\n========================================`);
  console.log(`Phase 4 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
