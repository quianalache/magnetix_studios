import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getCourseOffer } from "@/lib/server/course-offer-service";
import { buildBookingUrl, buildOfferUrl, buildPublishedPageUrl } from "@/lib/domains/public-url";
import { collectActionTargets } from "@/lib/pages-funnels/puck/action";
import { isSafeActionUrl, isSafeSectionId, isValidEmailAddress, normalizePhoneNumber } from "@/lib/pages-funnels/puck/action";
import type { ActionContext, Destination, DestinationResolution } from "@/types/pages-funnels-action";
import type { ResolvedActionTargets } from "@/types/pages-funnels-puck";
import type { PageDoc } from "@/types/pages-funnels";
import type { SubAccountDoc } from "@/types";
import type { BookingPage } from "@/types/booking";

/**
 * Resolves a page's object-bound Button/Image actions (Go to Page, Go to
 * Offer, Go to booking page) to their authoritative public URLs — custom-domain aware, via the
 * same builders every other public link uses. Tenant-safe by construction:
 * a target resolves only when it belongs to `subAccountId` AND visitors can
 * open it (published page / published Offer). Anything else is null and the
 * button renders without a link.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export type ResolveDestinationInput = {
  subAccountId: string;
  currentPageId?: string;
  sectionIds?: string[];
  mode: Exclude<ActionContext, "builder">;
  destination: Destination;
};

function failure(status: Exclude<DestinationResolution, { status: "resolved" }>["status"], destinationType: Destination["type"] | null): DestinationResolution {
  return { status, destinationType };
}

/**
 * The one server-side destination policy for Pages & Funnels. Preview is
 * explicit even where its current approved behavior is the same published-
 * target policy: it is staff-only, same-tenant, and has no transaction path.
 * Draft target simulation belongs to a later Preview slice, not this one.
 */
export async function resolveDestination(input: ResolveDestinationInput): Promise<DestinationResolution> {
  const { destination, subAccountId } = input;
  if (!subAccountId) return failure("unavailable", destination.type);

  if (destination.type === "external_url") {
    const url = destination.url.trim();
    return url && isSafeActionUrl(url)
      ? { status: "resolved", destination: { href: url, newTab: false, destinationType: destination.type } }
      : failure("invalid", destination.type);
  }

  if (destination.type === "section") {
    if (!isSafeSectionId(destination.elementId)) return failure("invalid", destination.type);
    if (input.sectionIds && !input.sectionIds.includes(destination.elementId)) return failure("missing", destination.type);
    return { status: "resolved", destination: { href: `#${destination.elementId}`, newTab: false, destinationType: destination.type } };
  }

  if (destination.type === "call" || destination.type === "sms") {
    const phone = normalizePhoneNumber(destination.phoneNumber);
    if (!phone) return failure("invalid", destination.type);
    return { status: "resolved", destination: { href: `${destination.type === "call" ? "tel" : "sms"}:${phone}`, newTab: false, destinationType: destination.type } };
  }

  if (destination.type === "email") {
    const email = destination.emailAddress.trim();
    if (!isValidEmailAddress(email)) return failure("invalid", destination.type);
    const subject = destination.subject?.trim();
    return { status: "resolved", destination: { href: `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`, newTab: false, destinationType: destination.type } };
  }

  if (destination.type === "funnel_next_step" || destination.type === "funnel_step") {
    return failure("unsupported", destination.type);
  }

  if (destination.type === "booking") {
    if (!ID.test(destination.bookingPageSlug)) return failure("invalid", destination.type);
  }
  if (destination.type === "page" && !ID.test(destination.pageId)) return failure("invalid", destination.type);
  if (destination.type === "offer_checkout" && !ID.test(destination.offerId)) return failure("invalid", destination.type);

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) return failure("unavailable", destination.type);
  const sub = subSnap.data() as SubAccountDoc;

  if (destination.type === "page") {
    const snap = await db.collection("pages").doc(destination.pageId).get();
    if (!snap.exists) return failure("missing", destination.type);
    const page = snap.data() as PageDoc;
    if (page.subAccountId !== subAccountId) return failure("cross_tenant", destination.type);
    if (page.status !== "published") return failure("unpublished", destination.type);
    return { status: "resolved", destination: { href: buildPublishedPageUrl({ subAccount: sub, pageId: destination.pageId }), newTab: false, destinationType: destination.type } };
  }

  if (destination.type === "offer_checkout") {
    const offer = await getCourseOffer(subAccountId, destination.offerId).catch(() => null);
    if (!offer) return failure("missing", destination.type);
    if (offer.subAccountId !== subAccountId) return failure("cross_tenant", destination.type);
    if (offer.visibility !== "published") return failure("unpublished", destination.type);
    return { status: "resolved", destination: { href: buildOfferUrl({ subAccount: sub, subAccountId, offerId: offer.id, slug: offer.slug }), newTab: false, destinationType: destination.type } };
  }

  if (destination.type === "booking") {
    const snap = await db.doc(`subAccounts/${subAccountId}/bookingPages/${destination.bookingPageSlug}`).get();
    if (!snap.exists) return failure("missing", destination.type);
    const booking = snap.data() as BookingPage;
    if (booking.status !== "published") return failure("unpublished", destination.type);
    return { status: "resolved", destination: { href: buildBookingUrl({ subAccount: sub, subAccountId, slug: destination.bookingPageSlug }), newTab: false, destinationType: destination.type } };
  }

  return failure("unsupported", null);
}

export async function resolveActionTargets(
  subAccountId: string,
  ids: { pageIds: string[]; offerIds: string[]; bookingSlugs?: string[]; sectionIds?: string[] },
  mode: Exclude<ActionContext, "builder"> = "published",
): Promise<ResolvedActionTargets> {
  const pageIds = [...new Set(ids.pageIds.filter((id) => ID.test(id)))].slice(0, 50);
  const offerIds = [...new Set(ids.offerIds.filter((id) => ID.test(id)))].slice(0, 50);
  const bookingSlugs = [...new Set((ids.bookingSlugs ?? []).filter((slug) => ID.test(slug)))].slice(0, 50);
  const result: ResolvedActionTargets = { pages: {}, offers: {}, bookings: {}, sectionIds: ids.sectionIds ?? [] };
  if (!subAccountId || (pageIds.length === 0 && offerIds.length === 0 && bookingSlugs.length === 0)) return result;

  await Promise.all([
    ...pageIds.map(async (pageId) => {
      const resolved = await resolveDestination({ subAccountId, mode, destination: { type: "page", pageId } });
      result.pages[pageId] = resolved.status === "resolved" ? { href: resolved.destination.href } : null;
    }),
    ...offerIds.map(async (offerId) => {
      const resolved = await resolveDestination({ subAccountId, mode, destination: { type: "offer_checkout", offerId } });
      result.offers[offerId] = resolved.status === "resolved" ? { href: resolved.destination.href } : null;
    }),
    // Booking Pages: same workspace by path, published only (resolveDestination).
    ...bookingSlugs.map(async (bookingPageSlug) => {
      const resolved = await resolveDestination({ subAccountId, mode, destination: { type: "booking", bookingPageSlug } });
      result.bookings![bookingPageSlug] = resolved.status === "resolved" ? { href: resolved.destination.href } : null;
    }),
  ]);
  return result;
}

/** Collects and resolves every action target on one page's Puck data. */
export async function resolvePageActionTargets(subAccountId: string, data: unknown): Promise<ResolvedActionTargets> {
  return resolveActionTargets(subAccountId, collectActionTargets(data));
}
