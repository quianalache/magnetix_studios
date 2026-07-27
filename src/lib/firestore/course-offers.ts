import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import {
  DEFAULT_COURSE_OFFER_ACCESS,
  DEFAULT_COURSE_OFFER_ADVANCED,
  DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
} from "@/types/course-offers";
import { DEFAULT_OFFER_THEME } from "@/types/course-theme";
import type {
  CourseOffer,
  CourseOfferPurchase,
  CourseOfferUpsell,
} from "@/types/course-offers";

/**
 * Client-side subscriptions for the STAFF Course Offers dashboard. Mirrors
 * `src/lib/firestore/standalone-courses.ts` — all writes go through the
 * Admin-SDK API routes under `/api/sub-accounts/[id]/course-offers`.
 */

function offersPath(saId: string) {
  return `subAccounts/${saId}/courseOffers`;
}

function withDefaults(id: string, data: Record<string, unknown>): CourseOffer {
  return {
    id,
    ...(data as Omit<CourseOffer, "id">),
    access:
      (data.access as CourseOffer["access"]) ?? DEFAULT_COURSE_OFFER_ACCESS,
    advanced:
      (data.advanced as CourseOffer["advanced"]) ??
      DEFAULT_COURSE_OFFER_ADVANCED,
    theme: (data.theme as CourseOffer["theme"]) ?? DEFAULT_OFFER_THEME,
    checkoutSettings:
      (data.checkoutSettings as CourseOffer["checkoutSettings"]) ??
      DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
    booking: (data.booking as CourseOffer["booking"]) ?? null,
  };
}

export function subscribeToCourseOffers(
  saId: string,
  cb: (offers: CourseOffer[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), offersPath(saId)),
    (snap) => cb(snap.docs.map((d) => withDefaults(d.id, d.data()))),
    (e) => onError?.(e),
  );
}

export function subscribeToCourseOffer(
  saId: string,
  offerId: string,
  cb: (offer: CourseOffer | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), `${offersPath(saId)}/${offerId}`),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(withDefaults(snap.id, snap.data()));
    },
    (e) => onError?.(e),
  );
}

export function subscribeToCourseOfferUpsells(
  saId: string,
  offerId: string,
  cb: (upsells: CourseOfferUpsell[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(getFirebaseDb(), `${offersPath(saId)}/${offerId}/upsells`),
      orderBy("createdAt", "desc"),
    ),
    (snap) =>
      cb(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<CourseOfferUpsell, "id">) }),
        ),
      ),
    (e) => onError?.(e),
  );
}

export function subscribeToCourseOfferPurchases(
  saId: string,
  offerId: string,
  cb: (purchases: CourseOfferPurchase[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), `${offersPath(saId)}/${offerId}/purchases`),
    (snap) =>
      cb(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<CourseOfferPurchase, "id">) }),
        ),
      ),
    (e) => onError?.(e),
  );
}
