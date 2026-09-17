"use server";

/**
 * Event administration actions.
 *
 * Each one re-checks ADMIN on the server and delegates to the service layer;
 * they contain no business rules of their own. This mirrors the discipline in
 * `lib/actions/auth.ts`: a server action is a public HTTP endpoint, so the
 * browser's `required` attributes and the proxy matcher are conveniences, never
 * the security boundary.
 */
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  approveEvent,
  cancelEvent,
  createEvent,
  deleteDraftEvent,
  publishEvent,
  rejectEvent,
  updateEvent,
  type EventInput,
} from "@/lib/services/events";
import type { Actor } from "@/lib/services/shared";

import {
  readEventFormValues,
  type EventFormState,
} from "./form-state";

function readInput(formData: FormData): EventInput {
  const text = (name: string): string => {
    const raw = formData.get(name);
    return typeof raw === "string" ? raw : "";
  };

  return {
    title: text("title"),
    description: text("description"),
    categoryId: text("categoryId"),
    semesterId: text("semesterId"),
    venueId: text("venueId") || undefined,
    startDate: text("startDate"),
    endDate: text("endDate"),
    startTime: text("startTime"),
    endTime: text("endTime"),
    allDay: formData.get("allDay") === "on",
    location: text("location"),
    visibility: text("visibility"),
    scope: text("scope"),
    targetIds: formData
      .getAll("targetId")
      .filter((value): value is string => typeof value === "string"),
  };
}

async function currentActor(): Promise<Actor> {
  const user = await requireRole("ADMIN");
  return { id: user.id, role: user.role };
}

/** Create → redirect to the new event, keeping the typed values on failure. */
export async function createEventAction(
  previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const actor = await currentActor();
  const publish = formData.get("intent") === "publish";

  const result = await createEvent(actor, readInput(formData), { publish });

  if (!result.ok) {
    return {
      status: "error",
      errors: result.errors,
      ...readEventFormValues(formData),
      submitId: previous.submitId + 1,
    };
  }

  redirect(
    `/admin/events/${result.data.eventId}?saved=${publish ? "published" : "draft"}`,
  );
}

/** Edit → redirect to the event, keeping the typed values on failure. */
export async function updateEventAction(
  previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const actor = await currentActor();
  const eventId = String(formData.get("eventId") ?? "");
  const publish = formData.get("intent") === "save-publish";

  if (!eventId) {
    return {
      status: "error",
      errors: ["Missing event reference."],
      ...readEventFormValues(formData),
      submitId: previous.submitId + 1,
    };
  }

  const result = await updateEvent(actor, eventId, readInput(formData), { publish });

  if (!result.ok) {
    return {
      status: "error",
      errors: result.errors,
      ...readEventFormValues(formData),
      submitId: previous.submitId + 1,
    };
  }

  const params = new URLSearchParams({ saved: "1" });
  if (result.data.rescheduled) params.set("rescheduled", "1");
  redirect(`/admin/events/${eventId}?${params.toString()}`);
}

/** Publish a draft, or restore a cancelled event. */
export async function publishEventAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const eventId = String(formData.get("eventId") ?? "");

  const result = await publishEvent(actor, eventId);

  redirect(
    result.ok
      ? `/admin/events/${eventId}?saved=1`
      : `/admin/events/${eventId}?error=${encodeURIComponent(result.errors.join(" "))}`,
  );
}

export async function cancelEventAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const eventId = String(formData.get("eventId") ?? "");

  const result = await cancelEvent(actor, eventId);

  if (!result.ok) {
    redirect(`/admin/events/${eventId}?error=${encodeURIComponent(result.errors.join(" "))}`);
  }

  redirect(`/admin/events/${eventId}?cancelled=1&notified=${result.data.notified}`);
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const eventId = String(formData.get("eventId") ?? "");

  const result = await deleteDraftEvent(actor, eventId);

  if (!result.ok) {
    redirect(`/admin/events/${eventId}?error=${encodeURIComponent(result.errors.join(" "))}`);
  }

  redirect("/admin/events?deleted=1");
}

export async function approveEventAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const eventId = String(formData.get("eventId") ?? "");
  const note = String(formData.get("note") ?? "");

  const result = await approveEvent(actor, eventId, note || undefined);

  redirect(
    result.ok
      ? `/admin/events/${eventId}?saved=approved`
      : `/admin/events/${eventId}?error=${encodeURIComponent(result.errors.join(" "))}`,
  );
}

export async function rejectEventAction(formData: FormData): Promise<void> {
  const actor = await currentActor();
  const eventId = String(formData.get("eventId") ?? "");
  const reason = String(formData.get("reason") ?? "Does not meet academic calendar guidelines.");

  const result = await rejectEvent(actor, eventId, reason);

  redirect(
    result.ok
      ? `/admin/events/${eventId}?saved=rejected`
      : `/admin/events/${eventId}?error=${encodeURIComponent(result.errors.join(" "))}`,
  );
}
