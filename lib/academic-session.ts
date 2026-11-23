/**
 * Academic session labels that roll forward every year.
 *
 * A LASU session starts in September, so the session that contains a given
 * date is:
 *
 *   • September–December: the session starting that calendar year
 *     (e.g. November 2026 → "2026/2027")
 *   • January–August: the session that started the previous September
 *     (e.g. March 2027 → "2026/2027", September 2027 → "2027/2028")
 *
 * Nothing in the UI hardcodes a session year any more: the front page shows
 * the active session from the database when one exists (see app/page.tsx),
 * and otherwise falls back to the label computed here from today's date.
 * When a new session is created and made active in Admin → Sessions, the
 * front page follows it with no code change.
 *
 * Pure functions, no imports, so both server components and the client
 * landing page can use them.
 */

/** First month (0-based) of a session: September. */
export const SESSION_START_MONTH = 8;

/** The calendar year in which the session containing `date` started. */
export function sessionStartYear(date: Date): number {
  return date.getMonth() >= SESSION_START_MONTH
    ? date.getFullYear()
    : date.getFullYear() - 1;
}

/** "2026/2027" for a date inside that session. */
export function sessionLabelForDate(date: Date): string {
  const start = sessionStartYear(date);
  return `${start}/${start + 1}`;
}

/** Session label for a year/month pair (month is 0-based, like Date). */
export function sessionLabelForYearMonth(year: number, month: number): string {
  return sessionLabelForDate(new Date(year, month, 1));
}

/** Session label for today. */
export function currentSessionLabel(now: Date = new Date()): string {
  return sessionLabelForDate(now);
}

/**
 * Which part of the session a month falls in.
 *
 *   • September–February: Harmattan (first) semester
 *   • March–June: Rain (second) semester
 *   • July–August: sessional break after the session that just ended
 */
export function semesterForYearMonth(
  year: number,
  month: number,
): { semester: string; sessionLabel: string } {
  if (month >= 8 || month <= 1) {
    return {
      semester: "Harmattan Semester",
      sessionLabel: sessionLabelForYearMonth(year, month),
    };
  }
  if (month >= 2 && month <= 5) {
    return {
      semester: "Rain Semester",
      sessionLabel: sessionLabelForYearMonth(year, month),
    };
  }
  // July–August: the break that closes the session that started last September.
  const start = year - 1;
  return { semester: "Sessional Break", sessionLabel: `${start}/${start + 1}` };
}
