"use client";

/**
 * Create / edit form for a calendar event.
 *
 * A client component because the form is genuinely interactive: the all-day
 * toggle reveals the time fields, and the audience selector changes shape with
 * the chosen scope. Everything is still validated on the server - this component
 * only decides what to show.
 *
 * On a rejected submit the action hands the typed values straight back, and the
 * form is remounted (via `key`) so those values become the new defaults. That is
 * how the administrator keeps their work without a client-side state library.
 */
import Link from "next/link";
import { useActionState, useState } from "react";

import { buttonPrimary, buttonSecondary, inputClasses, labelClasses } from "@/components/ui";
import { createEventAction, updateEventAction } from "@/lib/actions/admin-events";
import { initialEventFormState } from "@/lib/actions/form-state";
import {
  LEVELS,
  SCOPE_LABELS,
  SEMESTER_LABELS,
  type EventScope,
  type SemesterType,
} from "@/lib/constants";
import type { EventFormOptions } from "@/lib/services/events";

export type EventFormDefaults = {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  semesterId: string;
  venueId?: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  visibility: string;
  scope: string;
  targetIds: string[];
};

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClasses}>
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function EventForm({
  mode,
  options,
  defaults,
}: {
  mode: "create" | "edit";
  options: EventFormOptions;
  defaults: EventFormDefaults;
}) {
  const action = mode === "create" ? createEventAction : updateEventAction;
  const [state, formAction, isPending] = useActionState(action, initialEventFormState);

  // After a rejected submit the typed values come back from the action.
  const echoed = state.status === "error" ? state.values : {};
  const value = (name: string, fallback: string): string => {
    const raw = echoed[name];
    return typeof raw === "string" && raw.length > 0 ? raw : fallback;
  };

  const [allDayChecked, setAllDayChecked] = useState(
    state.status === "error" ? echoed.allDay === "on" : defaults.allDay,
  );
  const [scope, setScope] = useState<EventScope>(
    (value("scope", defaults.scope) || "ALL") as EventScope,
  );

  const selectedTargets =
    state.status === "error" ? state.targetIds : defaults.targetIds;

  return (
    <form key={state.submitId} action={formAction} className="space-y-6">
      {mode === "edit" ? <input type="hidden" name="eventId" value={defaults.id} /> : null}

      {state.errors.length > 0 ? (
        <div
          role="alert"
          className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
        >
          <p className="font-semibold">That did not save.</p>
          <ul className="mt-1 list-disc pl-5">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" htmlFor="title">
            <input
              id="title"
              name="title"
              required
              maxLength={200}
              defaultValue={value("title", defaults.title)}
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Description"
            htmlFor="description"
            hint="Shown on the event page. Plain text; line breaks are kept."
          >
            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={5000}
              defaultValue={value("description", defaults.description)}
              className={inputClasses}
            />
          </Field>
        </div>

        <Field label="Category" htmlFor="categoryId">
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={value("categoryId", defaults.categoryId)}
            className={inputClasses}
          >
            <option value="">Choose a category...</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Semester" htmlFor="semesterId">
          <select
            id="semesterId"
            name="semesterId"
            required
            defaultValue={value("semesterId", defaults.semesterId)}
            className={inputClasses}
          >
            <option value="">Choose a semester...</option>
            {options.semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.session.name} /{" "}
                {SEMESTER_LABELS[semester.type as SemesterType] ?? semester.type}
                {semester.session.isActive ? " (current)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Start date" htmlFor="startDate">
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={value("startDate", defaults.startDate)}
            className={inputClasses}
          />
        </Field>

        <Field label="End date" htmlFor="endDate">
          <input
            id="endDate"
            name="endDate"
            type="date"
            required
            defaultValue={value("endDate", defaults.endDate)}
            className={inputClasses}
          />
        </Field>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              name="allDay"
              checked={allDayChecked}
              onChange={(event) => setAllDayChecked(event.target.checked)}
              className="size-4 rounded border-slate-300"
            />
            All-day event (no times)
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Leave this ticked for dates such as registration windows and breaks.
            Untick it when the event starts and finishes at a set time.
          </p>
        </div>

        {!allDayChecked ? (
          <>
            <Field label="Start time" htmlFor="startTime">
              <input
                id="startTime"
                name="startTime"
                type="time"
                defaultValue={value("startTime", defaults.startTime) || "09:00"}
                className={inputClasses}
              />
            </Field>

            <Field label="End time" htmlFor="endTime">
              <input
                id="endTime"
                name="endTime"
                type="time"
                defaultValue={value("endTime", defaults.endTime) || "10:00"}
                className={inputClasses}
              />
            </Field>
          </>
        ) : null}

        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <Field
            label="Institutional Venue"
            htmlFor="venueId"
            hint="Select an official venue to enable automated collision detection."
          >
            <select
              id="venueId"
              name="venueId"
              defaultValue={value("venueId", defaults.venueId ?? "")}
              className={inputClasses}
            >
              <option value="">No formal venue assigned / Custom location</option>
              {options.venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name} ({venue.code})
                  {venue.capacity ? ` · Cap: ${venue.capacity}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Custom Location / Notes"
            htmlFor="location"
            hint="Classroom, virtual link, or supplementary venue details."
          >
            <input
              id="location"
              name="location"
              maxLength={200}
              placeholder="e.g. Science Lab 2 or Zoom Link"
              defaultValue={value("location", defaults.location)}
              className={inputClasses}
            />
          </Field>
        </div>

        <Field label="Visibility" htmlFor="visibility">
          <select
            id="visibility"
            name="visibility"
            defaultValue={value("visibility", defaults.visibility) || "PUBLIC"}
            className={inputClasses}
          >
            <option value="PUBLIC">Public - students, staff and visitors</option>
            <option value="STAFF_ONLY">Staff only</option>
          </select>
        </Field>

        <Field label="Audience" htmlFor="scope">
          <select
            id="scope"
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as EventScope)}
            className={inputClasses}
          >
            {(["ALL", "FACULTY", "DEPARTMENT", "LEVEL"] as const).map((option) => (
              <option key={option} value={option}>
                {SCOPE_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {scope === "ALL" ? (
        <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
          This event goes to the whole university. Pick a faculty, department or
          level above to target it instead.
        </p>
      ) : null}

      {scope === "FACULTY" ? (
        <fieldset className="rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">
            Faculties that should see this event
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.faculties.map((faculty) => (
              <label
                key={faculty.id}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  name="targetId"
                  value={faculty.id}
                  defaultChecked={selectedTargets.includes(faculty.id)}
                  className="size-4 rounded border-slate-300"
                />
                {faculty.name} ({faculty.code})
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {scope === "DEPARTMENT" ? (
        <fieldset className="rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">
            Departments that should see this event
          </legend>
          <div className="mt-2 space-y-4">
            {options.faculties.map((faculty) => {
              const departments = options.departments.filter(
                (department) => department.facultyId === faculty.id,
              );
              if (departments.length === 0) return null;

              return (
                <div key={faculty.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {faculty.name}
                  </p>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {departments.map((department) => (
                      <label
                        key={department.id}
                        className="flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          name="targetId"
                          value={department.id}
                          defaultChecked={selectedTargets.includes(department.id)}
                          className="size-4 rounded border-slate-300"
                        />
                        {department.name} ({department.code})
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {scope === "LEVEL" ? (
        <fieldset className="rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">
            Levels that should see this event
          </legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {LEVELS.map((level) => (
              <label
                key={level}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  name="targetId"
                  value={String(level)}
                  defaultChecked={selectedTargets.includes(String(level))}
                  className="size-4 rounded border-slate-300"
                />
                {level} Level
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
        <button
          type="submit"
          name="intent"
          value={mode === "create" ? "draft" : "save"}
          disabled={isPending}
          className={buttonSecondary}
        >
          {isPending ? "Saving..." : mode === "create" ? "Save as draft" : "Save changes"}
        </button>
        <button
          type="submit"
          name="intent"
          value={mode === "create" ? "publish" : "save-publish"}
          disabled={isPending}
          className={buttonPrimary}
        >
          {mode === "create" ? "Save and publish" : "Save and publish"}
        </button>
        <Link
          href={mode === "create" ? "/admin/events" : `/admin/events/${defaults.id}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
