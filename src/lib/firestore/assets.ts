import { collection, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { AffiliateLink, Asset, OfferBundle } from "@/types/assets";
import type { TenantScope } from "@/types";

/** Live reads only — every write goes through /api/sub-accounts/[id]/assets|affiliate-links|offer-bundles. */

export function subscribeToAssets(
  scope: TenantScope,
  callback: (assets: Asset[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(getFirebaseDb(), "assets"), where("subAccountId", "==", scope.subAccountId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Asset, "id">) }))),
    (err) => onError?.(err),
  );
}

export function subscribeToAffiliateLinks(
  scope: TenantScope,
  callback: (links: AffiliateLink[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(getFirebaseDb(), "affiliateLinks"), where("subAccountId", "==", scope.subAccountId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AffiliateLink, "id">) }))),
    (err) => onError?.(err),
  );
}

export function subscribeToOfferBundles(
  scope: TenantScope,
  callback: (bundles: OfferBundle[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(getFirebaseDb(), "offerBundles"), where("subAccountId", "==", scope.subAccountId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OfferBundle, "id">) }))),
    (err) => onError?.(err),
  );
}
