import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Routine privacy (owner decision 2026-09-28): routines are PERSONAL by
 * default. A private routine and its activities are visible only to its
 * owner — not to other members, sub-account admins or the agency owner.
 * An owner may share a routine with everyone in the sub-account; members
 * can then view it and check its activities off. Editing, pausing and
 * deleting stay with the owner (sub-account admins may also manage a
 * SHARED routine so a team routine is never orphaned).
 */

type Doc = FirebaseFirestore.DocumentData;

export function routineOwnerUid(r: Doc): string | null {
  return (r.ownerUid as string) || (r.createdByUid as string) || null;
}

export function canViewRoutine(r: Doc, uid: string): boolean {
  return routineOwnerUid(r) === uid || r.visibility === "shared";
}

export function canManageRoutine(r: Doc, uid: string, subAccountRole: string | null | undefined): boolean {
  if (routineOwnerUid(r) === uid) return true;
  return r.visibility === "shared" && (subAccountRole === "admin" || subAccountRole === "agencyOwner");
}

/** Visibility of one routine activity task, decided by its routine (or its recorded owner once the routine is deleted). */
export async function canViewRoutineTask(task: Doc, uid: string): Promise<boolean> {
  if (typeof task.routineId === "string" && task.routineId) {
    const r = (await getAdminDb().doc(`routines/${task.routineId}`).get()).data();
    if (r && r.subAccountId === task.subAccountId) return canViewRoutine(r, uid);
  }
  return (task.ownerUid as string | undefined) === uid;
}
