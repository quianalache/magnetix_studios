import type { ConditionGroup, ConditionOp } from "@/types/workflows";
import type { BroadcastAudienceFilter } from "@/types/broadcasts";

/**
 * Production safety controls (2026-08-26) — added after a live incident
 * where a lone `not_has_tag` condition (intended to match 2 QA contacts)
 * instead matched 1,592 real contacts, because "NOT tagged X" with no other
 * narrowing condition matches every contact in the CRM that lacks the tag.
 *
 * Deliberately no "server-only" marker — used both by the composer (to show
 * the warning banner before send) and, in spirit, describes the exact shape
 * the send route treats as needing extra scrutiny. Pure and side-effect
 * free either way.
 *
 * This is advisory, not a block — negation operators are legitimate
 * segmentation tools (e.g. "not_has_tag unsubscribed-from-newsletter"
 * combined with other conditions is normal and fine). The warning exists so
 * an operator sees "this may be broader than you think" before confirming,
 * not so they're prevented from ever using NOT.
 */
const NEGATION_OPS: ReadonlySet<ConditionOp> = new Set([
  "not_equals",
  "not_contains",
  "not_has_tag",
  "not_set",
]);

export function conditionGroupHasNegation(group: ConditionGroup | undefined | null): boolean {
  if (!group) return false;
  return group.all.some((c) => NEGATION_OPS.has(c.op));
}

/** True when the audience filter contains a pattern likely to resolve much
 *  broader than intended — any negation operator, anywhere in the group. */
export function audienceFilterIsBroad(filter: BroadcastAudienceFilter | null | undefined): boolean {
  if (!filter || filter.kind !== "conditions") return false;
  return conditionGroupHasNegation(filter.group);
}
