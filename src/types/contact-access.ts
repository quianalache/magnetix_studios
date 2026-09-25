/**
 * Contact profile → Purchases & Access (Contacts redesign, 2026-09-25).
 * Wire shapes for `/api/contacts/[id]/access*` and the sub-account access
 * catalog. Everything here is a READ projection of the existing entitlement
 * records (course-offer / standalone-course / community purchases,
 * enrollments, community memberships + their access sources) — no parallel
 * entitlement store.
 */

export type AccessKind = "offer" | "course" | "community";

/** One offer / course / community a staff user can reference. */
export interface AccessCatalogItem {
  /** "offer:{id}" | "course:{id}" | "community:{id}" — also the segmentation value. */
  key: string;
  kind: AccessKind;
  id: string;
  name: string;
  published: boolean;
  /** Paid product (purchase course, paid group, one-time/recurring offer). */
  paid: boolean;
  /** Complimentary access can be granted from the Contact profile. */
  grantable: boolean;
  /** Why it can't be granted from Contacts, when `grantable` is false. */
  grantBlockedReason: string | null;
}

export interface AccessCatalog {
  offers: AccessCatalogItem[];
  courses: AccessCatalogItem[];
  communities: AccessCatalogItem[];
}

export interface ContactPurchaseView {
  id: string;
  scope: AccessKind;
  targetId: string;
  targetName: string;
  status: string;
  amountCents: number;
  currency: string;
  method: string;
  /** True for a zero-amount marker stamped by an Offer purchase onto a
   *  bundled course (not a separate charge). */
  offerMarker: boolean;
  /** Staff marked this PayPal purchase paid (vs automatic Stripe). */
  markedPaidByStaff: boolean;
  requestedAt: string | null;
  paidAt: string | null;
}

/** Why a contact currently has a piece of access. */
export type AccessSourceLabel =
  | "purchase"
  | "complimentary"
  | "product"
  | "joined"
  | "staff"
  | "imported"
  | "free";

export interface ContactAccessView {
  key: string;
  kind: AccessKind;
  targetId: string;
  name: string;
  /** Membership status for communities; enrollment status for courses;
   *  "active" for a paid offer. */
  status: string;
  sources: AccessSourceLabel[];
  since: string | null;
  complimentary: {
    grantedAt: string | null;
    grantedByName: string | null;
  } | null;
  /** Staff can revoke from Contacts (complimentary community grants only). */
  revocable: boolean;
  /** Plain-language note shown instead of a revoke button. */
  managedNote: string | null;
}

export interface ContactAccessSummary {
  /** Member identities linked to this contact (usually 0 or 1). */
  members: { id: string; email: string; status: string }[];
  purchases: ContactPurchaseView[];
  access: ContactAccessView[];
}
