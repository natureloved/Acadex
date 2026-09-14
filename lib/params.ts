/**
 * Helpers for reading `searchParams`.
 *
 * A query string may repeat a key (`?q=a&q=b`), in which case Next.js hands the
 * page an array. These helpers collapse that to a single value so page code
 * does not have to branch on every parameter.
 */

export type SearchParamValue = string | string[] | undefined;

export function firstParam(value: SearchParamValue): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** True when a value is present, so the UI can highlight an active filter. */
export function isActiveFilter(value: SearchParamValue): boolean {
  return firstParam(value) !== undefined;
}
