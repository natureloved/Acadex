/**
 * Small presentational building blocks shared by the calendar pages.
 *
 * These are plain server components — no "use client" anywhere in the app, so
 * the client bundle for the public calendar is React plus the router and
 * nothing else, which is what keeps it usable on a phone on a slow connection.
 */
import Link from "next/link";

import {
  isNotificationType,
  NOTIFICATION_LABELS,
  ROLE_BADGE_CLASSES,
  ROLE_LABELS,
  SCOPE_LABELS,
  STATUS_LABELS,
  type EventScope,
  type EventStatus,
  type NotificationType,
  type Role,
} from "@/lib/constants";

/** Coloured dot + name for an event category. */
export function CategoryChip({
  name,
  color,
  className = "",
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 ${className}`}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}

const STATUS_CLASSES: Record<EventStatus, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  DRAFT: "bg-amber-50 text-amber-700 ring-amber-600/20",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export function StatusBadge({ status }: { status: string }) {
  const key = (status as EventStatus) in STATUS_CLASSES ? (status as EventStatus) : null;
  if (!key) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_CLASSES[key]}`}
    >
      {STATUS_LABELS[key]}
    </span>
  );
}

const NOTIFICATION_CLASSES: Record<NotificationType, string> = {
  EVENT_RESCHEDULED: "bg-amber-50 text-amber-800 ring-amber-600/20",
  EVENT_CANCELLED: "bg-rose-50 text-rose-800 ring-rose-600/20",
  REMINDER_T7: "bg-blue-50 text-blue-800 ring-blue-600/20",
  REMINDER_T1: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",
  REMINDER: "bg-slate-100 text-slate-700 ring-slate-300",
};

/** What kind of notice this is — a reminder, a cancellation, a move. */
export function NotificationTypeBadge({ type }: { type: string }) {
  // Unknown kinds (a value written by an older build) simply get no chip rather
  // than a broken one; the notice's own title still says what it is.
  if (!isNotificationType(type)) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${NOTIFICATION_CLASSES[type]}`}
    >
      {NOTIFICATION_LABELS[type]}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${ROLE_BADGE_CLASSES[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function ScopeNote({
  scope,
  labels,
}: {
  scope: string;
  labels: string[];
}) {
  const scopeLabel = SCOPE_LABELS[scope as EventScope] ?? scope;
  if (scope === "ALL" || labels.length === 0) return null;

  return (
    <p className="text-xs text-slate-500">
      {scopeLabel}: {labels.join(", ")}
    </p>
  );
}

/** Amber "was rescheduled" flag shown on cards and the detail page. */
export function RescheduledFlag({ version }: { version: number }) {
  if (version <= 1) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/20">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="size-3.5"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
          clipRule="evenodd"
        />
      </svg>
      Rescheduled
    </span>
  );
}

export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Shared button/link classes so focus and hover states stay consistent. */
export const buttonPrimary =
  "inline-flex items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";

export const buttonSecondary =
  "inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 transition hover:bg-slate-50";

export const inputClasses =
  "block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-700";

export const labelClasses = "block text-sm font-medium text-slate-800";
