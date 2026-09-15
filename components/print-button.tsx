"use client";

/**
 * "Print / save as PDF" button for the print view.
 *
 * `window.print()` opens the browser's own print dialog, where "Save as PDF" is
 * one of the destinations — so one button covers both printing and PDF export
 * without shipping a PDF library (which the brief forbids anyway).
 */
import { buttonPrimary } from "@/components/ui";

export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonPrimary} no-print`}>
      {label}
    </button>
  );
}
