"use client";

/**
 * Departmental Staff Event Proposal Form (FR13).
 *
 * Allows departmental staff / exam officers to propose an event (lecture series,
 * departmental seminar, mock defence, departmental test, etc.) with venue selection.
 * Events are queued with PENDING status for administrator sign-off.
 */
import { useActionState, useState } from "react";

import { buttonPrimary, buttonSecondary, inputClasses, labelClasses } from "@/components/ui";
import { initialEventFormState } from "@/lib/actions/form-state";
import { submitDepartmentalEventAction } from "@/lib/actions/staff-events";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";
import type { EventFormOptions } from "@/lib/services/events";

export function StaffEventForm({
  options,
  staffDepartmentName,
}: {
  options: EventFormOptions;
  staffDepartmentName?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [allDay, setAllDay] = useState(true);

  const [state, formAction, isPending] = useActionState(
    submitDepartmentalEventAction,
    initialEventFormState,
  );

  if (!isOpen) {
    return (
      <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-6 text-center">
        <h3 className="text-base font-semibold text-blue-900">
          Propose Departmental Event or Examination
        </h3>
        <p className="mt-1 text-sm text-blue-700 max-w-xl mx-auto">
          Need to schedule a departmental seminar, orientation, board meeting, or special lecture?
          Submit a proposal for Dean/Academic Registry approval.
        </p>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`mt-4 ${buttonPrimary}`}
        >
          + New Departmental Proposal
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Submit Event Proposal for Review
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Targeted at: <span className="font-semibold text-slate-700">{staffDepartmentName || "Your Department"}</span> (will be reviewed by Registry before public listing)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>

      {state.status === "error" && state.errors.length > 0 ? (
        <div className="mb-5 rounded-md bg-rose-50 p-4 ring-1 ring-rose-600/20">
          <p className="text-sm font-semibold text-rose-900">Please fix the following:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-rose-800">
            {state.errors.map((err: string) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="scope" value="DEPARTMENT" />
        <input type="hidden" name="visibility" value="PUBLIC" />

        <div>
          <label htmlFor="staff-event-title" className={labelClasses}>
            Event Title <span className="text-rose-500">*</span>
          </label>
          <input
            id="staff-event-title"
            name="title"
            required
            placeholder="e.g. Computer Science Departmental Board Meeting"
            className={`${inputClasses} mt-1`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="staff-event-category" className={labelClasses}>
              Category <span className="text-rose-500">*</span>
            </label>
            <select
              id="staff-event-category"
              name="categoryId"
              required
              className={`${inputClasses} mt-1`}
            >
              {options.categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="staff-event-semester" className={labelClasses}>
              Academic Semester <span className="text-rose-500">*</span>
            </label>
            <select
              id="staff-event-semester"
              name="semesterId"
              required
              className={`${inputClasses} mt-1`}
            >
              {options.semesters.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  {sem.session.name} / {SEMESTER_LABELS[sem.type as SemesterType] ?? sem.type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="staff-event-venue" className={labelClasses}>
              Institutional Venue (Figure 5.3 Clash Prevention)
            </label>
            <select
              id="staff-event-venue"
              name="venueId"
              className={`${inputClasses} mt-1`}
            >
              <option value="">No specific institutional venue / Virtual</option>
              {options.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.code}){v.capacity ? ` - ${v.capacity} seats` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="staff-event-location" className={labelClasses}>
              Additional Location / Room Details
            </label>
            <input
              id="staff-event-location"
              name="location"
              placeholder="e.g. Faculty Room 204 or Zoom Link"
              className={`${inputClasses} mt-1`}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="staff-start-date" className={labelClasses}>
              Start Date <span className="text-rose-500">*</span>
            </label>
            <input
              id="staff-start-date"
              name="startDate"
              type="date"
              required
              className={`${inputClasses} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="staff-end-date" className={labelClasses}>
              End Date <span className="text-rose-500">*</span>
            </label>
            <input
              id="staff-end-date"
              name="endDate"
              type="date"
              required
              className={`${inputClasses} mt-1`}
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              name="allDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            All-day event (dates only, no specific start/end time)
          </label>
        </div>

        {!allDay ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="staff-start-time" className={labelClasses}>
                Start Time
              </label>
              <input
                id="staff-start-time"
                name="startTime"
                type="time"
                defaultValue="09:00"
                className={`${inputClasses} mt-1`}
              />
            </div>
            <div>
              <label htmlFor="staff-end-time" className={labelClasses}>
                End Time
              </label>
              <input
                id="staff-end-time"
                name="endTime"
                type="time"
                defaultValue="11:00"
                className={`${inputClasses} mt-1`}
              />
            </div>
          </div>
        ) : null}

        <div>
          <label htmlFor="staff-event-desc" className={labelClasses}>
            Description / Memo Details
          </label>
          <textarea
            id="staff-event-desc"
            name="description"
            rows={3}
            placeholder="Provide context for the academic registrar or Dean reviewing this proposal..."
            className={`${inputClasses} mt-1`}
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className={buttonSecondary}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className={`${buttonPrimary} disabled:opacity-50`}
          >
            {isPending ? "Submitting..." : "Submit for Approval"}
          </button>
        </div>
      </form>
    </div>
  );
}
