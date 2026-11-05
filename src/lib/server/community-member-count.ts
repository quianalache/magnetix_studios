import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * `communityGroups/{id}.memberCount` is a cached copy of the group's ACTIVE
 * memberships — the same definition the Community pages count live
 * (`status == "active"`). It used to be maintained with ±1 increments from
 * several non-transactional read-then-write paths, which drifted (Magnetic
 * Visibility showed 72 on cards while 69 memberships were active,
 * 2026-11-05). Every membership change now re-counts instead, so the cache
 * repairs itself on the next change and can never accumulate drift.
 *
 * Best-effort: a failed recount is logged and never fails the membership
 * change that triggered it.
 */
export async function countActiveGroupMembers(subAccountId: string, groupId: string): Promise<number> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/communityGroups/${groupId}/memberships`)
    .where("status", "==", "active")
    .count()
    .get();
  return snap.data().count;
}

export async function syncGroupMemberCount(subAccountId: string, groupId: string): Promise<number | null> {
  try {
    const count = await countActiveGroupMembers(subAccountId, groupId);
    await getAdminDb()
      .doc(`subAccounts/${subAccountId}/communityGroups/${groupId}`)
      .update({ memberCount: count, memberCountSyncedAt: FieldValue.serverTimestamp() });
    return count;
  } catch (err) {
    console.warn("[community-member-count] recount failed", subAccountId, groupId, err);
    return null;
  }
}
