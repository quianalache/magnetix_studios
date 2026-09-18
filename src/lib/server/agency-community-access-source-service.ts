import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { removeAgencyGroupMemberServerSide } from "@/lib/server/community-agency-service";

/**
 * Entitlement-lifecycle safety net for Standalone-Course-linked Agency
 * Community membership — the agency-scope sibling of
 * community-access-source-service.ts. Same model, one level up: a
 * roster doc's `source` field plays the role tenant's `GroupMembership.
 * origin` plays (see AgencyGroupMemberRoster's own doc comment) — only a
 * roster entry whose `source === "product"` is ever eligible for
 * reconciliation-driven removal; every other source (manual, customer,
 * affiliate, plan_cohort, or a legacy doc) is left untouched no matter
 * what this file does.
 *
 * `accessSources` lives under the roster doc itself (`agencies/{agencyId}/
 * communityGroups/{groupId}/members/{membershipDocId}/accessSources/
 * {sourceId}`) rather than a separate `memberships` collection, since the
 * roster doc already IS the membership (see this codebase's established
 * "agency has no second memberships collection" convention).
 */

export type AgencyAccessSourceKind = "product";

export interface AgencyCommunityAccessSource {
  id: string;
  kind: AgencyAccessSourceKind;
  /** courseId, for kind "product". */
  refId: string;
  status: "active" | "revoked";
  grantedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  revokedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
}

function accessSourcesCol(agencyId: string, groupId: string, membershipId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communityGroups/${groupId}/members/${membershipId}/accessSources`);
}

function productSourceId(courseId: string): string {
  return `product:${courseId}`;
}

/** Idempotent: safe to call every time a person (re-)enrolls in a linked
 *  course, including webhook retries and repeated free enrollment. */
export async function upsertAgencyProductAccessSourceServerSide(opts: {
  agencyId: string;
  groupId: string;
  membershipId: string;
  courseId: string;
}): Promise<void> {
  const ref = accessSourcesCol(opts.agencyId, opts.groupId, opts.membershipId).doc(productSourceId(opts.courseId));
  const existing = await ref.get();
  await ref.set(
    {
      kind: "product",
      refId: opts.courseId,
      status: "active",
      grantedAt: existing.data()?.grantedAt ?? FieldValue.serverTimestamp(),
      revokedAt: null,
    } satisfies Omit<AgencyCommunityAccessSource, "id">,
    { merge: true },
  );
}

/** Idempotent revoke + reconcile in one step — the entry point a
 *  canceled/expired Stripe subscription's handler calls. */
export async function revokeAgencyProductAccessSourceServerSide(opts: {
  agencyId: string;
  groupId: string;
  membershipId: string;
  courseId: string;
}): Promise<void> {
  const ref = accessSourcesCol(opts.agencyId, opts.groupId, opts.membershipId).doc(productSourceId(opts.courseId));
  const snap = await ref.get();
  if (snap.exists) {
    await ref.set({ status: "revoked", revokedAt: snap.data()?.revokedAt ?? FieldValue.serverTimestamp() }, { merge: true });
  }
  await reconcileAgencyCommunityMembershipAccess({ agencyId: opts.agencyId, groupId: opts.groupId, membershipId: opts.membershipId });
}

/** "Does this roster entry still have any valid source that entitles it
 *  to this Community?" — recomputed from scratch every call, and only
 *  ever able to deactivate a roster entry whose `source === "product"`. */
export async function reconcileAgencyCommunityMembershipAccess(opts: {
  agencyId: string;
  groupId: string;
  membershipId: string;
}): Promise<void> {
  const memRef = getAdminDb().doc(`agencies/${opts.agencyId}/communityGroups/${opts.groupId}/members/${opts.membershipId}`);
  const memSnap = await memRef.get();
  if (!memSnap.exists) return;
  const membership = memSnap.data()!;
  if (membership.status !== "active") return;
  if (membership.source !== "product") return;

  const activeSourcesSnap = await accessSourcesCol(opts.agencyId, opts.groupId, opts.membershipId).where("status", "==", "active").limit(1).get();
  if (!activeSourcesSnap.empty) return;

  await removeAgencyGroupMemberServerSide(opts.agencyId, opts.groupId, opts.membershipId);
}
