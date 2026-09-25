import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  evalConditionGroup,
  groupUsesAccessConditions,
} from "@/lib/segmentation/eval-condition-group";
import { buildAccessIndexForGroup } from "@/lib/segmentation/access-index";
import { getContactList } from "@/lib/server/contact-lists-service";
import type { BroadcastAudienceFilter } from "@/types";
import type { Contact } from "@/types/contacts";
import type { ConditionGroup } from "@/types/workflows";

/** Thrown when a `list` audience references a list that no longer exists
 *  (or belongs to another sub-account). Routes map it to a 400. */
export class AudienceListMissingError extends Error {
  constructor() {
    super(
      "The Contact List for this audience no longer exists. Pick another audience and review the count again.",
    );
  }
}

/**
 * Resolve a broadcast's audience filter to the contact set we'll fan out to.
 *
 * The query is scoped by sub-account first (drives the index), then narrowed
 * by the optional filter. The pre-flight skip (opted-out / missing email) is
 * applied here so we can show "audience N, will-skip M" in the confirm
 * dialog without a second round-trip — and so the parent broadcast doc's
 * totals.audienceSize matches what we actually queue, never wider.
 *
 * Filter shapes:
 *   - { kind: "all" }                        — every contact in the sub-account
 *   - { kind: "tag", tag }                   — legacy — contacts whose tags array contains tag
 *   - { kind: "pipeline_stage", stage }      — legacy — contacts whose pipelineStage matches
 *   - { kind: "conditions", group }          — Segmentation V1 (2026-08-27):
 *     arbitrary AND/OR condition group, evaluated with the SAME engine the
 *     Workflow Builder uses (lib/segmentation/eval-condition-group.ts).
 *     Firestore can't express arbitrary field/operator combinations as a
 *     compound query, so this fetches the same subAccountId-scoped
 *     candidate set "all" already fetches today, then evaluates the group
 *     in server memory per contact — no new Firestore query shape, no
 *     client-computed id list ever trusted, same bounded-candidate-set
 *     pattern this function already used before this change.
 *   - { kind: "list", listId }               — Contacts redesign
 *     (2026-09-25): a saved Contact List. Its LIVE definition is loaded here
 *     (tenant-checked) and evaluated exactly like "conditions" — the
 *     client-supplied `group` snapshot on the filter is never trusted. A
 *     list may use access conditions ("has purchased X"), which get a
 *     server-built access index here; the opt-out / missing-email
 *     pre-flight below applies to lists identically.
 *
 * This IS the send-time-authoritative resolver — /api/broadcasts/email/send
 * calls this directly (never trusts a client-supplied recipient list), and
 * the per-recipient step route re-checks opt-out/suppression live again at
 * actual send time on top of this.
 *
 * Test Mode (2026-08-26): the optional `testRecipientIds` param intersects
 * the resolved audience with an explicit allowlist SERVER-SIDE, inside this
 * function — the one place every caller's audience passes through. A
 * segment that would otherwise resolve to thousands of contacts still only
 * ever returns the allowlisted ones. See the param's own doc comment.
 */
export interface ResolvedAudience {
  /** Contacts that will receive a send (passed all pre-flight checks). */
  recipients: Contact[];
  /** Contacts excluded by pre-flight (opt-out / missing email). */
  skipped: Array<{
    contact: Contact;
    reason: "opt_out" | "no_email";
  }>;
}

export async function resolveAudience(
  subAccountId: string,
  filter: BroadcastAudienceFilter,
  /**
   * Territory scoping. `null` (default) = no restriction (admin / owner
   * / scoping off). A `string[]` restricts the audience to contacts
   * whose `territoryId` is in the list — used when a scoped
   * collaborator initiates the broadcast so they can't blast contacts
   * outside their territory. An empty array yields an empty audience.
   * Territory-excluded contacts are dropped silently (not surfaced in
   * `skipped`) so the collaborator never learns they exist.
   */
  territoryFilter: string[] | null = null,
  /**
   * Production safety controls (2026-08-26) — Broadcast Test Mode. `null`
   * (default) = no restriction. A `string[]` of contact ids restricts the
   * resolved audience to ONLY those ids, no matter how broad `filter`
   * resolves — this is the server-side enforcement the send route relies
   * on; it is NOT optional/advisory and cannot be bypassed by a caller
   * that only trims the client-side preview. An empty array yields an
   * empty audience (mirrors territoryFilter's contract). Applied first,
   * before segmentation/opt-out evaluation, so a testMode broadcast never
   * even considers a non-allowlisted contact.
   */
  testRecipientIds: string[] | null = null,
): Promise<ResolvedAudience> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection("contacts")
    .where("subAccountId", "==", subAccountId);

  if (filter.kind === "tag") {
    query = query.where("tags", "array-contains", filter.tag);
  } else if (filter.kind === "pipeline_stage") {
    query = query.where("pipelineStage", "==", filter.stage);
  }

  // Contacts redesign (2026-09-25) — the effective condition group for
  // "conditions" and "list" audiences, plus an access index when it
  // references purchases / enrollments / community access.
  let group: ConditionGroup | null = null;
  if (filter.kind === "conditions") group = filter.group;
  if (filter.kind === "list") {
    const list = await getContactList(subAccountId, filter.listId);
    if (!list) throw new AudienceListMissingError();
    group = list.group;
  }
  const accessIndex =
    group && groupUsesAccessConditions(group)
      ? await buildAccessIndexForGroup(subAccountId, group)
      : null;
  const evalCtx = { accessIndex, now: Date.now() };

  const snap = await query.get();

  const testAllowlist = testRecipientIds ? new Set(testRecipientIds) : null;

  const recipients: Contact[] = [];
  const skipped: ResolvedAudience["skipped"] = [];

  for (const doc of snap.docs) {
    const contact = { id: doc.id, ...(doc.data() as Omit<Contact, "id">) };
    // Test Mode allowlist gate — strictest filter, applied first. A
    // non-allowlisted contact is invisible to this resolution entirely,
    // same "doesn't even count as skipped" treatment as territoryFilter.
    if (testAllowlist && !testAllowlist.has(contact.id)) continue;
    // Territory gate — excluded contacts are invisible to this
    // caller, so they don't even count as "skipped".
    if (territoryFilter) {
      const tId = contact.territoryId ?? null;
      if (!tId || !territoryFilter.includes(tId)) continue;
    }
    // Segmentation V1 — condition-group contacts that don't match are
    // simply not in this audience at all, same as a Firestore query
    // excluding them; not surfaced in `skipped` (that list is specifically
    // "would have matched, but can't be sent to" — opt-out / no email).
    if (group && !evalConditionGroup(group, contact, evalCtx)) {
      continue;
    }
    if (contact.emailOptedOut) {
      skipped.push({ contact, reason: "opt_out" });
      continue;
    }
    if (!contact.email || !contact.email.includes("@")) {
      skipped.push({ contact, reason: "no_email" });
      continue;
    }
    recipients.push(contact);
  }

  return { recipients, skipped };
}
