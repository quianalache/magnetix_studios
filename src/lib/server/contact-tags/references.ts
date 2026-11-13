import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { tagKey } from "@/lib/contacts/tag-names";
import type { TagReference, TagReferenceKind, TagUsageType } from "@/types/contact-tags";
import type { TagRuleInvalidation } from "@/types/workflows";
import { conditionInvalidation, nodeInvalidations } from "@/lib/contacts/tag-rule-validity";

/**
 * Every configuration that stores a contact tag name, in one place
 * (Contacts & Tags, 2026-11). The same walkers DISCOVER references (usage
 * lists, delete confirmation) and REWRITE them (rename, merge, delete), so
 * what the creator reviews is exactly what an operation changes.
 *
 * Verified tag-bearing settings (source audit, 2026-11):
 *   workflows        trigger.filters (conditions), if/else + any step
 *                    condition group, Add Tag / Remove Tag steps,
 *                    Create Contact step tags
 *   forms            settings.autoTags
 *   checkoutConfigs  crm.startedTags / marketingOptIn.tags /
 *                    abandoned.tags / completed.tags
 *   embedConfigs     contact.tags (Reading Tools)
 *   broadcasts       DRAFTS only: audienceFilter (tag / conditions)
 *   contactLists     group conditions
 *   funnels/{id}/steps  Upsell / Downsell `offer.onAccept` / `offer.onDecline`
 *                    addTags + removeTags (actions; a deleted tag is moved
 *                    to `invalidTags` for repair and never executed)
 * Sent broadcasts and launched voice campaigns are history and are never
 * rewritten. Hard-coded tags in code ("webinar", "energetic-decoder",
 * "get-leads") are not settings and can't be renamed here.
 */

export interface TagUse {
  value: string;
  context: string;
  kind: TagReferenceKind;
}

export interface ReferenceItem {
  type: TagUsageType;
  id: string;
  /** Firestore path of the document holding the settings. */
  path: string;
  name: string;
  href: string | null;
  status: string | null;
  uses: TagUse[];
}

/** Maps a tag value to its replacement; `null` removes it (lists only). */
export type TagMapper = (value: string) => string | null;
/** Delete: returns the "needs attention" marker for a rule testing `value`. */
export type TagInvalidator = (value: string) => TagRuleInvalidation | null;

type Json = Record<string, unknown>;

const isCondition = (v: unknown): v is { field?: unknown; op?: unknown; value?: unknown } =>
  !!v && typeof v === "object" && "op" in (v as Json);

function isTagCondition(c: { field?: unknown; op?: unknown; value?: unknown }): boolean {
  return (c.op === "has_tag" || c.op === "not_has_tag") && typeof c.value === "string";
}

/* ----------------------------- Collectors ----------------------------- */

function groupUses(group: unknown, context: string): TagUse[] {
  const all = (group as { all?: unknown })?.all;
  if (!Array.isArray(all)) return [];
  return all
    .filter(isCondition)
    .filter(isTagCondition)
    // A rule whose tag was already deleted needs repair, not a usage row.
    .filter((c) => !conditionInvalidation(c))
    .map((c) => ({ value: c.value as string, context, kind: "condition" as const }));
}

function listUses(list: unknown, context: string): TagUse[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t): t is string => typeof t === "string" && !!t.trim())
    .map((value) => ({ value, context, kind: "list" as const }));
}

/** Any `{ all: [...] }` condition group anywhere inside a step's config. */
function findGroups(value: unknown, depth = 0): unknown[] {
  if (!value || typeof value !== "object" || depth > 6) return [];
  if (Array.isArray((value as Json).all)) return [value];
  return Object.values(value as Json).flatMap((v) => findGroups(v, depth + 1));
}

const STEP_GROUP_CONTEXT: Record<string, string> = {
  if_else: "If / else condition",
};

