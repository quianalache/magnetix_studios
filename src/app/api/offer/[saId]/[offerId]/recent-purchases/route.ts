import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CourseOffer, CourseOfferPurchase } from "@/types/course-offers";
import type { Member } from "@/types/community";
import type { Contact } from "@/types/contacts";

export const dynamic = "force-dynamic";

const LIMIT = 8;

interface RecentPurchaseDto {
  firstName: string;
  /** "City, Country" / just one / null if neither is on file. Never more precise than that. */
  location: string | null;
  purchasedAt: string;
}

/**
 * Public feed for the opt-in "recent purchases" checkout popup
 * (CourseOffer.showRecentPurchasePopup). Deliberately returns ONLY first
 * name + city/country + timestamp — never email, phone, address, memberId,
 * or contactId. Public route (no auth): see middleware.ts's "/api/offer"
 * PUBLIC_PATHS entry, which already covers this whole [saId]/[offerId]
 * subtree the same as its purchase/signup/upsell siblings.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ saId: string; offerId: string }> },
) {
  const { saId, offerId } = await ctx.params;
  const db = getAdminDb();

  const offerSnap = await db
    .doc(`subAccounts/${saId}/courseOffers/${offerId}`)
    .get();
  if (!offerSnap.exists) {
    return NextResponse.json({ purchases: [] });
  }
  const offer = offerSnap.data() as CourseOffer;
  if (offer.showRecentPurchasePopup !== true) {
    return NextResponse.json({ purchases: [] });
  }

  const purchasesSnap = await db
    .collection(`subAccounts/${saId}/courseOffers/${offerId}/purchases`)
    .where("status", "==", "paid")
    .orderBy("paidAt", "desc")
    .limit(LIMIT)
    .get();

  const purchases = purchasesSnap.docs.map(
    (d) => d.data() as CourseOfferPurchase,
  );

  const memberIds = [...new Set(purchases.map((p) => p.memberId))].filter(
    Boolean,
  );
  const members = await Promise.all(
    memberIds.map((id) =>
      db.doc(`subAccounts/${saId}/members/${id}`).get(),
    ),
  );
  const memberById = new Map(
    members
      .filter((s) => s.exists)
      .map((s) => [s.id, s.data() as Member]),
  );

  const contactIds = [
    ...new Set(
      [...memberById.values()].map((m) => m.contactId).filter(Boolean),
    ),
  ] as string[];
  const contacts = await Promise.all(
    contactIds.map((id) => db.doc(`contacts/${id}`).get()),
  );
  const contactById = new Map(
    contacts
      .filter((s) => s.exists)
      .map((s) => [s.id, s.data() as Contact]),
  );

  const out: RecentPurchaseDto[] = [];
  for (const purchase of purchases) {
    const member = memberById.get(purchase.memberId);
    const contact = member?.contactId ? contactById.get(member.contactId) : null;
    const fullName = member?.displayName || contact?.name || "";
    const firstName = fullName.trim().split(/\s+/)[0] || "Someone";

    // Prefer Stripe's collected billing address (real, buyer-confirmed at
    // purchase time, and the only source with state-level data) over the
    // Contact's IP-geolocated city/country. Falls back for PayPal purchases
    // and anything bought before billing-address collection was turned on.
    const city = purchase.billingCity?.trim() || contact?.city?.trim() || "";
    const state = purchase.billingState?.trim() || "";
    const country =
      purchase.billingCountry?.trim() || contact?.country?.trim() || "";
    const location =
      [city, state || country].filter(Boolean).join(", ") || null;

    const paidAtMs =
      purchase.paidAt && typeof (purchase.paidAt as { toMillis?: () => number }).toMillis === "function"
        ? (purchase.paidAt as { toMillis: () => number }).toMillis()
        : Date.now();

    out.push({
      firstName,
      location,
      purchasedAt: new Date(paidAtMs).toISOString(),
    });
  }

  return NextResponse.json({ purchases: out });
}
