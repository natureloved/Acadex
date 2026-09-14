import { buttonPrimary, buttonSecondary, inputClasses, labelClasses, PageHeading } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { firstParam } from "@/lib/params";
import { listAuditActions, listAuditEntries } from "@/lib/services/events";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

/** Pretty-print the stored metadata, tolerating rows with none. */
function summarise(metaJson: string | null): string {
  if (!metaJson) return "—";
  try {
    const parsed = JSON.parse(metaJson) as Record<string, unknown>;
    const parts = Object.entries(parsed).map(([key, value]) => {
      const rendered =
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
      return `${key}: ${rendered}`;
    });
    return parts.join(" · ");
  } catch {
    return metaJson;
  }
}

/**
 * Who changed what, and when.
 *
 * This is the accountability half of the change-history story: the public sees
 * that a date moved, and the registry can see who moved it.
 */
export default async function AdminAuditPage(props: PageProps<"/admin/audit">) {
  const searchParams = await props.searchParams;
  const action = firstParam(searchParams.action);

  const [entries, actions] = await Promise.all([
    listAuditEntries({ action, limit: 150 }),
    listAuditActions(),
  ]);

  return (
    <div>
      <PageHeading
        title="Audit log"
        description="Every create, edit, publish, reschedule, cancellation and deletion, newest first."
      />

      <form
        method="get"
        action="/admin/audit"
        className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="min-w-56">
          <label htmlFor="action" className={labelClasses}>
            Action
          </label>
          <select
            id="action"
            name="action"
            defaultValue={action ?? ""}
            className={`${inputClasses} mt-1`}
          >
            <option value="">All actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonPrimary}>
          Filter
        </button>
        {action ? (
          <a href="/admin/audit" className={buttonSecondary}>
            Clear
          </a>
        ) : null}
        <p className="ml-auto text-sm text-slate-600">{entries.length} entries</p>
      </form>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No audit entries match that filter yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-3 font-semibold">
                  When
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Who
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Action
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Record
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 align-top last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {entry.actorName ?? "system"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-700 ring-1 ring-slate-300">
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{entry.entity}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {summarise(entry.metaJson)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
