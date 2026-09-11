import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { setMembershipStatusServerSide } from "@/lib/server/community-service";

/**
 * Entitlement-lifecycle safety net for Product-linked Community membership
 * (2026-09-11 audit). Root problem: `grantLinkedCommunityGroupsServerSide`
 * grants a Community membership the moment someone enrolls in a linked
 * Standalone Product, but nothing on the OTHER end ever revoked it when
 * that Product access later expired (Stripe subscription canceled) — a
 * canceled subscriber kept Community access indefinitely. The fix can't be
 * "subscription canceled -> remove membership": the SAME membership may
 * also be justified by a manual join, a second linked Product, a native
 * paid-group purchase, or a staff grant, none of which this cancellation
 * has anything to do with.
 *
 * Model: `communityGroups/{groupId}/memberships/{memberId}/accessSources/
 * {sourceId}` — one doc per currently-or-formerly-granted REVOCABLE source
 * (today: only `kind: "product"`, one per linked Standalone Course —
 * `sourceId = product:{courseId}`, so re-granting or re-revoking the same
 * course's access is always the same doc, never a duplicate). A
 * membership additionally carries `origin` (set once, at creation, by
 * whichever grant path actually created the doc): `"product"` means this
 * membership document would not exist at all if not for a Product grant,
 * and is the ONLY origin `reconcileCommunityMembershipAccess` will ever
 * deactivate — every other origin (manual join, staff grant, native
 * purchase, import, or simply absent on membership docs that predate this
 * field) is left alone unconditionally. This is also the answer to
 * "existing memberships have no provenance data": rather than guess by
 * backfilling, `origin` is only ever `"product"` on memberships created
 * FROM NOW ON by a Product grant with nothing pre-existing — every
 * pre-existing membership (`origin` absent) is permanently exempt from
 * this reconciliation, by construction, with zero migration needed.
 */

export type CommunityAccessSourceKind = "product";

export interface CommunityAccessSource {
  id: string;
  kind: CommunityAccessSourceKind;
  /** courseId, for kind "product". */
  refId: string;
  status: "active" | "revoked";
  grantedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  revokedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
}

function accessSourcesCol(saId: string, groupId: string, memberId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/communityGroups/${groupId}/memberships/${memberId}/accessSources`
  );
}

function productSourceId(courseId: string): string {
  return `product:${courseId}`;
}

/**
 * Idempotent: safe to call every time a member (re-)enrolls in a linked
 * Product, including webhook retries and repeated free enrollment. Same
 * `courseId` always resolves to the same doc — a second call updates it
 * in place rather than creating a duplicate. `grantedAt` is preserved
 * across repeat calls (first-grant timestamp), only `status`/`revokedAt`
 * are reset to "currently active" every time.
 */
export async function upsertProductAccessSourceServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  courseId: string;
}): Promise<void> {
  const ref = accessSourcesCol(
    opts.subAccountId,
    opts.groupId,
    opts.memberId
  ).doc(productSourceId(opts.courseId));
  const existing = await ref.get();
  await ref.set(
    {
      kind: "product",
      refId: opts.courseId,
      status: "active",
      grantedAt: existing.data()?.grantedAt ?? FieldValue.serverTimestamp(),
      revokedAt: null,
    } satisfies Omit<CommunityAccessSource, "id">,
    { merge: true }
  );
}

/**
 * Idempotent revoke + reconcile in one step — the entry point Stripe's
 * subscription-cancellation handlers call. Marking an already-revoked
 * source revoked again, or reconciling a membership that's already
 * inactive, is a safe no-op either way (see reconcileCommunityMembershipAccess).
 */
export async function revokeProductAccessSourceServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  courseId: string;
}): Promise<void> {
  const ref = accessSourcesCol(
    opts.subAccountId,
    opts.groupId,
    opts.memberId
  ).doc(productSourceId(opts.courseId));
  const snap = await ref.get();
  if (snap.exists) {
    await ref.set(
      {
        status: "revoked",
        revokedAt: snap.data()?.revokedAt ?? FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await reconcileCommunityMembershipAccess({
    subAccountId: opts.subAccountId,
    groupId: opts.groupId,
    memberId: opts.memberId,
  });
}

/**
 * "Does this member still have any valid source that entitles them to this
 * Community?" — recomputed from scratch every call (no counters to drift),
 * and only ever able to DEACTIVATE a membership whose `origin === "product"`
 * — every other membership (manual, staff, purchase, import, or legacy
 * with no `origin` at all) is left untouched no matter what. Deactivation
 * reuses `setMembershipStatusServerSide`'s existing "removed" path rather
 * than a new status value or a second memberCount/notification code path.
 *
 * Safe to call redundantly (webhook retries, duplicate revoke calls,
 * out-of-order events): a membership that's already inactive, or that
 * still has an active source, is left exactly as-is.
 */
export async function reconcileCommunityMembershipAccess(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
}): Promise<void> {
  const memRef = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/memberships/${opts.memberId}`
  );
  const memSnap = await memRef.get();
  if (!memSnap.exists) return;
  const membership = memSnap.data()!;
  if (membership.status !== "active") return;
  if (membership.origin !== "product") return;

  const activeSourcesSnap = await accessSourcesCol(
    opts.subAccountId,
    opts.groupId,
    opts.memberId
  )
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (!activeSourcesSnap.empty) return;

  await setMembershipStatusServerSide({
    subAccountId: opts.subAccountId,
    groupId: opts.groupId,
    memberId: opts.memberId,
    status: "removed",
  });
}
