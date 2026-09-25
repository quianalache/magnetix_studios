import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { toEpochMs } from "@/lib/segmentation/eval-condition-group";
import type { ConditionGroup } from "@/types/workflows";

/**
 * Access index for `has_access` / `not_has_access` conditions (Contacts
 * redesign, 2026-09-25). Resolves each referenced access key to the set of
 * CONTACT ids that currently hold it, reading the existing entitlement
 * records — nothing new is stored:
 *
 *   - "community:{groupId}" — an `active` membership at
 *     subAccounts/{sa}/communityGroups/{groupId}/memberships/{memberId}
 *     (active membership IS community access — member-context.ts's gate).
 *   - "course:{courseId}"   — an enrollment at subAccounts/{sa}/
 *     standaloneCourses/{courseId}/enrollments/{memberId} whose Offer access
 *     window (if any) hasn't expired.
 *   - "offer:{offerId}"     — a `paid` purchase at subAccounts/{sa}/
 *     courseOffers/{offerId}/purchases.
 *
 * Member → contact via `subAccounts/{sa}/members/{id}.contactId` (the link
 * every member identity carries). Members with no contactId can't match a
 * contact and are skipped — never matched by email guesswork.
 *
 * Every path is under `subAccounts/{subAccountId}/…`, so the index can only
 * ever contain this sub-account's contacts.
 */

const KEY_RE = /^(offer|course|community):([A-Za-z0-9_-]{1,128})$/;

export type AccessKind = "offer" | "course" | "community";

export function parseAccessKey(
  value: string,
): { kind: AccessKind; id: string } | null {
  const m = KEY_RE.exec(value.trim());
  if (!m) return null;
  return { kind: m[1] as AccessKind, id: m[2] };
}

/** Distinct, valid access keys referenced by the group's access conditions. */
export function accessKeysInGroup(group: ConditionGroup | null | undefined): string[] {
  const keys = new Set<string>();
  for (const c of group?.all ?? []) {
    if (c.op !== "has_access" && c.op !== "not_has_access") continue;
    const v = (c.value ?? "").trim();
    if (parseAccessKey(v)) keys.add(v);
  }
  return [...keys];
}

async function memberIdsForKey(
  subAccountId: string,
  key: string,
): Promise<string[]> {
  const parsed = parseAccessKey(key);
  if (!parsed) return [];
  const db = getAdminDb();
  const base = `subAccounts/${subAccountId}`;
  if (parsed.kind === "community") {
    const snap = await db
      .collection(`${base}/communityGroups/${parsed.id}/memberships`)
      .where("status", "==", "active")
      .select("memberId")
      .get();
    return snap.docs.map((d) => (d.get("memberId") as string) || d.id);
  }
  if (parsed.kind === "course") {
    const snap = await db
      .collection(`${base}/standaloneCourses/${parsed.id}/enrollments`)
      .select("memberId", "accessExpiresAt")
      .get();
    const now = Date.now();
    return snap.docs
      .filter((d) => {
        const expires = toEpochMs(d.get("accessExpiresAt"));
        return expires === null || expires > now;
      })
      .map((d) => (d.get("memberId") as string) || d.id);
  }
  const snap = await db
    .collection(`${base}/courseOffers/${parsed.id}/purchases`)
    .where("status", "==", "paid")
    .select("memberId")
    .get();
  return snap.docs
    .map((d) => d.get("memberId") as string | undefined)
    .filter((id): id is string => !!id);
}

/**
 * Build the index for every access key the group references. Returns null
 * when the group has no access conditions (callers then skip the reads
 * entirely). One members read + one read per referenced key.
 */
export async function buildAccessIndexForGroup(
  subAccountId: string,
  group: ConditionGroup | null | undefined,
): Promise<Map<string, Set<string>> | null> {
  const keys = accessKeysInGroup(group);
  if (keys.length === 0) return null;

  const db = getAdminDb();
  const [membersSnap, perKey] = await Promise.all([
    db
      .collection(`subAccounts/${subAccountId}/members`)
      .select("contactId")
      .get(),
    Promise.all(keys.map((k) => memberIdsForKey(subAccountId, k))),
  ]);
  const contactByMember = new Map<string, string>();
  for (const d of membersSnap.docs) {
    const contactId = d.get("contactId") as string | null | undefined;
    if (contactId) contactByMember.set(d.id, contactId);
  }

  const index = new Map<string, Set<string>>();
  keys.forEach((key, i) => {
    const contacts = new Set<string>();
    for (const memberId of perKey[i]) {
      const contactId = contactByMember.get(memberId);
      if (contactId) contacts.add(contactId);
    }
    index.set(key, contacts);
  });
  // Conditions whose value didn't parse still need an entry so they
  // evaluate against an (empty) index rather than the "no index" path.
  for (const c of group?.all ?? []) {
    if ((c.op === "has_access" || c.op === "not_has_access") && !index.has((c.value ?? "").trim())) {
      index.set((c.value ?? "").trim(), new Set());
    }
  }
  return index;
}
