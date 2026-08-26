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

function getField(contact: Contact, path: string): unknown {
  if (path.startsWith("customFields.")) {
    const key = path.slice("customFields.".length);
    return contact.customFields?.[key] ?? null;
  }
  return (contact as unknown as Record<string, unknown>)[path] ?? null;
}

function evalOne(contact: Contact, c: Condition): boolean {
  const raw = getField(contact, c.field);
  const val = (c.value ?? "").trim();
  const op: ConditionOp = c.op;
  switch (op) {
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
): boolean {
  const all = group?.all ?? [];
  if (all.length === 0) return true;
  return group?.match === "any"
    ? all.some((c) => evalOne(contact, c))
    : all.every((c) => evalOne(contact, c));
}
