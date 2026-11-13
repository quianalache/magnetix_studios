import type { Condition, TagRuleInvalidation } from "@/types/workflows";
import type { BroadcastAudienceFilter } from "@/types/broadcasts";
import { sameTag } from "./tag-names";

/**
 * Contacts & Tags (2026-11) — rules that point at a DELETED tag.
 *
 * Deleting a tag never deletes or rewrites the rules that test it (a
 * workflow trigger condition, an If/else branch, a saved Contact List, a
 * broadcast draft's audience) and never turns them into "always true". The
 * rule keeps its configuration and gets an explicit `invalid` marker; until
 * the creator picks another tag:
 *   - any condition group containing it matches NO contact (fail-closed —
 *     including "doesn't have tag" and OR groups),
 *   - a workflow step that holds it (If/else, Add / Remove Tag, …) stops
 *     the run at that step instead of branching or recreating the tag,
 *   - a broadcast audience that holds it can't be sent.
 *
 * A marker only counts while the rule still names the deleted tag, so
 * choosing another tag repairs it. Pure; shared by server and UI.
 */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function asInvalidation(v: unknown): TagRuleInvalidation | null {
  if (!isObj(v) || v.reason !== "tag_deleted" || typeof v.tag !== "string") return null;
  return { reason: "tag_deleted", tag: v.tag, at: typeof v.at === "number" ? v.at : 0 };
}

/** The marker on a condition, if it still applies (value still names the deleted tag). */
export function conditionInvalidation(c: unknown): TagRuleInvalidation | null {
  if (!isObj(c)) return null;
  const inv = asInvalidation(c.invalid);
  return inv && sameTag(c.value, inv.tag) ? inv : null;
}

export function groupInvalidations(group: unknown): TagRuleInvalidation[] {
  const all = isObj(group) && Array.isArray(group.all) ? group.all : [];
  return all.map(conditionInvalidation).filter((x): x is TagRuleInvalidation => !!x);
}

export function groupNeedsAttention(group: unknown): boolean {
  return groupInvalidations(group).length > 0;
}

/** Every `{ all: [...] }` condition group inside a step's config. */
export function findConditionGroups(value: unknown, depth = 0): unknown[] {
  if (!isObj(value) || depth > 6) return [];
  if (Array.isArray(value.all)) return [value];
  return Object.values(value).flatMap((v) => findConditionGroups(v, depth + 1));
}

/** Markers on a workflow step: Add / Remove Tag on a deleted tag, or conditions. */
export function nodeInvalidations(node: { type?: unknown; config?: unknown } | null | undefined): TagRuleInvalidation[] {
  if (!node) return [];
  const cfg = isObj(node.config) ? node.config : {};
  const out: TagRuleInvalidation[] = [];
  if (node.type === "add_tag" || node.type === "remove_tag") {
    const inv = asInvalidation(cfg.invalid);
    if (inv && sameTag(cfg.tag, inv.tag)) out.push(inv);
  }
  for (const g of findConditionGroups(cfg)) out.push(...groupInvalidations(g));
  return out;
}

export function audienceFilterInvalidations(filter: BroadcastAudienceFilter | null | undefined): TagRuleInvalidation[] {
  if (!filter) return [];
  if (filter.kind === "tag") {
    const inv = asInvalidation((filter as { invalid?: unknown }).invalid);
    return inv && sameTag(filter.tag, inv.tag) ? [inv] : [];
  }
  if (filter.kind === "conditions") return groupInvalidations(filter.group);
  return [];
}

/** Plain-language note for a rule that needs attention. */
export function invalidationMessage(inv: TagRuleInvalidation): string {
  return `Needs attention: the tag “${inv.tag}” was deleted. Choose another tag or remove this rule.`;
}

/* ------------------------------ Reconcile ------------------------------ */

const sameCondition = (a: Condition, b: Condition) => a.field === b.field && a.op === b.op && sameTag(a.value, b.value);

/**
 * Keep markers across a save: an incoming condition without a marker that
 * is identical to a stored, still-invalid one inherits it (so an editor
 * that drops unknown fields can't silently re-enable the rule); a marker
 * whose condition now names another tag is dropped (repaired).
 */
export function reconcileGroup<T>(prev: unknown, next: T): T {
  if (!isObj(next) || !Array.isArray(next.all)) return next;
  const stored = (isObj(prev) && Array.isArray(prev.all) ? prev.all : []).filter(
    (c): c is Condition => !!conditionInvalidation(c),
  );
  const all = (next.all as unknown[]).map((raw) => {
    if (!isObj(raw)) return raw;
    const c = raw as unknown as Condition;
    if (c.invalid && !conditionInvalidation(c)) {
      const { invalid: _drop, ...rest } = c;
      void _drop;
      return rest;
    }
    if (!c.invalid) {
      const match = stored.find((s) => sameCondition(s, c));
      if (match) return { ...c, invalid: match.invalid };
    }
    return c;
  });
  return { ...next, all } as T;
}

function reconcileDeep(prev: unknown, next: unknown, depth = 0): unknown {
  if (!isObj(next) || depth > 6) return next;
  if (Array.isArray(next.all)) return reconcileGroup(prev, next);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) out[k] = reconcileDeep(isObj(prev) ? prev[k] : undefined, v, depth + 1);
  return out;
}

/** Same rule for workflow steps (by node id) — Add / Remove Tag + conditions. */
export function reconcileNodes<T extends Record<string, { type?: unknown; config?: unknown }>>(prev: unknown, next: T): T {
  const prevNodes = isObj(prev) ? prev : {};
  const out: Record<string, unknown> = {};
  for (const [id, node] of Object.entries(next)) {
    const before = isObj(prevNodes[id]) ? (prevNodes[id] as { type?: unknown; config?: unknown }) : null;
    let cfg = isObj(node.config) ? { ...node.config } : {};
    if (node.type === "add_tag" || node.type === "remove_tag") {
      const own = asInvalidation(cfg.invalid);
      const stored = before && before.type === node.type && isObj(before.config) ? asInvalidation(before.config.invalid) : null;
      if (own && !sameTag(cfg.tag, own.tag)) delete cfg.invalid;
      else if (!own && stored && sameTag(cfg.tag, stored.tag)) cfg.invalid = stored;
    }
    cfg = reconcileDeep(before?.config, cfg) as Record<string, unknown>;
    out[id] = { ...node, config: cfg };
  }
  return out as T;
}

export function reconcileAudienceFilter(prev: unknown, next: BroadcastAudienceFilter): BroadcastAudienceFilter {
  if (next.kind === "conditions") {
    const prevGroup = isObj(prev) && prev.kind === "conditions" ? prev.group : undefined;
    return { ...next, group: reconcileGroup(prevGroup, next.group) };
  }
  if (next.kind === "tag") {
    const own = asInvalidation((next as { invalid?: unknown }).invalid);
    if (own && !sameTag(next.tag, own.tag)) return { kind: "tag", tag: next.tag };
    if (!own && isObj(prev) && prev.kind === "tag") {
      const stored = asInvalidation(prev.invalid);
      if (stored && sameTag(next.tag, stored.tag)) return { ...next, invalid: stored };
    }
  }
  return next;
}
