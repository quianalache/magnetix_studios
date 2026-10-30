/** Parse only values that are unambiguously numeric. Free-form proof copy such
 * as "10K+", "Over 1,000", and "#1" must remain text rather than being
 * silently coerced into a different display.
 */
export function parseMetricNumber(
  value: string | number | null | undefined
): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:,\d{3})*$/.test(trimmed))
    return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampDecimalPlaces(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(6, Math.trunc(value as number)));
}

/** A finite number from a stored prop: Puck number fields store numbers, but
 * older or hand-edited data may hold numeric strings. Anything else is null —
 * never coerced to 0, so an empty field reads as "not set yet". */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return parseMetricNumber(value);
  return null;
}
