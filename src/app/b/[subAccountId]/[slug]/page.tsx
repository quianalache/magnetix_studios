import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { PublicBookingView } from "@/components/booking/public-booking-view";
import { resolveBookingLogo } from "@/lib/brand/workspace-logo";
import type { BookingPage } from "@/types/booking";
import type { SubAccountDoc } from "@/types";
import type { Metadata } from "next";
import { publicTitle } from "@/lib/server/public-identity";

export const dynamic = "force-dynamic";

/**
 * Public booking page — what visitors land on. Server-rendered via the
 * Admin SDK so we can keep Firestore rules member-only on the booking
 * page doc + parent sub-account (no public-read carve-out needed).
 *
 * Treats missing + draft pages identically (404) so we don't leak the
 * existence of unpublished pages. Sub-account doc is fetched for
 * branding (logoUrl, name) — falls back to the booking page's overrides
 * when set.
 *
 * The interactive picker + intake form mount as a client component
 * (PublicBookingView). All availability + booking POSTs flow through
 * the public /api/booking/[saId]/[slug]/* routes.
 */

interface PageProps {
  params: Promise<{ subAccountId: string; slug: string }>;
}

/** Browser title: the booking page's own name and brand (2026-10-16 public surfaces). */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const { subAccountId, slug } = await params;
    const db = getAdminDb();
    const [pageSnap, subSnap] = await Promise.all([db.doc(`subAccounts/${subAccountId}/bookingPages/${slug}`).get(), db.doc(`subAccounts/${subAccountId}`).get()]);
    const page = pageSnap.data() as BookingPage | undefined;
    if (!page || page.status !== "published") return {};
    return { title: publicTitle(page.name, page.brandName || (subSnap.data()?.name as string | undefined)) };
  } catch {
    return {};
  }
}

export default async function PublicBookingPage({ params }: PageProps) {
  const { subAccountId, slug } = await params;
  const db = getAdminDb();

  const [pageSnap, subSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}/bookingPages/${slug}`).get(),
    db.doc(`subAccounts/${subAccountId}`).get(),
  ]);
  if (!pageSnap.exists || !subSnap.exists) notFound();

  const page = pageSnap.data() as BookingPage;
  if (page.status !== "published") notFound();

  const sub = subSnap.data() as SubAccountDoc;

  // Pick branding: per-page overrides win, sub-account defaults next,
  // hardcoded fallback last. Keep it serialisable — server-to-client
  // boundary requires plain JSON.
  const branding = {
    name: page.brandName || sub.name || "Schedule a meeting",
    logoUrl: resolveBookingLogo(page, sub),
    accentColor: page.accentColor ?? null,
    displayFont: page.displayFont ?? null,
  };

  // Strip the Firestore Timestamp fields from the page before handing
  // it to the client — we never need `createdAt` / `updatedAt` on the
  // public surface and they're not JSON-serialisable as-is.
  const pageForClient: Omit<BookingPage, "createdAt" | "updatedAt"> & {
    createdAt: null;
    updatedAt: null;
  } = {
    ...page,
    createdAt: null,
    updatedAt: null,
  };

  return (
    <PublicBookingView
      subAccountId={subAccountId}
      page={pageForClient}
      branding={branding}
    />
  );
}