function workflowUses(wf: Json): TagUse[] {
  const uses: TagUse[] = [];
  const trigger = wf.trigger as Json | null;
  if (trigger?.filters) uses.push(...groupUses(trigger.filters, "Trigger condition"));
  const nodes = (wf.nodes ?? {}) as Record<string, Json>;
  for (const node of Object.values(nodes)) {
    const cfg = (node?.config ?? {}) as Json;
    const tagStepInvalid = (node?.type === "add_tag" || node?.type === "remove_tag") && nodeInvalidations({ type: node.type, config: { tag: cfg.tag, invalid: cfg.invalid } }).length > 0;
    if (tagStepInvalid) {
      // Needs repair; not a live use of any tag.
    } else if (node?.type === "add_tag" && typeof cfg.tag === "string" && cfg.tag.trim()) {
      uses.push({ value: cfg.tag, context: "Add tag step", kind: "action" });
    } else if (node?.type === "remove_tag" && typeof cfg.tag === "string" && cfg.tag.trim()) {
      uses.push({ value: cfg.tag, context: "Remove tag step", kind: "action" });
    } else if (node?.type === "create_contact") {
      uses.push(...listUses(cfg.tags, "Create contact step"));
    }
    for (const g of findGroups(cfg)) {
      uses.push(...groupUses(g, STEP_GROUP_CONTEXT[String(node?.type)] ?? "Step condition"));
    }
  }
  return uses;
}

function checkoutUses(cfg: Json): TagUse[] {
  const crm = (cfg.crm ?? {}) as Json;
  return [
    ...listUses(crm.startedTags, "Tags when checkout starts"),
    ...listUses((crm.marketingOptIn as Json | undefined)?.tags, "Marketing opt-in tags"),
    ...listUses((crm.abandoned as Json | undefined)?.tags, "Abandoned checkout tags"),
    ...listUses((crm.completed as Json | undefined)?.tags, "Purchase completed tags"),
  ];
}

const STEP_ACTION_SLOTS: Array<{ side: "onAccept" | "onDecline"; list: "addTags" | "removeTags"; context: string }> = [
  { side: "onAccept", list: "addTags", context: "Added after a successful upsell payment" },
  { side: "onAccept", list: "removeTags", context: "Removed after a successful upsell payment" },
  { side: "onDecline", list: "addTags", context: "Added when the offer is declined" },
  { side: "onDecline", list: "removeTags", context: "Removed when the offer is declined" },
];

function funnelStepUses(step: Json): TagUse[] {
  const offer = step.offer as Json | undefined;
  if (!offer || (step.type !== "upsell" && step.type !== "downsell")) return [];
  return STEP_ACTION_SLOTS.flatMap((slot) =>
    listUses(((offer[slot.side] as Json | undefined) ?? {})[slot.list], slot.context).map((u) => ({ ...u, kind: "action" as const })),
  );
}

function broadcastDraftUses(b: Json): TagUse[] {
  const f = b.audienceFilter as Json | undefined;
  if (!f) return [];
  if (f.kind === "tag" && typeof f.tag === "string") {
    const inv = f.invalid as { tag?: unknown } | undefined;
    if (inv && typeof inv.tag === "string" && tagKey(inv.tag) === tagKey(f.tag)) return [];
    return [{ value: f.tag, context: "Audience", kind: "condition" }];
  }
  if (f.kind === "conditions") return groupUses(f.group, "Audience condition");
  return [];
}

/* ------------------------------ Loaders ------------------------------ */

async function checkoutNames(
  subAccountId: string,
  configs: Array<{ id: string; data: Json }>,
): Promise<Map<string, { name: string; href: string | null }>> {
  const db = getAdminDb();
  const out = new Map<string, { name: string; href: string | null }>();
  const funnelIds = new Set<string>();
  const offerIds = new Set<string>();
  for (const c of configs) {
    const ctx = c.data.context as Json | undefined;
    if (ctx?.type === "funnel_step" && typeof ctx.funnelId === "string") funnelIds.add(ctx.funnelId);
    if (ctx?.type === "hosted_offer" && typeof ctx.offerId === "string") offerIds.add(ctx.offerId);
  }
  const funnelName = new Map<string, string>();
  const stepName = new Map<string, string>();
  for (const fid of funnelIds) {
    const [f, steps] = await Promise.all([
      db.doc(`funnels/${fid}`).get(),
      db.collection(`funnels/${fid}/steps`).get(),
    ]);
    if (f.exists && f.get("subAccountId") === subAccountId) funnelName.set(fid, String(f.get("name") ?? "Funnel"));
    for (const s of steps.docs) stepName.set(`${fid}/${s.id}`, String(s.get("name") ?? "Checkout"));
  }
  const offerTitle = new Map<string, string>();
  if (offerIds.size > 0) {
    const snaps = await db.getAll(
      ...[...offerIds].map((id) => db.doc(`subAccounts/${subAccountId}/courseOffers/${id}`)),
    );
    for (const s of snaps) if (s.exists) offerTitle.set(s.id, String(s.get("title") ?? s.get("name") ?? "Offer"));
  }
  for (const c of configs) {
    const ctx = c.data.context as Json | undefined;
    if (ctx?.type === "funnel_step") {
      const fid = String(ctx.funnelId);
      const sid = String(ctx.stepId);
      const fName = funnelName.get(fid);
      out.set(c.id, {
        name: fName ? `${fName} · ${stepName.get(`${fid}/${sid}`) ?? "Checkout"}` : "Funnel checkout",
        href: fName ? `/sa/${subAccountId}/pages-funnels/funnels/${fid}/steps/${sid}` : null,
      });
    } else if (ctx?.type === "hosted_offer") {
      const oid = String(ctx.offerId);
      out.set(c.id, {
        name: `${offerTitle.get(oid) ?? "Offer"} · Checkout`,
        href: `/sa/${subAccountId}/courses/offers/${oid}/checkout`,
      });
    } else {
      out.set(c.id, { name: "Checkout", href: null });
    }
  }
  return out;
}

