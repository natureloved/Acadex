"use client";

/**
 * Copy-to-clipboard field for the subscription address.
 *
 * The only client component in the app, and deliberately a small one: the URL is
 * rendered as a real read-only input, so with JavaScript disabled (or when the
 * Clipboard API is blocked, which happens outside a secure context) the user can
 * still select the text and copy it by hand.
 */
import { useRef, useState } from "react";

import { buttonSecondary, inputClasses } from "@/components/ui";

export function CopyField({
  id,
  label,
  value,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      // Clipboard access requires a secure context and can be refused; selecting
      // the text is the graceful fallback rather than a dead button.
      inputRef.current?.select();
      setStatus("manual");
    }
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className={`${inputClasses} font-mono text-xs sm:text-sm`}
        />
        <button
          type="button"
          onClick={copy}
          className={`${buttonSecondary} shrink-0 no-print`}
        >
          Copy
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-1 text-xs text-slate-600">
        {status === "copied"
          ? "Copied to the clipboard."
          : status === "manual"
            ? "Select the address above and press Ctrl/Cmd + C to copy it."
            : (hint ?? "")}
      </p>
    </div>
  );
}
