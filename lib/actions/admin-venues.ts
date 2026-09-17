"use server";

/**
 * Institutional Venue administration actions.
 */
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  createVenue,
  deleteVenue,
  updateVenue,
} from "@/lib/services/venues";
import type { Actor } from "@/lib/services/shared";

async function currentActor(): Promise<Actor> {
  const user = await requireRole("ADMIN");
  return { id: user.id, role: user.role };
}

function text(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw : "";
}

function back(to: string, key: "saved" | "error", message: string): never {
  const params = new URLSearchParams({ [key]: message });
  redirect(`${to}?${params.toString()}`);
}

export async function createVenueAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const rawCapacity = text(formData, "capacity");

  const result = await createVenue(actor, {
    name: text(formData, "name"),
    code: text(formData, "code"),
    capacity: rawCapacity ? Number(rawCapacity) : null,
    location: text(formData, "location") || null,
  });

  if (!result.ok) back("/admin/venues", "error", result.errors.join(" "));
  back("/admin/venues", "saved", "Venue added successfully.");
}

export async function updateVenueAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const venueId = text(formData, "venueId");
  const rawCapacity = text(formData, "capacity");

  const result = await updateVenue(actor, venueId, {
    name: text(formData, "name"),
    code: text(formData, "code"),
    capacity: rawCapacity ? Number(rawCapacity) : null,
    location: text(formData, "location") || null,
  });

  if (!result.ok) back("/admin/venues", "error", result.errors.join(" "));
  back("/admin/venues", "saved", "Venue updated.");
}

export async function deleteVenueAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const venueId = text(formData, "venueId");

  const result = await deleteVenue(actor, venueId);

  if (!result.ok) back("/admin/venues", "error", result.errors.join(" "));
  back("/admin/venues", "saved", "Venue removed.");
}
