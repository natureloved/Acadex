"use client";

/**
 * CSV import, in two steps.
 *
 * 1. "Check the file" parses and validates everything and writes nothing.
 * 2. "Import" re-posts the raw CSV; the server parses it again and writes the
 *    rows that passed. The client never sends a list of rows to be trusted.
 */
import { useActionState } from "react";

import { buttonPrimary, buttonSecondary, inputClasses, labelClasses } from "@/components/ui";
import { confirmImportAction, previewImportAction } from "@/lib/actions/admin-import";
import { initialImportState } from "@/lib/actions/form-state";
import { SEMESTER_LABELS, type SemesterType } from "@/lib/constants";

const PREVIEW_LIMIT = 60;

export function ImportWizard({
  sessions,
  sampleHeader,
}: {
  sessions: { id: string; name: string; isActive: boolean }[];
  sampleHeader: string;
}) {
  const [state, formAction, isPending] = useActionState(
    previewImportAction,
    initialImportState,
  );

  return (
    <div className="space-y-6">
      <form
        key={state.submitId}
        action={formAction}
        encType="multipart/form-data"
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-slate-900">1. Choose the session and file</h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sessionId" className={labelClasses}>
              Session
            </label>
            <select
              id="sessionId"
              name="sessionId"
              required
              defaultValue={state.sessionId}
              className={`${inputClasses} mt-1`}
            >
              <option value="">Choose a session...</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.isActive ? " (current)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="file" className={labelClasses}>
              CSV file
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              className="mt-1 block w-full cursor-pointer rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-slate-700"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="csvText" className={labelClasses}>
              ...or paste the rows
            </label>
            <textarea
              id="csvText"
              name="csvText"
              rows={5}
              placeholder={sampleHeader}
              defaultValue={state.status === "error" ? state.csv : ""}
              className={`${inputClasses} mt-1 font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Header row must be: <code className="font-mono">{sampleHeader}</code>
            </p>
          </div>
        </div>

        {state.status === "error" ? (
          <div
            role="alert"
            className="mt-4 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
          >
            <p className="font-semibold">Nothing was imported.</p>
            <ul className="mt-1 list-disc pl-5">
              {state.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className={buttonPrimary} disabled={isPending}>
            {isPending ? "Checking..." : "Check the file"}
          </button>
          <p className="text-xs text-slate-500">
            Nothing is written to the calendar until you confirm on the next step.
          </p>
        </div>
      </form>

      {state.status === "preview" ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">2. Review</h2>
            <p className="mt-1 text-sm text-slate-600">
              Importing into <strong>{state.sessionName}</strong>:
              <strong> {state.valid.length}</strong> row
              {state.valid.length === 1 ? "" : "s"} ready,
              <strong> {state.invalid.length}</strong> rejected.
            </p>

            {state.invalid.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-rose-800">
                  Rejected rows (these will not be imported)
                </h3>
                <ul className="mt-2 max-h-56 overflow-y-auto rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-600/20">
                  {state.invalid.map((issue) => (
                    <li key={`${issue.line}-${issue.reason}`}>
                      Line {issue.line}: {issue.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {state.valid.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="py-2 pr-3 font-semibold">
                        Line
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Title
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Semester
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Dates
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.valid.slice(0, PREVIEW_LIMIT).map((row) => (
                      <tr key={`${row.line}-${row.title}`} className="border-b border-slate-100 last:border-b-0">
                        <td className="py-2 pr-3 tabular-nums text-slate-500">{row.line}</td>
                        <td className="px-3 py-2 text-slate-800">{row.title}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                          {SEMESTER_LABELS[row.semester as SemesterType] ?? row.semester}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                          {row.start} &rarr; {row.end}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {state.valid.length > PREVIEW_LIMIT ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Showing the first {PREVIEW_LIMIT} of {state.valid.length} rows.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <form
            action={confirmImportAction}
            className="rounded-lg border border-slate-200 bg-white p-5"
          >
            <h2 className="text-sm font-semibold text-slate-900">3. Import</h2>
            <input type="hidden" name="sessionId" value={state.sessionId} />
            <input type="hidden" name="csv" value={state.csv} />

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                name="publish"
                className="size-4 rounded border-slate-300"
              />
              Publish immediately (otherwise the events arrive as drafts)
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" className={buttonPrimary}>
                Import {state.valid.length} event
                {state.valid.length === 1 ? "" : "s"}
              </button>
              <a href="/admin/import" className={buttonSecondary}>
                Start over
              </a>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}
