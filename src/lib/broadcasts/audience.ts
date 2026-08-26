import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { evalConditionGroup } from "@/lib/segmentation/eval-condition-group";
import type { BroadcastAudienceFilter } from "@/types";
import type { Contact } from "@/types/contacts";

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
 *
 * This IS the send-time-authoritative resolver — /api/broadcasts/email/send
 * calls this directly (never trusts a client-supplied recipient list), and
 * the per-recipient step route re-checks opt-out/suppression live again at
 * actual send time on top of this.
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

  const snap = await query.get();

  const recipients: Contact[] = [];
  const skipped: ResolvedAudience["skipped"] = [];

  for (const doc of snap.docs) {
    const contact = { id: doc.id, ...(doc.data() as Omit<Contact, "id">) };
    // Territory gate first — excluded contacts are invisible to this
    // caller, so they don't even count as "skipped".
    if (territoryFilter) {
      const tId = contact.territoryId ?? null;
      if (!tId || !territoryFilter.includes(tId)) continue;
    }
    // Segmentation V1 — condition-group contacts that don't match are
    // simply not in this audience at all, same as a Firestore query
    // excluding them; not surfaced in `skipped` (that list is specifically
    // "would have matched, but can't be sent to" — opt-out / no email).
    if (filter.kind === "conditions" && !evalConditionGroup(filter.group, contact)) {
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
