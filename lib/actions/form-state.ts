/**
 * Shared form state shapes.
 *
 * These types live outside the `"use server"` action modules on purpose: a
 * `"use server"` file may only export async functions, so anything else the
 * client form needs (types, initial state, tiny readers) belongs here.
 */

export type EventFormState = {
  status: "idle" | "error";
  errors: string[];
  values: Record<string, string>;
  targetIds: string[];
  /** Bumped on every failed submit so the form remounts with the values kept. */
  submitId: number;
};

export const initialEventFormState: EventFormState = {
  status: "idle",
  errors: [],
  values: {},
  targetIds: [],
  submitId: 0,
};

export const EVENT_FIELD_NAMES = [
  "title",
  "description",
  "categoryId",
  "semesterId",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "location",
  "visibility",
  "scope",
] as const;

/** Everything the admin typed, so a rejected form can be handed straight back. */
export function readEventFormValues(formData: FormData): {
  values: Record<string, string>;
  targetIds: string[];
} {
  const values: Record<string, string> = {};

  for (const name of EVENT_FIELD_NAMES) {
    const raw = formData.get(name);
    values[name] = typeof raw === "string" ? raw : "";
  }

  values.allDay = formData.get("allDay") === "on" ? "on" : "";

  const targetIds = formData
    .getAll("targetId")
    .filter((value): value is string => typeof value === "string");

  return { values, targetIds };
}

/** One preview row, already flattened for transport to the client. */
export type ImportPreviewRow = {
  line: number;
  title: string;
  categoryName: string;
  semester: string;
  start: string;
  end: string;
  location: string;
};

export type ImportState = {
  status: "idle" | "preview" | "error";
  errors: string[];
  sessionId: string;
  sessionName: string;
  csv: string;
  valid: ImportPreviewRow[];
  invalid: { line: number; reason: string }[];
  submitId: number;
};

export const initialImportState: ImportState = {
  status: "idle",
  errors: [],
  sessionId: "",
  sessionName: "",
  csv: "",
  valid: [],
  invalid: [],
  submitId: 0,
};
