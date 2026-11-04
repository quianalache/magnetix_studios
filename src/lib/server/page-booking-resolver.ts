import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { buildBookingUrl } from "@/lib/domains/public-url";
import { isBookingSlug } from "@/lib/pages-funnels/booking-block";
import { publicBookingBranding, publicBookingPageData, type BookingBlockPayload } from "@/lib/booking/public-payload";
import type { BookingPage } from "@/types/booking";
import type { SubAccountDoc } from "@/types";

/**
 * The ONE place a Booking block's `bookingPageSlug` becomes a Booking Page
 * (Wave 2B-2). Same tenant model as `page-form-resolver.ts`: callers pass the
 * AUTHORITATIVE workspace — the page's own `subAccountId`, read server-side —
 * and the lookup is the path `subAccounts/{that}/bookingPages/{slug}`, so a
 * slug can only ever name a Booking Page in the page's own workspace. A
 * foreign or missing slug resolves to `null` identically (nothing leaks).
 *
 * Visibility follows the booking engine's own rule: only `published` Booking
 * Pages are bookable (the public booking route and availability API 404 the
 * rest). Published pages therefore get `null` for a draft Booking Page; the
 * builder (`includeDrafts`) gets it flagged so the owner sees why visitors
 * won't.
 */
export type { BookingBlockPayload };

export async function resolveBookingsForSubAccount(
  subAccountId: string | null | undefined,
  slugs: readonly string[],
  opts: { includeDrafts?: boolean } = {},
): Promise<Record<string, BookingBlockPayload | null>> {
  const unique = [...new Set(slugs)].slice(0, 20);
  const resolved: Record<string, BookingBlockPayload | null> = {};
  for (const slug of unique) resolved[slug] = null;
  const valid = unique.filter(isBookingSlug);
  if (!subAccountId || valid.length === 0) return resolved;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) return resolved;
  const sub = subSnap.data() as SubAccountDoc;

  await Promise.all(
    valid.map(async (slug) => {
      const snap = await db.doc(`subAccounts/${subAccountId}/bookingPages/${slug}`).get();
      if (!snap.exists) return;
      const page = { ...(snap.data() as BookingPage), slug };
      // Defense in depth: a doc stamped with another workspace never resolves.
      if (page.subAccountId && page.subAccountId !== subAccountId) return;
      const status = page.status === "published" ? "published" : "draft";
      if (status === "draft" && !opts.includeDrafts) return;
      resolved[slug] = {
        subAccountId,
        status,
        page: publicBookingPageData(page),
        branding: publicBookingBranding(page, sub),
        href: buildBookingUrl({ subAccount: sub, subAccountId, slug }),
      };
    }),
  );
  return resolved;
}
