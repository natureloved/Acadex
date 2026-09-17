import {
  buttonPrimary,
  buttonSecondary,
  inputClasses,
  labelClasses,
  PageHeading,
} from "@/components/ui";
import {
  createVenueAction,
  deleteVenueAction,
  updateVenueAction,
} from "@/lib/actions/admin-venues";
import { firstParam } from "@/lib/params";
import { listVenuesForAdmin } from "@/lib/services/venues";

export const metadata = { title: "Venues" };
export const dynamic = "force-dynamic";

const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-rose-800 ring-1 ring-rose-300 transition-all duration-150 hover:bg-rose-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600";

/**
 * Institutional Venues administration page.
 *
 * Implements FR3, FR9, Table 3.8, and Figure 5.3 venue conflict prevention.
 */
export default async function AdminVenuesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const saved = firstParam(searchParams.saved);
  const error = firstParam(searchParams.error);

  const venues = await listVenuesForAdmin();

  return (
    <div>
      <PageHeading
        title="Institutional Venues"
        description="Lecture theatres, halls, and auditoriums across LASU campuses. Acadex enforces Figure 5.3 interval-overlap conflict detection so no venue is double-booked."
      />

      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
        >
          {error}
        </p>
      ) : null}

      {saved ? (
        <p
          role="status"
          className="mb-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          {saved}
        </p>
      ) : null}

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Add a New Venue</h2>
        <p className="mt-1 text-xs text-slate-500">
          Register a physical facility with its seat capacity and campus location.
        </p>
        <form action={createVenueAction} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div>
            <label htmlFor="new-venue-name" className={labelClasses}>
              Venue Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="new-venue-name"
              name="name"
              required
              maxLength={100}
              placeholder="e.g. Buba Marwa Auditorium"
              className={`${inputClasses} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="new-venue-code" className={labelClasses}>
              Unique Code <span className="text-rose-500">*</span>
            </label>
            <input
              id="new-venue-code"
              name="code"
              required
              maxLength={20}
              placeholder="e.g. BMA"
              className={`${inputClasses} mt-1 font-mono uppercase`}
            />
          </div>

          <div>
            <label htmlFor="new-venue-capacity" className={labelClasses}>
              Capacity (Seats)
            </label>
            <input
              id="new-venue-capacity"
              name="capacity"
              type="number"
              min={0}
              placeholder="e.g. 2500"
              className={`${inputClasses} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="new-venue-location" className={labelClasses}>
              Campus Location
            </label>
            <input
              id="new-venue-location"
              name="location"
              placeholder="e.g. Ojo Campus"
              className={`${inputClasses} mt-1`}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button type="submit" className={buttonPrimary}>
              Register Venue
            </button>
          </div>
        </form>
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[45rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3 font-semibold">
                Venue Name
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Code
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Capacity
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Location
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Booked Events
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {venues.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  No venues registered yet. Add one above.
                </td>
              </tr>
            ) : null}
            {venues.map((venue) => (
              <tr key={venue.id} className="align-top hover:bg-slate-50/50 transition">
                <td className="px-4 py-3.5">
                  <span className="font-semibold text-slate-900 block">
                    {venue.name}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-300">
                    {venue.code}
                  </span>
                </td>
                <td className="px-4 py-3.5 tabular-nums text-slate-700">
                  {venue.capacity !== null ? venue.capacity.toLocaleString() : "Unassigned"}
                </td>
                <td className="px-4 py-3.5 text-slate-600">
                  {venue.location ?? "Unassigned"}
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    venue.eventCount > 0
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-700/20"
                      : "bg-slate-100 text-slate-600"
                  }`}>
                    {venue.eventCount} {venue.eventCount === 1 ? "event" : "events"}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <details className="text-left">
                      <summary className="cursor-pointer text-xs font-semibold text-blue-700 hover:underline">
                        Edit
                      </summary>
                      <div className="absolute right-8 z-10 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
                        <form action={updateVenueAction} className="space-y-3">
                          <input type="hidden" name="venueId" value={venue.id} />
                          <div>
                            <label className={labelClasses} htmlFor={`venue-name-${venue.id}`}>
                              Name
                            </label>
                            <input
                              id={`venue-name-${venue.id}`}
                              name="name"
                              required
                              defaultValue={venue.name}
                              className={`${inputClasses} mt-1`}
                            />
                          </div>
                          <div>
                            <label className={labelClasses} htmlFor={`venue-code-${venue.id}`}>
                              Code
                            </label>
                            <input
                              id={`venue-code-${venue.id}`}
                              name="code"
                              required
                              defaultValue={venue.code}
                              className={`${inputClasses} mt-1 font-mono uppercase`}
                            />
                          </div>
                          <div>
                            <label className={labelClasses} htmlFor={`venue-cap-${venue.id}`}>
                              Capacity
                            </label>
                            <input
                              id={`venue-cap-${venue.id}`}
                              name="capacity"
                              type="number"
                              min={0}
                              defaultValue={venue.capacity ?? ""}
                              className={`${inputClasses} mt-1`}
                            />
                          </div>
                          <div>
                            <label className={labelClasses} htmlFor={`venue-loc-${venue.id}`}>
                              Location
                            </label>
                            <input
                              id={`venue-loc-${venue.id}`}
                              name="location"
                              defaultValue={venue.location ?? ""}
                              className={`${inputClasses} mt-1`}
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <button type="submit" className={buttonSecondary}>
                              Save
                            </button>
                          </div>
                        </form>
                      </div>
                    </details>

                    <form action={deleteVenueAction}>
                      <input type="hidden" name="venueId" value={venue.id} />
                      <button
                        type="submit"
                        disabled={venue.eventCount > 0}
                        title={
                          venue.eventCount > 0
                            ? `${venue.eventCount} event(s) are booked in this venue`
                            : undefined
                        }
                        className={`${DANGER_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
