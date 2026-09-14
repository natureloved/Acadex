import {
  buttonPrimary,
  buttonSecondary,
  inputClasses,
  labelClasses,
  PageHeading,
} from "@/components/ui";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/admin-sessions";
import { firstParam } from "@/lib/params";
import { listCategoriesForAdmin } from "@/lib/services/categories";

export const metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

const DANGER_BUTTON =
  "inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-rose-800 ring-1 ring-rose-300 transition hover:bg-rose-50";

/**
 * Colour-coded event categories.
 *
 * A category that is still attached to events cannot be deleted - the service
 * refuses and this page shows why - because every event must keep a category.
 */
export default async function AdminCategoriesPage(
  props: PageProps<"/admin/categories">,
) {
  const searchParams = await props.searchParams;
  const saved = firstParam(searchParams.saved);
  const error = firstParam(searchParams.error);

  const categories = await listCategoriesForAdmin();

  return (
    <div>
      <PageHeading
        title="Categories"
        description="The colour-coded buckets used across the calendar, with how many events currently use each one."
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

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Add a category</h2>
        <form action={createCategoryAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-56 grow">
            <label htmlFor="new-category-name" className={labelClasses}>
              Name
            </label>
            <input
              id="new-category-name"
              name="name"
              required
              maxLength={60}
              placeholder="e.g. Alumni Events"
              className={`${inputClasses} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="new-category-color" className={labelClasses}>
              Colour
            </label>
            <input
              id="new-category-color"
              name="color"
              type="color"
              defaultValue="#1d4ed8"
              className="mt-1 block h-10 w-20 cursor-pointer rounded-md border-0 bg-white ring-1 ring-inset ring-slate-300"
            />
          </div>
          <button type="submit" className={buttonPrimary}>
            Add category
          </button>
        </form>
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3 font-semibold">
                Category
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Slug
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Events
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Colour
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-b border-slate-100 align-top last:border-b-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <span
                      aria-hidden="true"
                      className="size-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {category.slug}
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-700">
                  {category.eventCount}
                </td>
                <td className="px-4 py-3 font-mono text-xs uppercase text-slate-600">
                  {category.color}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:underline">
                        Edit
                      </summary>
                      <form
                        action={updateCategoryAction}
                        className="mt-2 flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="categoryId" value={category.id} />
                        <div>
                          <label
                            className={labelClasses}
                            htmlFor={`cat-name-${category.id}`}
                          >
                            Name
                          </label>
                          <input
                            id={`cat-name-${category.id}`}
                            name="name"
                            required
                            defaultValue={category.name}
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <label
                            className={labelClasses}
                            htmlFor={`cat-color-${category.id}`}
                          >
                            Colour
                          </label>
                          <input
                            id={`cat-color-${category.id}`}
                            name="color"
                            type="color"
                            defaultValue={category.color}
                            className="block h-10 w-16 cursor-pointer rounded-md border-0 bg-white ring-1 ring-inset ring-slate-300"
                          />
                        </div>
                        <button type="submit" className={buttonSecondary}>
                          Save
                        </button>
                      </form>
                    </details>

                    <form action={deleteCategoryAction}>
                      <input type="hidden" name="categoryId" value={category.id} />
                      <button
                        type="submit"
                        disabled={category.eventCount > 0}
                        title={
                          category.eventCount > 0
                            ? `${category.eventCount} event(s) still use this category`
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
