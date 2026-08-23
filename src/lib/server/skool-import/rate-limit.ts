import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Lightweight throttle on repeated failed Skool Connect attempts — this is
 * a login form against a THIRD PARTY's real account, so an unlimited retry
 * loop would be a real credential-stuffing/lockout risk against the
 * owner's own Skool account, not just a Magnetix cost concern. Scoped per
 * (subAccountId, groupId, staff memberId) — one moderator hammering wrong
 * passwords doesn't lock out a co-moderator trying their own real Skool
 * login on the same Community.
 *
 * V1 choice: 5 failed attempts per rolling 15 minutes. A successful
 * connect clears the counter for that scope.
 */

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function docRef(subAccountId: string, groupId: string, memberId: string) {
  const key = `${subAccountId}_${groupId}_${memberId}`;
  return getAdminDb().collection("skoolImportRateLimits").doc(key);
}

export async function checkRateLimit(
  subAccountId: string,
  groupId: string,
  memberId: string,
): Promise<{ allowed: boolean; retryAfterMs: number | null }> {
  const snap = await docRef(subAccountId, groupId, memberId).get();
  if (!snap.exists) return { allowed: true, retryAfterMs: null };
  const data = snap.data() as { count?: number; windowStartedAtMs?: number };
  const windowStarted = data.windowStartedAtMs ?? 0;
  const elapsed = Date.now() - windowStarted;
  if (elapsed > WINDOW_MS) return { allowed: true, retryAfterMs: null };
  const count = data.count ?? 0;
  if (count >= MAX_FAILED_ATTEMPTS) {
    return { allowed: false, retryAfterMs: WINDOW_MS - elapsed };
  }
  return { allowed: true, retryAfterMs: null };
}

export async function recordFailedAttempt(subAccountId: string, groupId: string, memberId: string): Promise<void> {
  const ref = docRef(subAccountId, groupId, memberId);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() as { count?: number; windowStartedAtMs?: number }) : {};
  const windowStarted = data.windowStartedAtMs ?? 0;
  const elapsed = Date.now() - windowStarted;
  if (!snap.exists || elapsed > WINDOW_MS) {
    await ref.set({ count: 1, windowStartedAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  } else {
    await ref.update({ count: (data.count ?? 0) + 1, updatedAt: FieldValue.serverTimestamp() });
  }
}

export async function clearRateLimit(subAccountId: string, groupId: string, memberId: string): Promise<void> {
  await docRef(subAccountId, groupId, memberId).delete().catch(() => {});
}
