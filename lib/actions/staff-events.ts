"use server";

/**
 * Staff departmental event submission actions.
 */
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { submitDepartmentalEvent, type EventInput } from "@/lib/services/events";

import { readEventFormValues, type EventFormState } from "./form-state";

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
    visibility: text("visibility") || "PUBLIC",
    scope: text("scope") || "DEPARTMENT",
    targetIds: formData
      .getAll("targetId")
      .filter((value): value is string => typeof value === "string"),
  };
}

export async function submitDepartmentalEventAction(
  previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const user = await requireRole("STAFF", "ADMIN");
  const actor = { id: user.id, role: user.role };

  const input = readInput(formData);
  // Auto-target staff member's department if scope is DEPARTMENT and no targets specified
  if (input.scope === "DEPARTMENT" && input.targetIds.length === 0 && user.departmentId) {
    input.targetIds = [user.departmentId];
  } else if (input.scope === "FACULTY" && input.targetIds.length === 0 && user.facultyId) {
    input.targetIds = [user.facultyId];
  }

  const result = await submitDepartmentalEvent(actor, input);

  if (!result.ok) {
    return {
      status: "error",
      errors: result.errors,
      ...readEventFormValues(formData),
      submitId: previous.submitId + 1,
    };
  }

  redirect("/staff?submitted=1");
}
