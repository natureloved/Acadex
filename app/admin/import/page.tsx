import { ImportWizard } from "@/components/admin/import-wizard";
import { PageHeading } from "@/components/ui";
import { getSessionOptions } from "@/lib/events";
import { firstParam } from "@/lib/params";
import { IMPORT_HEADERS } from "@/lib/services/imports";

export const metadata = { title: "Import events" };
export const dynamic = "force-dynamic";

/**
 * Bulk import screen.
 *
 * Delegates to the wizard (a client component) because the flow is a two-step
 * state machine: parse-and-preview, then confirm.
 */
export default async function AdminImportPage(props: PageProps<"/admin/import">) {
  const searchParams = await props.searchParams;

  const imported = firstParam(searchParams.imported);
  const skipped = firstParam(searchParams.skipped);
  const published = firstParam(searchParams.published) === "1";
  const error = firstParam(searchParams.error);

  const sessions = await getSessionOptions();
  const sampleHeader = `${IMPORT_HEADERS.join(",")}\nFirst Semester Lectures,Lectures,FIRST,2027-01-11,2027-05-07,All faculties,Teaching continues as published`;

  return (
    <div>
      <PageHeading
        title="Import from CSV"
        description="Paste the approved calendar once instead of typing every line. Dates are YYYY-MM-DD; nothing is saved until you confirm."
      />

      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-600/20"
        >
          {error}
        </p>
      ) : null}

      {imported ? (
        <p
          role="status"
          className="mb-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/20"
        >
          Imported {imported} event{imported === "1" ? "" : "s"}
          {skipped && skipped !== "0" ? `, skipped ${skipped}` : ""} as{" "}
          {published ? "published events" : "drafts"}.
        </p>
      ) : null}

      <div className="mb-5 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">File format</h2>
        <p className="mt-1 text-sm text-slate-600">
          The header row must match exactly, in this order:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-800 ring-1 ring-slate-200">
          {IMPORT_HEADERS.join(",")}
        </pre>
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-600">
          <li>
            <code className="font-mono">semester</code> is <code className="font-mono">FIRST</code> or{" "}
            <code className="font-mono">SECOND</code>.
          </li>
          <li>
            <code className="font-mono">start</code> and <code className="font-mono">end</code> are{" "}
            <code className="font-mono">YYYY-MM-DD</code>.
          </li>
          <li>
            <code className="font-mono">category</code> must match an existing category name.
          </li>
          <li>
            Wrap fields containing commas in double quotes, e.g.{" "}
            <code className="font-mono">&quot;Ojo Campus, Lagos&quot;</code>.
          </li>
        </ul>
        <p className="mt-3 text-sm">
          <a
            href="/csv-import-template.csv"
            download
            className="font-medium text-blue-700 hover:underline"
          >
            Download the template
          </a>
        </p>
      </div>

      <ImportWizard sessions={sessions} sampleHeader={sampleHeader} />
    </div>
  );
}
