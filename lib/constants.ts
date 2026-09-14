/**
 * Single source of truth for the string "enums" used across Acadex.
 *
 * SQLite has no native enum type, so the Prisma schema stores these as String
 * columns (see prisma/schema.prisma). Declaring the allowed values here — as
 * `as const` tuples plus derived union types — gives us the same compile-time
 * safety an enum would, and keeps the validation logic in one place.
 */

export const ROLES = ["ADMIN", "STAFF", "STUDENT"] as const;
export type Role = (typeof ROLES)[number];

export const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_VISIBILITIES = ["PUBLIC", "STAFF_ONLY"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const EVENT_SCOPES = ["ALL", "FACULTY", "DEPARTMENT", "LEVEL"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export const SEMESTER_TYPES = ["FIRST", "SECOND"] as const;
export type SemesterType = (typeof SEMESTER_TYPES)[number];

export const TARGET_TYPES = ["FACULTY", "DEPARTMENT", "LEVEL"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const REVISION_TYPES = [
  "CREATED",
  "UPDATED",
  "PUBLISHED",
  "RESCHEDULED",
  "CANCELLED",
] as const;
export type RevisionType = (typeof REVISION_TYPES)[number];

/** Undergraduate levels offered by LASU. */
export const LEVELS = [100, 200, 300, 400, 500] as const;

/** Revision kinds that mean "the dates moved" — the UI flags these. */
export const RESCHEDULE_REVISIONS: readonly RevisionType[] = [
  "RESCHEDULED",
  "UPDATED",
];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  STAFF: "Staff",
  STUDENT: "Student",
};

export const SEMESTER_LABELS: Record<SemesterType, string> = {
  FIRST: "First Semester",
  SECOND: "Second Semester",
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
};

export const SCOPE_LABELS: Record<EventScope, string> = {
  ALL: "Whole university",
  FACULTY: "Specific faculty",
  DEPARTMENT: "Specific department",
  LEVEL: "Specific level",
};

export const REVISION_LABELS: Record<RevisionType, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  PUBLISHED: "Published",
  RESCHEDULED: "Rescheduled",
  CANCELLED: "Cancelled",
};

/** Tailwind classes for the role badge in the header. */
export const ROLE_BADGE_CLASSES: Record<Role, string> = {
  ADMIN: "bg-purple-100 text-purple-800 ring-purple-600/20",
  STAFF: "bg-sky-100 text-sky-800 ring-sky-600/20",
  STUDENT: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isEventStatus(value: unknown): value is EventStatus {
  return (
    typeof value === "string" && (EVENT_STATUSES as readonly string[]).includes(value)
  );
}
