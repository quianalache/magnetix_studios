import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendTenantEmail, NoTenantDomainError, emailIsConfigured } from "@/lib/comms/resend";
import type { NotificationDoc, NotificationEventType, NotificationEmailDelivery } from "@/types/notifications";
import type { ResendConfig } from "@/types/tenancy";

/**
 * Transactional Notification Emails V1 — email is a delivery CHANNEL layered
 * on top of the canonical MyMagnetix Notification record, never an
 * independent thing. Called (fire-and-forget, `void`, wrapped in its own
 * try/catch) from notification-service.ts's `createNotification`, exactly
 * once, exactly when a NEW notification is actually created — a duplicate
 * notification-create attempt never reaches here at all (createNotification's
 * own `.create()` dedupe already rejected it), which is what gives email
 * sending its idempotency: at most one email per real notification
 * occurrence, no separate locking needed. `NotificationEmailDelivery` is
 * keyed by `notificationId` as a second, defense-in-depth layer.
 *
 * Sender ownership (explicit product requirement — never route sub-account
 * customer-facing email through a shared platform sender): uses
 * `sendTenantEmail`, the SAME strict helper the real booking-confirmation
 * flow already uses in production (`api/booking/[saId]/[slug]/book/route.ts`)
 * — it throws `NoTenantDomainError` instead of ever silently falling back to
 * the shared `EMAIL_FROM`. That existing flow's own established handling
 * (`try { await sendTenantEmail(...) } catch (err) { console.warn(...) }`,
 * the booking itself always succeeds regardless) is the proof this
 * codebase's real answer to "no verified sender" is SKIP, not a Magnetix-
 * managed fallback — no such fallback exists anywhere in production today,
 * confirmed by inspection before writing this file, not assumed.
 */

/**
 * Booking loop (2026-08-26) — deliberately NOT added here. Audited the
 * booking flow before wiring notifyBookingCreated/Rescheduled/Cancelled:
 * booking.created, booking.rescheduled, AND booking.cancelled each already
 * have a real, working, tenant-branded legacy email
 * (renderBookingConfirmationEmail / renderBookingCancelledEmail in
 * booking/email.ts, sent directly from the booking routes — the created
 * one even carries an ICS calendar attachment this generic template
 * doesn't produce). Adding these types here would send the customer TWO
 * emails for one event. The MyMagnetix notification (in-app bell) is
 * still created for all three — this set only gates the EMAIL channel.
 */
const EMAIL_ELIGIBLE_EVENT_TYPES: ReadonlySet<NotificationEventType> = new Set([
  "course.access.granted",
  "community.access.granted",
  "community.reply",
  "community.mention",
]);

function deliveryCol() {
  return getAdminDb().collection("notificationEmailDeliveries");
}

function usageCol() {
  return getAdminDb().collection("notificationEmailUsage");
}

/** Never a raw provider error string in a stored/user-facing field — see
 *  the type's own doc comment. Keeps the shape, drops any payload detail. */
function sanitizeFailureReason(err: unknown): string {
  if (err instanceof NoTenantDomainError) return "no-verified-sender";
  return "send-failed";
}

interface DispatchInput {
  id: string;
  personId: string;
  subAccountId: string | null;
  eventType: NotificationEventType;
  objectType: NotificationDoc["objectType"];
  title: string;
  destination: string;
  meta: NotificationDoc["meta"];
}

/**
 * Entry point — called once per genuinely-new notification. Never throws;
 * every branch that stops short (ineligible type, already attempted, no
 * recipient email, no verified sender, provider failure) writes an honest
 * delivery record and returns. The caller never awaits this in a way that
 * could block the notification write it already completed.
 */
