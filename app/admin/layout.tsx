import { AdminNav } from "@/components/admin/admin-nav";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Admin shell.
 *
 * The role check happens once here as well as in `proxy.ts` and in every
 * action - defence in depth, because a matcher change must never be the only
 * thing standing between a student and the registry's tools.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireRole("ADMIN");

  return (
    <div>
      <AdminNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
