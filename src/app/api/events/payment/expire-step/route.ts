import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  emailIsConfigured,
  sendTenantEmail,
} from "@/lib/comms/resend";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { issueEventToken } from "@/lib/booking/event-token";
import {
  emitBookingWebhook,
  fireBookingTrigger,
  recordBookingActivity,
} from "@/lib/booking/lifecycle";
import { notifyBookingCancelled } from "@/lib/server/notification-producers";
import { renderBookingCancelledEmail } from "@/lib/booking/email";
import { eventStatus } from "@/types/events";
import type { BookingPage } from "@/types/booking";
import type { CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * QStash callback that auto-cancels an `awaiting_payment` event whose
 * hold window has lapsed. Scheduled at booking time by
 * `schedulePaymentAutoExpire()`. Security: Upstash-Signature verify.
 *
 * Skip conditions (all return 200 so QStash doesn't retry):
 *   - Event missing
 *   - Status no longer `awaiting_payment` (operator marked paid OR the
 *     visitor already cancelled)
 *   - startAt has passed (race — meeting was meant to happen)
 *
 * On expire: flips to `cancelled` with `cancelReason: "payment_expired"`,
 * emails the visitor a "slot released" note, fires `event_cancelled`.
 */

interface ExpireBody {
  eventId?: string;
}

export async function POST(request: Request) {
  const signature = request.headers.get("Upstash-Signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const rawBody = await request.text();
  const ok = await verifyQStashSignature(signature, rawBody);
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: ExpireBody;
  try {
    body = JSON.parse(rawBody) as ExpireBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = body.eventId;
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("events").doc(eventId);

  let expiredEvent: CalendarEvent | null = null;
  try {
    expiredEvent = await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists) return null;
      const event = snap.data() as CalendarEvent;
      if (eventStatus(event) !== "awaiting_payment") return null;
      const startAt = (
        event.startAt as { toDate?: () => Date } | null
      )?.toDate?.();
      if (!(startAt instanceof Date) || startAt.getTime() <= Date.now()) {
        // Race: meeting already happened. Operator should clean up
        // manually — auto-cancelling a past meeting is misleading.
        return null;
      }
      txn.update(ref, {
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledByVisitor: false,
        cancelReason: "payment_expired",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return event;
    });
  } catch (err) {
    console.error("[events/payment/expire] txn failed", err);
    return NextResponse.json({ ok: true, skipped: "txn_error" });
  }

  if (!expiredEvent) {
    return NextResponse.json({ ok: true, skipped: "no_action" });
  }

  // Best-effort side effects.
  await runExpireSideEffects(expiredEvent);

  return NextResponse.json({ ok: true });
}

async function runExpireSideEffects(event: CalendarEvent): Promise<void> {
  if (!event.contactId) return;
  const db = getAdminDb();
  try {
    const [contactSnap, subSnap, pageSnap] = await Promise.all([
      db.collection("contacts").doc(event.contactId).get(),
      db.doc(`subAccounts/${event.subAccountId}`).get(),
      event.bookingPageSlug
        ? db
            .doc(
              `subAccounts/${event.subAccountId}/bookingPages/${event.bookingPageSlug}`,
            )
            .get()
        : Promise.resolve(null),
    ]);
    if (contactSnap.exists && subSnap.exists && emailIsConfigured()) {
      const contact = contactSnap.data() as Contact;
      const sub = subSnap.data() as SubAccountDoc;
      const page = (pageSnap?.data() ?? null) as BookingPage | null;
      const startAt = (
        event.startAt as { toDate?: () => Date } | null
      )?.toDate?.();
      const endAt = (
        event.endAt as { toDate?: () => Date } | null
      )?.toDate?.();
      // Marketing-vs-transactional audit (2026-08-27): the "slot released"
      // notice is transactional — gated on deliverabilitySuppressed (hard
      // bounce / spam complaint), never on emailOptedOut (marketing consent).
      if (
        contact.email &&
        !contact.deliverabilitySuppressed &&
        startAt instanceof Date &&
        endAt instanceof Date
      ) {
        const rendered = renderBookingCancelledEmail(
          {
            recipientName: contact.name ?? "",
            businessName: sub.name ?? "Booking",
            businessLogoUrl: sub.logoUrl,
            page: {
              name: page?.name ?? event.title ?? "Meeting",
              durationMinutes:
                page?.durationMinutes ??
                Math.max(15, Math.round((endAt.getTime() - startAt.getTime()) / 60_000)),
              timezone: page?.timezone ?? "UTC",
              payment: page?.payment ?? null,
              confirmationMessage: page?.confirmationMessage ?? "",
            },
            startAt,
            endAt,
            publicEventUrl: "",
          },
          "payment_expired",
        );
        try {
          await sendTenantEmail({
            sub,
            to: contact.email,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
          });
        } catch (err) {
          console.warn("[events/payment/expire] notify send failed", err);
        }
      }
    }
  } catch (err) {
    console.warn("[events/payment/expire] side-effect read failed", err);
  }

  await recordBookingActivity(
    {
      id: event.id,
      title: event.title || "Meeting",
      contactId: event.contactId,
      bookingPageSlug: event.bookingPageSlug ?? null,
    },
    "booking_cancelled",
    { extra: "payment hold expired" },
  );
  await fireBookingTrigger(
    {
      agencyId: event.agencyId,
      subAccountId: event.subAccountId,
      contactId: event.contactId,
    },
    "event_cancelled",
  );
  // Reliability fix (2026-08-26): AWAITED, not void-fired — see
  // lifecycle.ts's emitBookingWebhook doc comment for the live evidence.
  await emitBookingWebhook({
    eventId: event.id,
    agencyId: event.agencyId,
    subAccountId: event.subAccountId,
    type: "booking_cancelled",
    cancelReason: "payment hold expired",
  });

  // Same gap as the operator-cancel route: no raw public token in scope
  // here (only the hash is ever persisted), so mint a fresh one purely to
  // give this notification a real destination — safe for the same reason
  // documented on mark-status's cancel branch (the legacy cancellation
  // email never linked anywhere, so there's no existing link to break).
  // This callback only reaches here once per real expiry (see the
  // transaction above — a retry finds status no longer awaiting_payment
  // and returns null before any side effects run), so no extra
  // idempotency concern beyond createNotification's own dedupe.
  try {
    const db = getAdminDb();
    const { token: freshToken, hash } = issueEventToken(event.id);
    await db.doc(`events/${event.id}`).update({
      publicTokenHash: hash,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const pageSnap = event.bookingPageSlug
      ? await db.doc(`subAccounts/${event.subAccountId}/bookingPages/${event.bookingPageSlug}`).get()
      : null;
    const bookingName = (pageSnap?.data()?.name as string | undefined) ?? event.title ?? "Meeting";
    await notifyBookingCancelled({
      subAccountId: event.subAccountId,
      bookingId: event.id,
      contactId: event.contactId,
      bookingName,
      token: freshToken,
    }).catch((err) => console.warn("[events/payment/expire] notification failed", err));
  } catch (err) {
    console.warn("[events/payment/expire] token mint / notification setup failed", err);
  }
}
