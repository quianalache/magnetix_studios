import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWorkflowEvent } from "@/lib/workflows/events";
import { recordContactActivity } from "@/lib/server/contact-activity";
import { invalidateContactsCache } from "@/lib/server/contacts-query-service";
import {
  cleanTagName,
  tagKey,
  TAG_SOURCE_LABELS,
  type TagChangeSource,
} from "@/lib/contacts/tag-names";
import { registerTagNames, resolveRegistryNames } from "./registry";

/**
 * The one tag-writing service (Contacts & Tags, 2026-11). Every module that
 * puts tags on a contact or takes them off goes through here, so all of
 * them:
 *   - use the registry's spelling ("vip" from a form lands as "VIP" when
 *     the workspace already has "VIP"),
 *   - register brand-new tags in the central library,
 *   - fire Tag Added / Tag Removed workflow events ONLY for real changes,
 *   - write a Tag added / Tag removed Contact Activity row with its source,
 *   - carry workflow context so tag-triggered workflows can't loop forever.
 */

export interface TagChangeContext {
  source: TagChangeSource;
  /** Id of the record that caused the change (form, checkout order, …). */
  sourceId?: string | null;
  /** Staff uid when a person made the change. */
  actorUid?: string | null;
  /** Set when a workflow step made the change. */
  workflow?: {
    workflowId: string;
    runId: string;
    chainDepth: number;
    /** Batch B: the Test run this change traces back to, if any. */
    testOrigin?: { rootRunId: string; rootWorkflowId: string } | null;
    /** Preserve the TEST funnel no-delivery boundary through tag triggers. */
    sandbox?: boolean;
  } | null;
}

/** Same-key comparison: "VIP" and "vip " are one tag. */
export function diffTagLists(oldTags: string[], newTags: string[]): { added: string[]; removed: string[] } {
  const oldKeys = new Set(oldTags.map(tagKey));
  const newKeys = new Set(newTags.map(tagKey));
  return {
    added: newTags.filter((t) => !oldKeys.has(tagKey(t))),
    removed: oldTags.filter((t) => !newKeys.has(tagKey(t))),
  };
}

