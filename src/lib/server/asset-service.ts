import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AffiliateLink, Asset, OfferBundle } from "@/types/assets";

/**
 * Resource Library (`assets`), Affiliate Library (`affiliateLinks`) and the
 * legacy `offerBundles` — top-level collections keyed by `subAccountId`.
 *
 * Tenant isolation (2026-09 fix): every read-by-id, update and delete
 * verifies the record belongs to the caller's sub-account. Previously the
 * affiliate-link PATCH/DELETE and offer-bundle DELETE accepted any id, and
 * the PATCH's merge-write could even create a record. A foreign or missing
 * id now reads as not found and nothing is written.
 */

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

function validId(id: string) {
  return typeof id === "string" && id.length > 0 && !id.includes("/");
}

/** Loads a record only if it belongs to `subAccountId` (else null). */
async function tenantDoc<T>(
  col: FirebaseFirestore.CollectionReference,
  subAccountId: string,
  id: string
): Promise<T | null> {
  if (!validId(id)) return null;
  const snap = await col.doc(id).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return toDoc<T>(snap);
}

// ── resources (assets) ─────────────────────────────────────────────────────

export async function listAssets(subAccountId: string): Promise<Asset[]> {
  const snap = await assetsCol().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toDoc<Asset>(d));
}

/** Unscoped read — existing callers check `subAccountId` themselves. Prefer getTenantAsset. */
export async function getAsset(assetId: string): Promise<Asset | null> {
  if (!validId(assetId)) return null;
  const snap = await assetsCol().doc(assetId).get();
  return snap.exists ? toDoc<Asset>(snap) : null;
}

export async function getTenantAsset(subAccountId: string, assetId: string): Promise<Asset | null> {
  return tenantDoc<Asset>(assetsCol(), subAccountId, assetId);
}

export type AssetInput = Omit<Asset, "id" | "agencyId" | "subAccountId" | "createdAt" | "updatedAt">;

export async function createAsset(
  agencyId: string,
  subAccountId: string,
  input: AssetInput,
  uid?: string | null
): Promise<Asset> {
  const ref = assetsCol().doc();
  await ref.set({
    ...input,
    agencyId,
    subAccountId,
    createdByUid: uid ?? null,
    updatedByUid: uid ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<Asset>(snap);
}

/** Tenant-checked update. Returns false (writes nothing) for a foreign/missing id. */
export async function updateAsset(
  subAccountId: string,
  assetId: string,
  patch: Partial<AssetInput>,
  uid?: string | null
): Promise<boolean> {
  if (!(await getTenantAsset(subAccountId, assetId))) return false;
  await assetsCol()
    .doc(assetId)
    .update({ ...patch, ...(uid ? { updatedByUid: uid } : {}), updatedAt: FieldValue.serverTimestamp() });
  return true;
}

export async function deleteAsset(subAccountId: string, assetId: string): Promise<boolean> {
  if (!(await getTenantAsset(subAccountId, assetId))) return false;
  await assetsCol().doc(assetId).delete();
  return true;
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
  if (!linkedOfferId || !validId(linkedOfferId)) return null;
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

export async function getTenantAffiliateLink(subAccountId: string, linkId: string): Promise<AffiliateLink | null> {
  return tenantDoc<AffiliateLink>(affiliateLinksCol(), subAccountId, linkId);
}

export type AffiliateLinkInput = Omit<AffiliateLink, "id" | "agencyId" | "subAccountId" | "createdAt" | "updatedAt">;

export async function createAffiliateLink(
  agencyId: string,
  subAccountId: string,
  input: AffiliateLinkInput,
  uid?: string | null
): Promise<AffiliateLink> {
  const ref = affiliateLinksCol().doc();
  await ref.set({
    ...input,
    agencyId,
    subAccountId,
    createdByUid: uid ?? null,
    updatedByUid: uid ?? null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return toDoc<AffiliateLink>(snap);
}

export async function updateAffiliateLink(
  subAccountId: string,
  linkId: string,
  patch: Partial<AffiliateLinkInput>,
  uid?: string | null
): Promise<boolean> {
  if (!(await getTenantAffiliateLink(subAccountId, linkId))) return false;
  await affiliateLinksCol()
    .doc(linkId)
    .update({ ...patch, ...(uid ? { updatedByUid: uid } : {}), updatedAt: FieldValue.serverTimestamp() });
  return true;
}

export async function deleteAffiliateLink(subAccountId: string, linkId: string): Promise<boolean> {
  if (!(await getTenantAffiliateLink(subAccountId, linkId))) return false;
  await affiliateLinksCol().doc(linkId).delete();
  return true;
}

// ── offer bundles (legacy — read-only in the Assets UI) ─────────────────────

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

export async function deleteOfferBundle(subAccountId: string, bundleId: string): Promise<boolean> {
  if (!(await tenantDoc<OfferBundle>(bundlesCol(), subAccountId, bundleId))) return false;
  await bundlesCol().doc(bundleId).delete();
  return true;
}

export async function computeBundleRevenueCents(
  subAccountId: string,
  linkedOfferId: string | null,
): Promise<number | null> {
  return computeAssetRevenueCents(subAccountId, linkedOfferId);
}
