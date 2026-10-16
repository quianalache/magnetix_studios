import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * The business name a public page may show for a sub-account — the
 * sub-account's own `name`, nothing else (no new brand source; 2026-10-16
 * public surfaces). Null when the sub-account doesn't exist or has no name.
 */
export async function getSubAccountPublicName(subAccountId: string): Promise<string | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const name = snap.exists ? (snap.data()?.name as string | undefined) : undefined;
  return name?.trim() || null;
}

/** The agency's own `name` — the seller on Agency Course / Offer sales pages. */
export async function getAgencyPublicName(agencyId: string): Promise<string | null> {
  const snap = await getAdminDb().doc(`agencies/${agencyId}`).get();
  const name = snap.exists ? (snap.data()?.name as string | undefined) : undefined;
  return name?.trim() || null;
}

/** "Page · Business" for a public page's browser title; skips empty parts. */
export function publicTitle(...parts: Array<string | null | undefined>): string | undefined {
  const t = parts.map((p) => p?.trim()).filter(Boolean).join(" · ");
  return t || undefined;
}
