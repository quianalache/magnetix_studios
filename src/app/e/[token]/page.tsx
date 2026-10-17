import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";

import { resolveBookingLogo } from "@/lib/brand/workspace-logo";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  hashEventToken,
  verifyEventToken,
} from "@/lib/booking/event-token";
import { PublicEventView } from "@/components/booking/public-event-view";
import { eventStatus } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";
import type { SubAccountDoc } from "@/types/tenancy";
import { publicTitle } from "@/lib/server/public-identity";

export const dynamic = "force-dynamic";

/**
 * Public event-management page. Lets the attendee view their booking
 * details and reschedule / cancel without logging in.
 *
 * Security:
 *   1. HMAC token verified by `verifyEventToken()`.
 *   2. Loaded event's `publicTokenHash` compared against
 *      `hashEventToken(presentedToken)`. Mismatch (e.g. reschedule
 *      rotated, or a forged token) → 404, identical to "not found".
 *
 * Mirrors the /q/[token] quote pattern: server-renders the headline
 * + canonical details so the page is useful before any JS hydrates;
 * the interactive reschedule/cancel UX lands in the client component.
 */

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Loads the booking a manage link points at, applying every check the page
 * relies on (HMAC, current token hash, booking-page event). Null = not found.
 * Cached per request so the title and the page share one read.
 */
const loadManagedEvent = cache(async (token: string) => {
  const verified = verifyEventToken(token);
  if (!verified) return null;

  const db = getAdminDb();
  const eventSnap = await db.collection("events").doc(verified.eventId).get();
  if (!eventSnap.exists) return null;
  const event = eventSnap.data() as CalendarEvent;
  if (event.publicTokenHash !== hashEventToken(token)) return null;
  const pageSlug = event.bookingPageSlug;
  if (!pageSlug) return null;

  const [subSnap, pageSnap] = await Promise.all([
    db.doc(`subAccounts/${event.subAccountId}`).get(),
    db
      .doc(
        `subAccounts/${event.subAccountId}/bookingPages/${event.bookingPageSlug}`,
      )
      .get(),
  ]);
  if (!subSnap.exists) return null;
  const sub = subSnap.data() as SubAccountDoc;
  const page = (pageSnap.exists ? pageSnap.data() : null) as BookingPage | null;
  // The same business name the public booking page shows; empty when neither exists.
  const businessName = (page?.brandName || sub.name || "").trim();
  return { event, sub, page, pageSlug, businessName };
});

/** Browser title: "{session} · {business}". */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const loaded = await loadManagedEvent((await params).token);
    if (!loaded) return {};
    const { event, page, businessName } = loaded;
    return { title: publicTitle(page?.name ?? event.title ?? "Your booking", businessName) };
  } catch {
    return {};
  }
}

export default async function PublicEventPage({ params }: PageProps) {
  const { token } = await params;

  const loaded = await loadManagedEvent(token);
  if (!loaded) notFound();
  const { event, sub, page, pageSlug, businessName } = loaded;

  const startAt = (
    event.startAt as { toDate?: () => Date } | null
  )?.toDate?.();
  const endAt = (
    event.endAt as { toDate?: () => Date } | null
  )?.toDate?.();
  if (!startAt || !endAt) notFound();

  const branding = {
    name: businessName,
    logoUrl: resolveBookingLogo(page ?? {}, sub),
    accentColor: page?.accentColor ?? null,
  };

  return (
    <PublicEventView
      token={token}
      subAccountId={event.subAccountId}
      eventId={event.id}
      status={eventStatus(event)}
      title={event.title ?? "Meeting"}
      pageName={page?.name ?? event.title ?? "Meeting"}
      pageSlug={pageSlug}
      bookingPageStatus={page?.status ?? "published"}
      timezone={page?.timezone ?? "UTC"}
      durationMinutes={page?.durationMinutes ?? 30}
      startAt={startAt.toISOString()}
      endAt={endAt.toISOString()}
      paymentLinkUrl={event.paymentLinkUrl ?? null}
      paymentAmount={event.paymentAmount ?? null}
      paymentCurrency={event.paymentCurrency ?? null}
      branding={branding}
    />
  );
}