export async function dispatchNotificationEmail(notification: DispatchInput): Promise<void> {
  try {
    if (!EMAIL_ELIGIBLE_EVENT_TYPES.has(notification.eventType)) return;
    if (!notification.subAccountId) return; // every V1-eligible type has one; defensive only
    if (!emailIsConfigured()) return; // local/dev without Resend configured — silent no-op, matches emailIsConfigured's existing use elsewhere

    const ref = deliveryCol().doc(notification.id);
    try {
      await ref.create(pendingDoc(notification));
    } catch (err) {
      // ALREADY_EXISTS (code 6) — a delivery was already attempted for this
      // notification. Only a prior FAILURE is worth revisiting later (a
      // future retry pass, not built in V1); sent/skipped are final. Either
      // way, this call is done — never send a second email here.
      const code = (err as { code?: number })?.code;
      if (code !== 6) console.error("[notification-email] delivery doc create failed:", err);
      return;
    }

    const [personSnap, subSnap] = await Promise.all([
      getAdminDb().doc(`people/${notification.personId}`).get(),
      getAdminDb().doc(`subAccounts/${notification.subAccountId}`).get(),
    ]);

    const recipientEmail = (personSnap.data()?.primaryEmail as string | undefined)?.trim() || null;
    if (!recipientEmail) {
      await ref.update({
        status: "skipped",
        failureReason: "no-deliverable-email",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const sub = subSnap.exists
      ? (subSnap.data() as {
          name?: string;
          resendConfig?: ResendConfig | null;
          emailDomainEnabledByAgency?: boolean;
          replyToEmail?: string | null;
        })
      : null;
    const businessName = sub?.name?.trim() || "Magnetix";

    const rendered = renderNotificationEmail(notification, businessName);

    try {
      const result = await sendTenantEmail({
        sub,
        to: recipientEmail,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      await ref.update({
        status: "sent",
        providerMessageId: result.id,
        recipientEmail,
        senderEmail: sub?.resendConfig?.emailFrom ?? null,
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await usageCol().add({
        subAccountId: notification.subAccountId,
        category: "transactional_notification",
        eventType: notification.eventType,
        quantity: 1,
        provider: "resend",
        sentAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      await ref.update({
        status: "failed",
        recipientEmail,
        failureReason: sanitizeFailureReason(err),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    // Top-level safety net — this function must never throw into its
    // fire-and-forget caller regardless of what fails above.
    console.error("[notification-email] dispatchNotificationEmail failed:", err);
  }
}

function pendingDoc(n: DispatchInput): Omit<NotificationEmailDelivery, "id" | "createdAt" | "updatedAt" | "sentAt"> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
  sentAt: null;
} {
  return {
    notificationId: n.id,
    personId: n.personId,
    subAccountId: n.subAccountId,
    channel: "email",
    status: "pending",
    emailCategory: "transactional_notification",
    eventType: n.eventType,
    provider: "resend",
    providerMessageId: null,
    recipientEmail: null,
    senderEmail: null,
    sentAt: null,
    failureReason: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

// ---------------------------------------------------------------------------
// Template — deliberately lightweight, mirrors booking/email.ts's minimal
// scaffolding (own copy, not a shared import — same convention that
// module's own comment establishes for this codebase's per-flow email
// templates). No newsletter chrome, one CTA, reuses the notification's own
// already-decided copy rather than re-deciding it.
// ---------------------------------------------------------------------------

// Booking entries below are unreachable in V1 (not in
// EMAIL_ELIGIBLE_EVENT_TYPES — see that set's own comment) but kept
// complete/accurate rather than omitted: CTA_LABELS is a total map over
// every NotificationEventType, and having a correct-but-unused entry here
// is harmless and future-proofs the day the legacy booking emails are
// ever retired in favor of this pipeline.
const CTA_LABELS: Record<NotificationEventType, string> = {
  "course.access.granted": "View in MyMagnetix",
  "community.access.granted": "View in MyMagnetix",
  "community.reply": "View reply",
  "community.mention": "View mention",
  "reading.ready": "View in MyMagnetix",
  "booking.created": "View booking",
  "booking.rescheduled": "View booking",
  "booking.cancelled": "View details",
};

const SUBJECT_BY_CATEGORY: Partial<Record<NotificationEventType, (businessName: string) => string>> = {
  "course.access.granted": (b) => `You have something new from ${b}`,
  "community.access.granted": (b) => `You have something new from ${b}`,
  "booking.created": () => "Your booking is confirmed",
  "booking.rescheduled": () => "Your booking was rescheduled",
  "booking.cancelled": () => "Your booking was cancelled",
  "community.reply": (b) => `New activity in ${b}`,
  "community.mention": (b) => `New activity in ${b}`,
};

function renderNotificationEmail(
  n: DispatchInput,
  businessName: string,
): { subject: string; text: string; html: string } {
  const subject = (SUBJECT_BY_CATEGORY[n.eventType] ?? ((b: string) => `Update from ${b}`))(businessName);
  const ctaLabel = CTA_LABELS[n.eventType] ?? "View in MyMagnetix";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const ctaHref = `${appUrl}${n.destination}`;

  const text = [n.title, "", `${ctaLabel}: ${ctaHref}`, "", businessName].join("\n");

  const html = wrapHtml(
    businessName,
    `
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#1a1a22;">${escapeHtml(n.title)}</p>
      ${primaryCta(ctaHref, ctaLabel)}
    `,
  );

  return { subject, text, html };
}

function wrapHtml(businessName: string, body: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#1a1a22;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <tr><td>
      <p style="margin:0 0 20px;font-size:12px;color:#6a6a74;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(businessName)}</p>
      ${body}
    </td></tr>
  </table>
</body></html>`;
}

function primaryCta(href: string, label: string): string {
  return `<p style="margin:8px 0 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#7C3AED;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">${escapeHtml(label)}</a>
  </p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
