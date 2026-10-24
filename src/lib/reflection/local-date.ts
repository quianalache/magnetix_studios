/**
 * The person's LOCAL calendar day as `YYYY-MM-DD`, offset by whole days.
 * Reflection entries and ritual check-offs are keyed by this. It replaced
 * `new Date().toISOString().slice(0, 10)` (2026-10-23), which is the UTC day —
 * in the evening in the Americas that was already tomorrow, so "today's"
 * reflection and ritual ticks landed on the next day.
 */
export function localDateKey(offsetDays = 0, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
