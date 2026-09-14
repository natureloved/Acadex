import { REVISION_LABELS, type RevisionType } from "@/lib/constants";
import type { EventRevisionView } from "@/lib/events";
import { formatDate } from "@/lib/format";

/** Colour-code the change types so the timeline is scannable. */
const CHANGE_CLASSES: Record<RevisionType, string> = {
  CREATED: "bg-slate-100 text-slate-700 ring-slate-300",
  UPDATED: "bg-sky-50 text-sky-800 ring-sky-600/20",
  PUBLISHED: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  RESCHEDULED: "bg-amber-50 text-amber-900 ring-amber-600/20",
  CANCELLED: "bg-rose-50 text-rose-800 ring-rose-600/20",
};

function formatSnapshot(
  snapshot: { startAt: string; endAt: string } | null,
): string | null {
  if (!snapshot) return null;
  const start = new Date(snapshot.startAt);
  const end = new Date(snapshot.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return start.getTime() === end.getTime()
    ? formatDate(start)
    : `${formatDate(start)} – ${formatDate(end)}`;
}

/**
 * The event's change history — the feature that turns "reduces confusion about
 * important dates" from a claim into something a marker can actually see.
 */
export function RevisionTimeline({ revisions }: { revisions: EventRevisionView[] }) {
  if (revisions.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No change history has been recorded for this event.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {revisions.map((revision) => {
        const changeType = revision.changeType as RevisionType;
        const label = REVISION_LABELS[changeType] ?? revision.changeType;
        const before = formatSnapshot(revision.diff?.before ?? null);
        const after = formatSnapshot(revision.diff?.after ?? null);

        return (
          <li
            key={revision.id}
            className="relative border-l-2 border-slate-200 pl-4 pb-1 last:pb-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                  CHANGE_CLASSES[changeType] ?? CHANGE_CLASSES.UPDATED
                }`}
              >
                {label}
              </span>
              <time
                dateTime={revision.changedAt.toISOString()}
                className="text-xs font-medium text-slate-600"
              >
                {formatDate(revision.changedAt)}
              </time>
              {revision.changedByName ? (
                <span className="text-xs text-slate-500">
                  by {revision.changedByName}
                </span>
              ) : null}
            </div>

            {before && after && before !== after ? (
              <p className="mt-1.5 text-sm text-slate-700">
                <span className="text-slate-500 line-through">{before}</span>
                {" → "}
                <span className="font-semibold text-slate-900">{after}</span>
              </p>
            ) : after ? (
              <p className="mt-1.5 text-sm text-slate-700">{after}</p>
            ) : null}

            {revision.note ? (
              <p className="mt-1 text-sm text-slate-600">{revision.note}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
