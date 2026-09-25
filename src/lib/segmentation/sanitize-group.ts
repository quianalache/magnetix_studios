import type { Condition, ConditionGroup, ConditionOp } from "@/types/workflows";

/**
 * Validate + normalize a client-supplied ConditionGroup before it's stored
 * (Contact Lists) or evaluated (contacts search). Pure, no server-only
 * marker. Returns an error string instead of throwing so routes can 400.
 *
 * Only the ops the shared evaluator understands are accepted, field paths
 * are restricted to plain contact fields / `customFields.<key>` / the
 * `access` pseudo-field, and sizes are capped so a stored list can't grow
 * unbounded.
 */

export const MAX_CONDITIONS = 25;
const MAX_VALUE = 200;

const KNOWN_OPS: ReadonlySet<ConditionOp> = new Set<ConditionOp>([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_set",
  "not_set",
  "has_tag",
  "not_has_tag",
  "in_stage",
  "source_is",
  "before",
  "after",
  "within_last_days",
  "more_than_days_ago",
  "has_access",
  "not_has_access",
]);

const NO_VALUE_OPS: ReadonlySet<ConditionOp> = new Set<ConditionOp>([
  "is_set",
  "not_set",
]);

const FIELD_RE = /^(access|[A-Za-z][A-Za-z0-9_]{0,63}|customFields\.[A-Za-z0-9_-]{1,64})$/;

export type SanitizeResult =
  | { ok: true; group: ConditionGroup }
  | { ok: false; error: string };

export function sanitizeConditionGroup(input: unknown): SanitizeResult {
  if (input === null || input === undefined) {
    return { ok: true, group: { match: "all", all: [] } };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Filters must be an object." };
  }
  const raw = input as { match?: unknown; all?: unknown };
  const match = raw.match === "any" ? "any" : "all";
  if (raw.all !== undefined && !Array.isArray(raw.all)) {
    return { ok: false, error: "Filter conditions must be a list." };
  }
  const list = (raw.all as unknown[] | undefined) ?? [];
  if (list.length > MAX_CONDITIONS) {
    return { ok: false, error: `Use at most ${MAX_CONDITIONS} conditions.` };
  }
  const all: Condition[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Each condition must be an object." };
    }
    const c = item as { field?: unknown; op?: unknown; value?: unknown };
    const field = typeof c.field === "string" ? c.field.trim() : "";
    const op = c.op as ConditionOp;
    if (!FIELD_RE.test(field)) {
      return { ok: false, error: `Unsupported filter field "${field}".` };
    }
    if (!KNOWN_OPS.has(op)) {
      return { ok: false, error: `Unsupported filter operator "${String(c.op)}".` };
    }
    const accessOp = op === "has_access" || op === "not_has_access";
    if (accessOp !== (field === "access")) {
      return { ok: false, error: "Access conditions must use the access field." };
    }
    const value = typeof c.value === "string" ? c.value.trim().slice(0, MAX_VALUE) : "";
    if (!NO_VALUE_OPS.has(op) && !value) {
      return { ok: false, error: "Every condition needs a value." };
    }
    all.push(NO_VALUE_OPS.has(op) ? { field, op } : { field, op, value });
  }
  return { ok: true, group: { match, all } };
}