/** Every configuration in the workspace that holds at least one tag. */
export async function loadReferenceItems(subAccountId: string): Promise<ReferenceItem[]> {
  const db = getAdminDb();
  const bySa = (col: string) => db.collection(col).where("subAccountId", "==", subAccountId).get();
  const [workflows, forms, checkouts, embeds, broadcasts, lists, funnels] = await Promise.all([
    bySa("workflows"),
    bySa("forms"),
    bySa("checkoutConfigs"),
    bySa("embedConfigs"),
    bySa("broadcasts"),
    bySa("contactLists"),
    bySa("funnels"),
  ]);
  const items: ReferenceItem[] = [];

  for (const d of workflows.docs) {
    const uses = workflowUses(d.data());
    if (uses.length === 0) continue;
    const status = String(d.get("status") ?? "draft");
    items.push({
      type: "workflow",
      id: d.id,
      path: d.ref.path,
      name: String(d.get("name") || "Untitled workflow"),
      href: `/sa/${subAccountId}/workflows/${d.id}`,
      status: status === "active" ? "Active" : status === "paused" ? "Paused" : "Draft",
      uses,
    });
  }
  for (const d of forms.docs) {
    const uses = listUses((d.get("settings") as Json | undefined)?.autoTags, "Tags added on submit");
    if (uses.length === 0) continue;
    items.push({
      type: "form",
      id: d.id,
      path: d.ref.path,
      name: String(d.get("name") || "Untitled form"),
      href: `/sa/${subAccountId}/forms/${d.id}`,
      status: null,
      uses,
    });
  }
  const checkoutWithTags = checkouts.docs
    .map((d) => ({ id: d.id, path: d.ref.path, data: d.data(), uses: checkoutUses(d.data()) }))
    .filter((c) => c.uses.length > 0);
  if (checkoutWithTags.length > 0) {
    const names = await checkoutNames(subAccountId, checkoutWithTags);
    for (const c of checkoutWithTags) {
      const n = names.get(c.id);
      items.push({
        type: "checkout",
        id: c.id,
        path: c.path,
        name: n?.name ?? "Checkout",
        href: n?.href ?? null,
        status: null,
        uses: c.uses,
      });
    }
  }
  for (const d of embeds.docs) {
    const uses = listUses((d.get("contact") as Json | undefined)?.tags, "Tags added to the contact");
    if (uses.length === 0) continue;
    items.push({
      type: "reading_tool",
      id: d.id,
      path: d.ref.path,
      name: String(d.get("name") || "Reading Tool"),
      href: `/sa/${subAccountId}/energetic-decoder?tab=embeds&embed=${d.id}`,
      status: null,
      uses,
    });
  }
  for (const d of broadcasts.docs) {
    if (d.get("status") !== "draft") continue;
    const uses = broadcastDraftUses(d.data());
    if (uses.length === 0) continue;
    items.push({
      type: "broadcast_draft",
      id: d.id,
      path: d.ref.path,
      name: String(d.get("subject") || d.get("subjectPreview") || "Untitled draft"),
      href: `/sa/${subAccountId}/broadcasts/${d.id}/edit`,
      status: "Draft",
      uses,
    });
  }
  // Funnel Upsell / Downsell steps (each funnel's own steps; tenancy re-checked).
  for (const f of funnels.docs) {
    if (f.get("status") === "archived") continue;
    const steps = await db.collection(`funnels/${f.id}/steps`).get();
    for (const st of steps.docs) {
      if (st.get("subAccountId") !== subAccountId) continue;
      const uses = funnelStepUses(st.data());
      if (uses.length === 0) continue;
      items.push({
        type: "funnel_step",
        id: `${f.id}__${st.id}`,
        path: st.ref.path,
        name: `${String(f.get("name") || "Funnel")} · ${String(st.get("name") || "Step")}`,
        href: `/sa/${subAccountId}/pages-funnels/funnels/${f.id}/steps/${st.id}`,
        status: st.get("type") === "downsell" ? "Downsell" : "Upsell",
        uses,
      });
    }
  }
  for (const d of lists.docs) {
    const uses = groupUses(d.get("group"), "List condition");
    if (uses.length === 0) continue;
    items.push({
      type: "contact_list",
      id: d.id,
      path: d.ref.path,
      name: String(d.get("name") || "Contact list"),
      href: `/sa/${subAccountId}/contacts?list=${d.id}`,
      status: null,
      uses,
    });
  }
  return items;
}

