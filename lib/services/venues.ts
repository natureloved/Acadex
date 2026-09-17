/**
 * Institutional Venue service.
 *
 * Venues represent lecture theatres, auditoriums, and halls across LASU
 * (e.g. Buba Marwa Auditorium, MBA Hall, Science Lecture Theatre).
 * Supports Table 3.8 and Figure 5.3 interval-overlap scheduling conflict detection.
 */
import { prisma } from "../db";
import { fail, succeed, writeAudit, type Actor, type ServiceResult } from "./shared";

export type VenueInput = {
  name: string;
  code: string;
  capacity?: number | null;
  location?: string | null;
};

export type AdminVenue = {
  id: string;
  name: string;
  code: string;
  capacity: number | null;
  location: string | null;
  eventCount: number;
};

export async function listVenuesForAdmin(): Promise<AdminVenue[]> {
  const venues = await prisma.venue.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      capacity: true,
      location: true,
      _count: { select: { events: true } },
    },
    orderBy: { name: "asc" },
  });

  return venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    code: venue.code,
    capacity: venue.capacity,
    location: venue.location,
    eventCount: venue._count.events,
  }));
}

export async function getVenueById(id: string): Promise<AdminVenue | null> {
  const venue = await prisma.venue.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      capacity: true,
      location: true,
      _count: { select: { events: true } },
    },
  });

  if (!venue) return null;
  return {
    id: venue.id,
    name: venue.name,
    code: venue.code,
    capacity: venue.capacity,
    location: venue.location,
    eventCount: venue._count.events,
  };
}

function cleanCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "").slice(0, 20);
}

function validate(input: VenueInput): {
  ok: true;
  name: string;
  code: string;
  capacity: number | null;
  location: string | null;
} | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const name = input.name.trim();
  const code = cleanCode(input.code);
  const location = input.location?.trim() || null;
  let capacity: number | null = null;

  if (!name) errors.push("A venue name is required.");
  else if (name.length > 100) errors.push("Keep the venue name under 100 characters.");

  if (!code) errors.push("A unique venue code is required (e.g. BMA, MBA, SLT).");
  else if (code.length > 20) errors.push("Keep the venue code under 20 characters.");

  if (input.capacity !== undefined && input.capacity !== null && !isNaN(Number(input.capacity))) {
    const capNum = Number(input.capacity);
    if (capNum < 0) errors.push("Capacity cannot be negative.");
    else capacity = Math.floor(capNum);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, name, code, capacity, location };
}

export async function createVenue(
  actor: Actor,
  input: VenueInput,
): Promise<ServiceResult<{ venueId: string }>> {
  const checked = validate(input);
  if (!checked.ok) return fail(...checked.errors);

  const existing = await prisma.venue.findFirst({
    where: {
      OR: [{ code: checked.code }, { name: checked.name }],
    },
    select: { id: true, code: true, name: true },
  });
  if (existing) {
    if (existing.code === checked.code) {
      return fail(`Venue code "${checked.code}" is already in use.`);
    }
    return fail(`A venue named "${checked.name}" already exists.`);
  }

  const venue = await prisma.venue.create({
    data: {
      name: checked.name,
      code: checked.code,
      capacity: checked.capacity,
      location: checked.location,
    },
    select: { id: true, name: true, code: true },
  });

  await writeAudit(prisma, {
    actorId: actor.id,
    action: "VENUE_CREATED",
    entity: "VENUE",
    entityId: venue.id,
    meta: { name: venue.name, code: venue.code },
  });

  return succeed({ venueId: venue.id });
}

export async function updateVenue(
  actor: Actor,
  venueId: string,
  input: VenueInput,
): Promise<ServiceResult<{ venueId: string }>> {
  const checked = validate(input);
  if (!checked.ok) return fail(...checked.errors);

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, code: true },
  });
  if (!venue) return fail("Venue not found.");

  const existing = await prisma.venue.findFirst({
    where: {
      id: { not: venueId },
      OR: [{ code: checked.code }, { name: checked.name }],
    },
    select: { id: true, code: true, name: true },
  });
  if (existing) {
    if (existing.code === checked.code) {
      return fail(`Venue code "${checked.code}" is already in use by another venue.`);
    }
    return fail(`A venue named "${checked.name}" already exists.`);
  }

  await prisma.venue.update({
    where: { id: venueId },
    data: {
      name: checked.name,
      code: checked.code,
      capacity: checked.capacity,
      location: checked.location,
    },
  });

  await writeAudit(prisma, {
    actorId: actor.id,
    action: "VENUE_UPDATED",
    entity: "VENUE",
    entityId: venueId,
    meta: { name: checked.name, code: checked.code },
  });

  return succeed({ venueId });
}

export async function deleteVenue(
  actor: Actor,
  venueId: string,
): Promise<ServiceResult<{ venueId: string }>> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      code: true,
      _count: { select: { events: true } },
    },
  });

  if (!venue) return fail("Venue not found.");

  if (venue._count.events > 0) {
    return fail(
      `Cannot delete "${venue.name}" because it is booked for ${venue._count.events} calendar event(s).`,
    );
  }

  await prisma.venue.delete({
    where: { id: venueId },
  });

  await writeAudit(prisma, {
    actorId: actor.id,
    action: "VENUE_DELETED",
    entity: "VENUE",
    entityId: venueId,
    meta: { name: venue.name, code: venue.code },
  });

  return succeed({ venueId });
}
