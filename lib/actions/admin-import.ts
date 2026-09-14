"use server";

/**
 * CSV import actions.
 *
 * Two steps, two actions: `previewImportAction` parses and reports, and
 * `confirmImportAction` writes. The confirmation re-posts the raw CSV text and
 * the service parses it again, so a tampered browser payload cannot smuggle in
 * unvalidated events.
 */
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { importEvents, previewImport } from "@/lib/services/imports";
import { toDateInputValue, type Actor } from "@/lib/services/shared";

import { initialImportState, type ImportState } from "./form-state";

async function currentActor(): Promise<Actor> {
  const user = await requireRole("ADMIN");
  return { id: user.id, role: user.role };
}

/** Step 1 - read the file, validate every row, write nothing. */
export async function previewImportAction(
  previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole("ADMIN");

  const sessionId = String(formData.get("sessionId") ?? "");
  const upload = formData.get("file");
  const pasted = String(formData.get("csvText") ?? "");

  const csv = upload instanceof File && upload.size > 0 ? await upload.text() : pasted;

  const result = await previewImport(sessionId, csv);

  if (!result.ok) {
    return {
      ...initialImportState,
      status: "error",
      errors: result.errors,
      sessionId,
      csv,
      submitId: previous.submitId + 1,
    };
  }

  return {
    status: "preview",
    errors: [],
    sessionId: result.data.sessionId,
    sessionName: result.data.sessionName,
    csv,
    valid: result.data.valid.map((row) => ({
      line: row.line,
      title: row.title,
      categoryName: row.categoryName,
      semester: row.semester,
      start: toDateInputValue(row.startAt),
      end: toDateInputValue(row.endAt),
      location: row.location,
    })),
    invalid: result.data.invalid,
    submitId: previous.submitId + 1,
  };
}

/** Step 2 - import the rows that passed validation. */
export async function confirmImportAction(formData: FormData): Promise<void> {
  const actor = await currentActor();

  const sessionId = String(formData.get("sessionId") ?? "");
  const csv = String(formData.get("csv") ?? "");
  const publish = formData.get("publish") === "on";

  const result = await importEvents(actor, sessionId, csv, publish);

  if (!result.ok) {
    redirect(`/admin/import?error=${encodeURIComponent(result.errors.join(" "))}`);
  }

  const params = new URLSearchParams({
    imported: String(result.data.imported),
    skipped: String(result.data.skipped),
  });
  if (publish) params.set("published", "1");

  redirect(`/admin/import?${params.toString()}`);
}