/** Items that reference any of `keys`, as UI references (one per item). */
export function referencesForKeys(items: ReferenceItem[], keys: Set<string>): TagReference[] {
  const out: TagReference[] = [];
  for (const item of items) {
    const hits = item.uses.filter((u) => keys.has(tagKey(u.value)));
    if (hits.length === 0) continue;
    out.push({
      type: item.type,
      id: item.id,
      name: item.name,
      href: item.href,
      status: item.status,
      contexts: [...new Set(hits.map((h) => h.context))],
      kinds: [...new Set(hits.map((h) => h.kind))],
    });
  }
  return out;
}

/* ------------------------------ Rewriters ------------------------------ */

function mapList(list: unknown, mapper: TagMapper): { value: string[]; changed: boolean } | null {
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const next: string[] = [];
  let changed = false;
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const mapped = mapper(raw);
    if (mapped !== raw) changed = true;
    if (mapped === null) continue;
    const k = tagKey(mapped);
    if (seen.has(k)) {
      changed = true;
      continue;
    }
    seen.add(k);
    next.push(mapped);
  }
  return { value: next, changed };
}

/**
 * Rewrite tag values inside a condition group. Rename / merge map values;
 * delete (`invalidate`) marks the rule "needs attention" and keeps it —
 * never removes it, so the group can't silently match more contacts.
 * Rules already marked are left alone.
 */
function mapGroup(group: unknown, mapper: TagMapper, invalidate?: TagInvalidator): { value: unknown; changed: boolean } {
  const g = group as { all?: unknown } | null;
  if (!g || !Array.isArray(g.all)) return { value: group, changed: false };
  let changed = false;
  const all = g.all.map((c) => {
    if (!isCondition(c) || !isTagCondition(c) || conditionInvalidation(c)) return c;
    const marker = invalidate?.(c.value as string) ?? null;
    if (marker) {
      changed = true;
      return { ...(c as Json), invalid: marker };
    }
    const mapped = mapper(c.value as string);
    if (mapped === null || mapped === c.value) return c;
    changed = true;
    return { ...(c as Json), value: mapped };
  });
  return { value: changed ? { ...(g as Json), all } : group, changed };
}

function mapDeep(value: unknown, mapper: TagMapper, invalidate?: TagInvalidator, depth = 0): { value: unknown; changed: boolean } {
  if (!value || typeof value !== "object" || depth > 6) return { value, changed: false };
  if (Array.isArray((value as Json).all)) return mapGroup(value, mapper, invalidate);
  if (Array.isArray(value)) return { value, changed: false };
  let changed = false;
  const next: Json = {};
  for (const [k, v] of Object.entries(value as Json)) {
    const r = mapDeep(v, mapper, invalidate, depth + 1);
    if (r.changed) changed = true;
    next[k] = r.value;
  }
  return { value: changed ? next : value, changed };
}

/**
 * The update for one settings document, or null when nothing changes.
 * Rename / merge map values; delete removes list entries only (conditions
 * and Add / Remove Tag steps are left for the owner-approved policy).
 */
