const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Canonical full-page destination for a Routine opened from Calendar. */
export function routineCalendarPath(routineId: string, date?: string | null): string {
  const path = `/projects/routines/${encodeURIComponent(routineId)}`;
  return date && YMD.test(date) ? `${path}?date=${encodeURIComponent(date)}` : path;
}

/** Ignore malformed Calendar query values rather than passing them to the API. */
export function routineCalendarDate(value: string | null): string | null {
  return value && YMD.test(value) ? value : null;
}