/** Dedupe by key, keeping the first spelling and the original order. */
function dedupeByKey(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = tagKey(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/**
 * Clean, dedupe and map names to the registry spelling, registering new
 * tags. Use before writing a full tag list (contact create / replace).
 */
export async function canonicalizeTagList(input: {
  subAccountId: string;
  agencyId: string;
  names: unknown;
  ctx: TagChangeContext;
}): Promise<string[]> {
  const raw = Array.isArray(input.names)
    ? input.names.filter((n): n is string => typeof n === "string").map(cleanTagName).filter(Boolean)
    : [];
  if (raw.length === 0) return [];
  const map = await registerTagNames({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    names: raw,
    createdByUid: input.ctx.actorUid ?? null,
    createdVia: input.ctx.source,
  });
  return dedupeByKey(raw.map((n) => map.get(n) ?? n));
}

/**
 * Events + activity for changes that were ALREADY written (contact create /
 * replace-semantics update). `added` / `removed` must be real changes.
 * Workflow events are fire-and-forget; the returned promise settles once
 * the Contact Activity rows are written (await it so the profile's
 * Activity tab shows the change straight away). Never rejects.
 */
export function emitTagChanges(input: {
  subAccountId: string;
  agencyId: string;
  contactId: string;
  added: string[];
  removed: string[];
  mode: "live" | "test";
  ctx: TagChangeContext;
}): Promise<void> {
  const { added, removed, ctx } = input;
  if (added.length === 0 && removed.length === 0) return Promise.resolve();
  invalidateContactsCache(input.subAccountId);

  // Workflow loop safety: a change made by a workflow step carries the
  // chain depth one level deeper; fireWorkflowTrigger refuses past the cap
  // and never re-enrolls the workflow that made the change.
  const chain = ctx.workflow
    ? {
        chainDepth: ctx.workflow.chainDepth + 1,
        sourceWorkflowId: ctx.workflow.workflowId,
        sourceRunId: ctx.workflow.runId,
        ...(ctx.workflow.testOrigin ? { testOrigin: ctx.workflow.testOrigin } : {}),
        ...(ctx.workflow.sandbox ? { sandbox: true } : {}),
      }
    : {};

  if (input.mode === "live") {
    if (added.length > 0) {
      emitWorkflowEvent({
        eventType: "contact.tag.added",
        agencyId: input.agencyId,
        subAccountId: input.subAccountId,
        contactId: input.contactId,
        source: ctx.source,
        payload: { addedTags: added, tag: added[0], tagSource: ctx.source, ...chain },
      });
    }
    for (const tag of removed) {
      emitWorkflowEvent({
        eventType: "contact.tag.removed",
        eventId: `${input.contactId}:tag:${tag}:${Date.now()}`,
        agencyId: input.agencyId,
        subAccountId: input.subAccountId,
        contactId: input.contactId,
        source: ctx.source,
        payload: { tag, tagSource: ctx.source, ...chain },
      });
    }
  }

  const label = TAG_SOURCE_LABELS[ctx.source] ?? "CRM";
  const meta = {
    tagSource: ctx.source,
    ...(ctx.sourceId ? { sourceId: ctx.sourceId } : {}),
    ...(ctx.workflow ? { workflowId: ctx.workflow.workflowId, runId: ctx.workflow.runId } : {}),
  };
  const createdBy = ctx.actorUid ?? ctx.source;
  const writes: Promise<void>[] = [];
  for (const tag of added) {
    writes.push(recordContactActivity({
      subAccountId: input.subAccountId,
      contactId: input.contactId,
      type: "tag_added",
      content: `“${tag}” added · Source: ${label}`,
      meta: { tag, ...meta },
      createdBy,
    }));
  }
  for (const tag of removed) {
    writes.push(recordContactActivity({
      subAccountId: input.subAccountId,
      contactId: input.contactId,
      type: "tag_removed",
      content: `“${tag}” removed · Source: ${label}`,
      meta: { tag, ...meta },
      createdBy,
    }));
  }
  return Promise.all(writes).then(() => undefined);
}

export interface ApplyTagsResult {
  added: string[];
  removed: string[];
  tags: string[];
}

/**
 * Add and/or remove tags on one contact (add/remove semantics — never a
 * full replace). Transactional against the contact so concurrent writers
 * can't lose each other's tags. Returns null when the contact is missing or
 * belongs to another workspace.
 */
export async function applyContactTags(input: {
  subAccountId: string;
  contactId: string;
  add?: string[];
  remove?: string[];
  ctx: TagChangeContext;
}): Promise<ApplyTagsResult | null> {
  const db = getAdminDb();
  const ref = db.doc(`contacts/${input.contactId}`);
  const first = await ref.get();
  if (!first.exists || first.get("subAccountId") !== input.subAccountId) return null;
  const agencyId = String(first.get("agencyId") ?? "");
  const mode = (first.get("mode") as "live" | "test" | undefined) ?? "live";

  const add = await canonicalizeTagList({
    subAccountId: input.subAccountId,
    agencyId,
    names: input.add ?? [],
    ctx: input.ctx,
  });
  const removeRaw = (input.remove ?? []).map(cleanTagName).filter(Boolean);
  const removeKeys = new Set(removeRaw.map(tagKey));
  if (removeRaw.length > 0) {
    // An old name of a renamed tag removes the tag under its new name too.
    const resolved = await resolveRegistryNames(input.subAccountId, removeRaw);
    for (const v of resolved.values()) if (v) removeKeys.add(tagKey(v));
  }
  // Removing and adding the same tag in one call keeps it.
  for (const a of add) removeKeys.delete(tagKey(a));

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("subAccountId") !== input.subAccountId) return null;
    const current: string[] = Array.isArray(snap.get("tags"))
      ? (snap.get("tags") as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    const kept = current.filter((t) => !removeKeys.has(tagKey(t)));
    const keptKeys = new Set(kept.map(tagKey));
    const next = [...kept];
    for (const a of add) {
      if (!keptKeys.has(tagKey(a))) {
        next.push(a);
        keptKeys.add(tagKey(a));
      }
    }
    const diff = diffTagLists(current, next);
    if (diff.added.length > 0 || diff.removed.length > 0) {
      tx.update(ref, { tags: next, updatedAt: FieldValue.serverTimestamp() });
    }
    return { ...diff, tags: next };
  });
  if (!result) return null;

  await emitTagChanges({
    subAccountId: input.subAccountId,
    agencyId,
    contactId: input.contactId,
    added: result.added,
    removed: result.removed,
    mode,
    ctx: input.ctx,
  });
  return result;
}
