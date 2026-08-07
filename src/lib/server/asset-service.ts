import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AffiliateLink, Asset, OfferBundle } from "@/types/assets";

function assetsCol() {
  return getAdminDb().collection("assets");
}
function affiliateLinksCol() {
  return getAdminDb().collection("affiliateLinks");
}
function bundlesCol() {
  return getAdminDb().collection("offerBundles");
}

function toDoc<T>(snap: FirebaseFirestore.DocumentSnapshot): T {
  return { id: snap.id, ...(snap.data() as Omit<T, "id">) } as T;
}

// ── assets ───────────────────────────────────────────────────────────────

export async function listAssets(subAccountId: string): Promise<Asset[]> {
  const snap = await assetsCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toDoc<Asset>(d));
}

export async function getAsset(assetId: string): Promise<Asset | null> {
  const snap = await assetsCol().doc(assetId).get();
  return snap.exists ? toDoc<Asset>(snap) : null;
}

export type AssetInput = Omit<Asset, "id" | "agencyId" | "subAccountId" | "createdAt" | "updatedAt">;

export async function createAsset(
  agencyId: string,
  subAccountId: string,
  input: AssetInput,
): Promise<Asset> {
  const ref = assetsCol().doc();
  await ref.set({
    ...input,
    agencyId,
    subAccountId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<Asset>(snap);
}

export async function updateAsset(assetId: string, patch: Partial<AssetInput>): Promise<void> {
  await assetsCol().doc(assetId).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function deleteAsset(assetId: string): Promise<void> {
  await assetsCol().doc(assetId).delete();
}

/**
 * Real revenue for an asset linked to a Course Offer — sums that offer's
 * paid purchases (both Stripe and PayPal; PayPal purchases only land as
 * `paid` once staff manually confirm them, but once they do they're just
 * as real as a Stripe purchase here — see the purchase-service comment).
 * Unlinked assets return null, matching the real popup's "No Revenue Data
 * Yet" empty state rather than a misleading $0.
 */
export async function computeAssetRevenueCents(
  subAccountId: string,
  linkedOfferId: string | null,
): Promise<number | null> {
  if (!linkedOfferId) return null;
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/courseOffers/${linkedOfferId}/purchases`)
    .where("status", "==", "paid")
    .get();
  return snap.docs.reduce((sum, d) => sum + ((d.data().amountCents as number) ?? 0), 0);
}

// ── affiliate links ─────────────────────────────────────────────────────

export async function listAffiliateLinks(subAccountId: string): Promise<AffiliateLink[]> {
  const snap = await affiliateLinksCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toDoc<AffiliateLink>(d));
}

export type AffiliateLinkInput = Omit<AffiliateLink, "id" | "agencyId" | "subAccountId" | "createdAt" | "updatedAt">;

export async function createAffiliateLink(
  agencyId: string,
  subAccountId: string,
  input: AffiliateLinkInput,
): Promise<AffiliateLink> {
  const ref = affiliateLinksCol().doc();
  await ref.set({
    ...input,
    agencyId,
    subAccountId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<AffiliateLink>(snap);
}

export async function updateAffiliateLink(
  linkId: string,
  patch: Partial<AffiliateLinkInput>,
): Promise<void> {
  await affiliateLinksCol().doc(linkId).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function deleteAffiliateLink(linkId: string): Promise<void> {
  await affiliateLinksCol().doc(linkId).delete();
}

// ── offer bundles ────────────────────────────────────────────────────────

export async function listOfferBundles(subAccountId: string): Promise<OfferBundle[]> {
  const snap = await bundlesCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toDoc<OfferBundle>(d));
}

export async function createOfferBundle(opts: {
  agencyId: string;
  subAccountId: string;
  name: string;
  description: string;
  assetIds: string[];
  linkedOfferId: string | null;
}): Promise<OfferBundle> {
  const ref = bundlesCol().doc();
  await ref.set({
    agencyId: opts.agencyId,
    subAccountId: opts.subAccountId,
    name: opts.name,
    description: opts.description,
    assetIds: opts.assetIds,
    linkedOfferId: opts.linkedOfferId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<OfferBundle>(snap);
}

export async function deleteOfferBundle(bundleId: string): Promise<void> {
  await bundlesCol().doc(bundleId).delete();
}

export async function computeBundleRevenueCents(
  subAccountId: string,
  linkedOfferId: string | null,
): Promise<number | null> {
  return computeAssetRevenueCents(subAccountId, linkedOfferId);
}
