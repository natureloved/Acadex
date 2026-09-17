/**
 * Acadex Core UI Primitives.
 *
 * Configured with exact typography (Fraunces, Sora, Spline Sans Mono) and
 * natural institutional paper/ink tokens:
 * - --paper: #F7F2E7, --card: #FCF9F0, --ink: #1B1712, --green: #2E8B67
 * - Tactile micro-physics (active:scale-[0.98])
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

/** High-contrast category badge with crisp solid color indicator */
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
      className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-0.5 font-['Spline_Sans_Mono'] text-[11px] font-medium uppercase tracking-wider text-[var(--ink)] shadow-2xs ${className}`}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-xs shadow-2xs"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}

const STATUS_CLASSES: Record<EventStatus, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-800 border-emerald-300 ring-emerald-600/10",
  DRAFT: "bg-amber-50 text-amber-950 border-amber-300 ring-amber-600/10",
  PENDING: "bg-amber-50 text-amber-950 border-amber-400 ring-amber-600/20",
  REJECTED: "bg-stone-100 text-stone-800 border-stone-300 ring-stone-400/20",
  CANCELLED: "bg-rose-50 text-rose-950 border-rose-300 ring-rose-600/10",
};

export function StatusBadge({ status }: { status: string }) {
  const key = (status as EventStatus) in STATUS_CLASSES ? (status as EventStatus) : null;
  if (!key) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-['Spline_Sans_Mono'] text-[10.5px] font-semibold uppercase tracking-wider ${STATUS_CLASSES[key]}`}
    >
      {STATUS_LABELS[key]}
    </span>
  );
}

const NOTIFICATION_CLASSES: Record<NotificationType, string> = {
  EVENT_RESCHEDULED: "bg-amber-50 text-amber-950 border-amber-300",
  EVENT_CANCELLED: "bg-rose-50 text-rose-950 border-rose-300",
  EVENT_PENDING_APPROVAL: "bg-amber-50 text-amber-950 border-amber-300",
  EVENT_APPROVED: "bg-emerald-50 text-emerald-800 border-emerald-300",
  EVENT_REJECTED: "bg-rose-50 text-rose-950 border-rose-300",
  REMINDER_T7: "bg-blue-50 text-blue-950 border-blue-300",
  REMINDER_T1: "bg-blue-50 text-blue-950 border-blue-300",
  REMINDER: "bg-stone-100 text-stone-800 border-stone-300",
};

/** Notification kind badge */
export function NotificationTypeBadge({ type }: { type: string }) {
  if (!isNotificationType(type)) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-['Spline_Sans_Mono'] text-[10.5px] font-semibold uppercase tracking-wider ${NOTIFICATION_CLASSES[type]}`}
    >
      {NOTIFICATION_LABELS[type]}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-['Spline_Sans_Mono'] text-[10.5px] font-semibold uppercase tracking-wider border ${ROLE_BADGE_CLASSES[role]}`}
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
    <p className="font-['Spline_Sans_Mono'] text-[11px] font-medium text-[var(--ink-3)]">
      {scopeLabel}: {labels.join(", ")}
    </p>
  );
}

/** Amber reschedule indicator */
export function RescheduledFlag({ version }: { version: number }) {
  if (version <= 1) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-['Spline_Sans_Mono'] text-[10.5px] font-semibold uppercase tracking-wider text-amber-900">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="size-3.5 text-amber-700"
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-[var(--line)] pb-5">
      <div>
        <h1 className="font-['Fraunces'] text-2xl font-medium tracking-tight text-[var(--ink)] sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--ink-2)]">
            {description}
          </p>
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
    <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--card)] p-10 text-center shadow-2xs">
      <p className="font-['Fraunces'] text-lg font-medium text-[var(--ink)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--ink-2)]">
        {body}
      </p>
      {action ? (
        <Link
          href={action.href}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-[var(--green)] px-5 py-2 text-sm font-semibold text-[#FBF8F0] shadow-sm transition hover:bg-[var(--green-deep)] active:scale-[0.98]"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Primary button using exact green token and pill shape */
export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--green)] px-5 py-2 text-sm font-semibold text-[#FBF8F0] shadow-xs transition hover:bg-[var(--green-deep)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green)] disabled:opacity-50 disabled:pointer-events-none";

/** Secondary button using exact line-strong token and paper hover */
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--card)] px-5 py-2 text-sm font-semibold text-[var(--ink)] shadow-2xs transition hover:bg-[#EAF5EE] hover:border-[var(--green)] hover:text-[#165A3D] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

/** Form controls matching paper & ink tokens */
export const inputClasses =
  "block w-full rounded-lg border border-[var(--line-strong)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] shadow-2xs focus:border-[var(--green)] focus:outline-none focus:ring-2 focus:ring-[var(--green)]/20";

export const labelClasses =
  "block font-['Spline_Sans_Mono'] text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-2)] mb-1";
