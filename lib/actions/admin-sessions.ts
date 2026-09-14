"use server";

/**
 * Session, semester and category administration actions.
 *
 * Thin wrappers over `lib/services/sessions.ts` and `lib/services/categories.ts`:
 * resolve the signed-in administrator, call the service, and turn the result
 * into a redirect (with `?saved=` or `?error=` for the page to render).
 */
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/lib/services/categories";
import {
  createSemester,
  createSession,
  deleteSession,
  setActiveSession,
  updateSemester,
  updateSession,
} from "@/lib/services/sessions";
import type { Actor } from "@/lib/services/shared";

async function currentActor(): Promise<Actor> {
  const user = await requireRole("ADMIN");
  return { id: user.id, role: user.role };
}

function text(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw : "";
}

/** Send the administrator back to `to` with a single status message. */
function back(to: string, key: "saved" | "error", message: string): never {
  const params = new URLSearchParams({ [key]: message });
  redirect(`${to}?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSessionAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await createSession(actor, {
    name: text(formData, "name"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    isActive: formData.get("isActive") === "on",
  });

  if (!result.ok) back("/admin/sessions", "error", result.errors.join(" "));
  back("/admin/sessions", "saved", "Session created.");
}

export async function updateSessionAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await updateSession(actor, text(formData, "sessionId"), {
    name: text(formData, "name"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    isActive: formData.get("isActive") === "on",
  });

  if (!result.ok) back("/admin/sessions", "error", result.errors.join(" "));
  back("/admin/sessions", "saved", "Session updated.");
}

export async function activateSessionAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await setActiveSession(actor, text(formData, "sessionId"));

  if (!result.ok) back("/admin/sessions", "error", result.errors.join(" "));
  back("/admin/sessions", "saved", "Active session changed.");
}

export async function deleteSessionAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await deleteSession(actor, text(formData, "sessionId"));

  if (!result.ok) back("/admin/sessions", "error", result.errors.join(" "));
  back("/admin/sessions", "saved", "Session deleted.");
}

// ---------------------------------------------------------------------------
// Semesters
// ---------------------------------------------------------------------------

export async function createSemesterAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await createSemester(actor, {
    sessionId: text(formData, "sessionId"),
    type: text(formData, "type"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
  });

  if (!result.ok) back("/admin/sessions", "error", result.errors.join(" "));
  back("/admin/sessions", "saved", "Semester added.");
}

export async function updateSemesterAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await updateSemester(actor, text(formData, "semesterId"), {
    sessionId: text(formData, "sessionId"),
    type: text(formData, "type"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
  });

  if (!result.ok) back("/admin/sessions", "error", result.errors.join(" "));
  back("/admin/sessions", "saved", "Semester updated.");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategoryAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await createCategory(actor, {
    name: text(formData, "name"),
    color: text(formData, "color"),
  });

  if (!result.ok) back("/admin/categories", "error", result.errors.join(" "));
  back("/admin/categories", "saved", "Category created.");
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await updateCategory(actor, text(formData, "categoryId"), {
    name: text(formData, "name"),
    color: text(formData, "color"),
  });

  if (!result.ok) back("/admin/categories", "error", result.errors.join(" "));
  back("/admin/categories", "saved", "Category updated.");
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const result = await deleteCategory(actor, text(formData, "categoryId"));

  if (!result.ok) back("/admin/categories", "error", result.errors.join(" "));
  back("/admin/categories", "saved", "Category deleted.");
}