export function rewriteItem(type: TagUsageType, data: Json, mapper: TagMapper, invalidate?: TagInvalidator): Json | null {
  const patch: Json = {};
  if (type === "workflow") {
    const trigger = data.trigger as Json | null;
    if (trigger?.filters) {
      const r = mapGroup(trigger.filters, mapper, invalidate);
      if (r.changed) patch.trigger = { ...trigger, filters: r.value };
    }
    const nodes = (data.nodes ?? {}) as Record<string, Json>;
    let nodesChanged = false;
    const nextNodes: Record<string, Json> = {};
    for (const [id, node] of Object.entries(nodes)) {
      let cfg = (node?.config ?? {}) as Json;
      let changed = false;
      if (
        (node?.type === "add_tag" || node?.type === "remove_tag") &&
        typeof cfg.tag === "string" &&
        nodeInvalidations({ type: node.type, config: cfg }).length === 0
      ) {
        const marker = invalidate?.(cfg.tag) ?? null;
        if (marker) {
          // Deleted tag: the step needs configuration and stops runs —
          // it can't recreate the tag.
          cfg = { ...cfg, invalid: marker };
          changed = true;
        } else {
          const mapped = mapper(cfg.tag);
          if (mapped !== null && mapped !== cfg.tag) {
            cfg = { ...cfg, tag: mapped };
            changed = true;
          }
        }
      }
      if (node?.type === "create_contact") {
        const r = mapList(cfg.tags, mapper);
        if (r?.changed) {
          cfg = { ...cfg, tags: r.value };
          changed = true;
        }
      }
      const deep = mapDeep(cfg, mapper, invalidate);
      if (deep.changed) {
        cfg = deep.value as Json;
        changed = true;
      }
      if (changed) nodesChanged = true;
      nextNodes[id] = changed ? { ...node, config: cfg } : node;
    }
    if (nodesChanged) patch.nodes = nextNodes;
  } else if (type === "form") {
    const settings = (data.settings ?? {}) as Json;
    const r = mapList(settings.autoTags, mapper);
    if (r?.changed) patch["settings.autoTags"] = r.value;
  } else if (type === "checkout") {
    const crm = (data.crm ?? {}) as Json;
    const slots: Array<[string, unknown]> = [
      ["crm.startedTags", crm.startedTags],
      ["crm.marketingOptIn.tags", (crm.marketingOptIn as Json | undefined)?.tags],
      ["crm.abandoned.tags", (crm.abandoned as Json | undefined)?.tags],
      ["crm.completed.tags", (crm.completed as Json | undefined)?.tags],
    ];
    for (const [path, list] of slots) {
      const r = mapList(list, mapper);
      if (r?.changed) patch[path] = r.value;
    }
  } else if (type === "reading_tool") {
    const r = mapList((data.contact as Json | undefined)?.tags, mapper);
    if (r?.changed) patch["contact.tags"] = r.value;
  } else if (type === "broadcast_draft") {
    const f = data.audienceFilter as Json | undefined;
    if (f?.kind === "tag" && typeof f.tag === "string" && !f.invalid) {
      const marker = invalidate?.(f.tag) ?? null;
      const mapped = marker ? null : mapper(f.tag);
      if (marker) patch.audienceFilter = { ...f, invalid: marker };
      else if (mapped !== null && mapped !== f.tag) patch.audienceFilter = { ...f, tag: mapped };
    } else if (f?.kind === "conditions") {
      const r = mapGroup(f.group, mapper, invalidate);
      if (r.changed) patch.audienceFilter = { ...f, group: r.value };
    }
  } else if (type === "contact_list") {
    const r = mapGroup(data.group, mapper, invalidate);
    if (r.changed) patch.group = r.value;
  } else if (type === "funnel_step") {
    // Rename / merge rewrite the lists. Delete takes the tag out of the list
    // (so it can't run or be recreated) and records a repair marker the Step
    // Settings show as "needs attention".
    const offer = (data.offer ?? {}) as Json;
    for (const side of ["onAccept", "onDecline"] as const) {
      const action = (offer[side] ?? {}) as Json;
      const markers: Json[] = Array.isArray(action.invalidTags) ? [...(action.invalidTags as Json[])] : [];
      let sideChanged = false;
      for (const list of ["addTags", "removeTags"] as const) {
        const values = Array.isArray(action[list]) ? (action[list] as unknown[]).filter((t): t is string => typeof t === "string") : null;
        if (!values) continue;
        for (const v of values) {
          const marker = invalidate?.(v) ?? null;
          if (marker && !markers.some((m) => m.list === list && typeof m.tag === "string" && tagKey(m.tag) === tagKey(v))) {
            markers.push({ reason: marker.reason, tag: v, list, at: marker.at });
            sideChanged = true;
          }
        }
        const r = mapList(values, mapper);
        if (r?.changed) {
          patch[`offer.${side}.${list}`] = r.value;
          sideChanged = true;
        }
      }
      if (sideChanged && markers.length) patch[`offer.${side}.invalidTags`] = markers;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
