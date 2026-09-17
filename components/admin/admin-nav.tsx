"use client";

/**
 * Admin sub-navigation.
 *
 * The only client component in the admin area that is not a form: it needs
 * `usePathname` to highlight the current section. Keeping it small keeps the
 * public calendar's bundle untouched.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/audit", label: "Audit" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="border-b border-slate-200">
      <ul className="-mb-px flex flex-wrap gap-1">
        {LINKS.map((link) => {
          const isActive =
            link.href === "/admin"
              ? pathname === "/admin"
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-block border-b-2 px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-blue-700 text-blue-800"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
