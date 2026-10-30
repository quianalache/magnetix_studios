import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getTenantBrandColors, validateBrandColors, type ResolvedBrandColor } from "@/lib/brand/brand-colors";
import type { BrandColor, BrandKit } from "@/types/brand-kit";

/**
 * Workspace Brand colors persistence (Phase A). Writes ONLY
 * `subAccounts/{id}.brandKit` — never the logo, never any surface's own
 * colors (portal, booking, forms, community, courses stay untouched).
 */
export class BrandKitError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function saveBrandColors(subAccountId: string, input: unknown): Promise<BrandColor[]> {
  const result = validateBrandColors(input);
  if (!result.ok) throw new BrandKitError(result.error);
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set({ brandKit: { colors: result.colors, updatedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return result.colors;
}

/** Server read path for future consumers: one sub-account's colors with roles. */
export async function getTenantBrandColorsServerSide(subAccountId: string): Promise<ResolvedBrandColor[]> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  return getTenantBrandColors(snap.data() as { brandKit?: BrandKit | null } | undefined);
}
