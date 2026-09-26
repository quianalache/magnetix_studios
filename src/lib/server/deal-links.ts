import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Deal ↔ task / appointment links (Multiple Pipelines, 2026-09-25).
 * A `dealId` coming from a request is only accepted when that deal lives in
 * the SAME sub-account — otherwise a task or appointment could be pointed
 * at another tenant's deal.
 */
export async function resolveDealLink(
  subAccountId: string,
  dealId: unknown,
): Promise<{ ok: true; dealId: string | null; title?: string } | { ok: false }> {
  if (dealId === null || dealId === undefined || dealId === "") {
    return { ok: true, dealId: null };
  }
  if (typeof dealId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(dealId)) {
    return { ok: false };
  }
  const snap = await getAdminDb().doc(`deals/${dealId}`).get();
  if (!snap.exists || snap.get("subAccountId") !== subAccountId) return { ok: false };
  return { ok: true, dealId, title: String(snap.get("title") ?? "") };
}
