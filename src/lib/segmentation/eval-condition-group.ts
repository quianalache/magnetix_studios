import type { Condition, ConditionGroup, ConditionOp } from "@/types/workflows";
import type { Contact } from "@/types/contacts";

/**
 * Broadcast Segmentation V1 (2026-08-27) — the SAME condition-group engine
 * `workflows/conditions.ts` already used for trigger filters and if/else
 * branches, extracted into its own file with no `"server-only"` marker so
 * the exact same evaluator can also power Broadcast's LIVE audience-count
 * preview in the browser, not just the server-side send resolver. This is
 * deliberately a pure, side-effect-free module — no Firestore, no fetch —
 * so it's safe in either environment. `workflows/conditions.ts` re-exports
 * from here unchanged, so nothing about the existing Workflow engine's
 * import surface or behavior changed.
 *
 * `match: "all"` (the default) requires every condition; `match: "any"`
 * requires at least one. An empty/undefined group is always true (no
 * filter) — same contract as before this extraction.
 */

/**
 * Optional evaluation context (Contacts redesign, 2026-09-25). Every
 * existing caller passes nothing and gets exactly the old behavior.
 *
 *   - `accessIndex` — server-built map of access key ("offer:{id}",
 *     "course:{id}", "community:{groupId}") → contact ids that currently
 *     hold that access (see `lib/segmentation/access-index.ts`). When absent,
 *     `has_access` / `not_has_access` both evaluate to FALSE — a caller that
 *     can't see entitlement data (the client-side broadcast preview, workflow
 *     trigger filters) never guesses either way.
 *   - `now` — epoch ms for the relative date ops; defaults to Date.now().
 */
export interface ConditionEvalContext {
  accessIndex?: ReadonlyMap<string, ReadonlySet<string>> | null;
  now?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Timestamp-ish → epoch ms. Handles Firestore Timestamps (client or Admin
 *  SDK — both expose toDate / seconds), Dates, ISO strings, epoch numbers. */
export function toEpochMs(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  const maybe = raw as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof maybe.toDate === "function") {
    const t = maybe.toDate().getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  if (typeof maybe._seconds === "number") return maybe._seconds * 1000;
  return null;
}

/** "YYYY-MM-DD" → UTC midnight epoch ms, or null when malformed. */
function utcDayStart(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

function wholeDays(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) return null;
  return Number(value);
}

function getField(contact: Contact, path: string): unknown {
  if (path.startsWith("customFields.")) {
    const key = path.slice("customFields.".length);
    return contact.customFields?.[key] ?? null;
  }
  return (contact as unknown as Record<string, unknown>)[path] ?? null;
}

function evalOne(
  contact: Contact,
  c: Condition,
  ctx?: ConditionEvalContext,
): boolean {
  const op: ConditionOp = c.op;
  const val = (c.value ?? "").trim();
  if (op === "has_access" || op === "not_has_access") {
    const holders = ctx?.accessIndex?.get(val);
    if (!ctx?.accessIndex || !val) return false;
    const has = !!holders && holders.has(contact.id);
    return op === "has_access" ? has : !has;
  }
  const raw = getField(contact, c.field);
  switch (op) {
    case "before": {
      const at = toEpochMs(raw);
      const day = utcDayStart(val);
      return at !== null && day !== null && at < day;
    }
    case "after": {
      const at = toEpochMs(raw);
      const day = utcDayStart(val);
      return at !== null && day !== null && at >= day + DAY_MS;
    }
    case "within_last_days": {
      const at = toEpochMs(raw);
      const days = wholeDays(val);
      const now = ctx?.now ?? Date.now();
      return at !== null && days !== null && at >= now - days * DAY_MS && at <= now;
    }
    case "more_than_days_ago": {
      const at = toEpochMs(raw);
      const days = wholeDays(val);
      const now = ctx?.now ?? Date.now();
      return at !== null && days !== null && at < now - days * DAY_MS;
    }
    case "is_set":
      return raw !== null && raw !== undefined && raw !== "";
    case "not_set":
      return raw === null || raw === undefined || raw === "";
    case "has_tag":
      return Array.isArray(contact.tags) && contact.tags.includes(val);
    case "not_has_tag":
      return !(Array.isArray(contact.tags) && contact.tags.includes(val));
    case "in_stage":
      return (contact.pipelineStage ?? "") === val;
    case "source_is":
      return (contact.source ?? "") === val;
    case "equals":
      return String(raw ?? "") === val;
    case "not_equals":
      return String(raw ?? "") !== val;
    case "contains":
      return String(raw ?? "").toLowerCase().includes(val.toLowerCase());
    case "not_contains":
      return !String(raw ?? "").toLowerCase().includes(val.toLowerCase());
    default:
      return false;
  }
}

export function evalConditionGroup(
  group: ConditionGroup | undefined,
  contact: Contact,
  ctx?: ConditionEvalContext,
): boolean {
  const all = group?.all ?? [];
  if (all.length === 0) return true;
  return group?.match === "any"
    ? all.some((c) => evalOne(contact, c, ctx))
    : all.every((c) => evalOne(contact, c, ctx));
}

/** True when any condition needs the server-built access index. */
export function groupUsesAccessConditions(
  group: ConditionGroup | null | undefined,
): boolean {
  return !!group?.all?.some(
    (c) => c.op === "has_access" || c.op === "not_has_access",
  );
}
