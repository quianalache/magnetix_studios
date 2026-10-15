/**
 * Date-only display for the Energetic Decoder (pre-Wave-3 cleanup, 2026-10-15).
 *
 * A birth date is a CALENDAR DATE ("1991-02-28"), not an instant. Passing it
 * to `new Date("1991-02-28")` parses it as midnight UTC, and formatting that
 * in the viewer's local zone shows the PREVIOUS day anywhere west of UTC
 * (every US timezone: "Feb 27, 1991"). This builds the date in UTC and
 * formats it in UTC, so the stored calendar day is shown exactly, whatever
 * the browser's timezone or DST.
 *
 * Display only — never use it for calculation inputs or real timestamps.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDateOnly(value: string | null | undefined, locale?: string): string {
  if (!value) return "—";
  const m = DATE_ONLY.exec(value.trim());
  if (!m) return value;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
