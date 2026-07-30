import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { sendPushForEvent } from "@/lib/push/send";
import { formatCurrency } from "@/lib/format";
import type { EmitWebhookEventInput } from "@/lib/api/webhooks/dispatch";

/**
 * Push consumer for the webhook event stream — the second internal
 * subscriber at the emitWebhookEvent dispatch point (before the
 * API-subscription early-return, so push fires even when no external
 * webhook is registered).
 *
 * Speed-to-lead events (contact/booking/message/call) plus the "money
 * landed" events the operator picked (quote/invoice paid, course/community/
 * offer purchases — deal.won was explicitly left out) notify; everything
 * else is a silent no-op. Payloads arrive as `unknown` (the wire payloads
 * built at each emit site), so every field read here is defensive — a
 * shape drift degrades the notification copy, never throws.
 *
 * The four sale events don't carry a human-readable name/title in their
 * webhook payload (external subscribers only need the ids), so this file
 * does one extra Firestore read per sale to look it up — same trade the
 * `sendPushForEvent` call already makes for recipient resolution.
 */

const NEW_LEAD_SOURCE_LABELS: Record<string, string> = {
  "website-form": "Website form",
  "web-chat": "Web chat",
  "booking-page": "Booking page",
  community: "Community",
  website: "Website",
  referral: "Referral",
  ads: "Ads",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  voice: "Voice",
};

const CHANNEL_LABELS: Record<string, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function lookupContactName(contactId: string): Promise<string | null> {
  try {
    const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
    return str(snap.data()?.name) ?? null;
  } catch {
    return null;
  }
}

/** Members (community/course buyers) live at subAccounts/{id}/members/{memberId}
 *  and carry both a display name and a linked contactId — one read covers both. */
async function lookupMember(
  subAccountId: string,
  memberId: string,
): Promise<{ name: string | null; contactId: string | null }> {
  try {
    const snap = await getAdminDb()
      .doc(`subAccounts/${subAccountId}/members/${memberId}`)
      .get();
    const data = snap.data();
    return { name: str(data?.name), contactId: str(data?.contactId) };
  } catch {
    return { name: null, contactId: null };
  }
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export async function dispatchPushForWebhookEvent(
  input: EmitWebhookEventInput,
): Promise<void> {
  try {
    const payload = rec(input.payload);
    const base = {
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
    };

    switch (input.type) {
      case "contact.created": {
        const contact = rec(payload.contact);
        const id = str(contact.id);
        const name = str(contact.name) ?? "New contact";
        const source = str(contact.source);
        const sourceLabel = source
          ? (NEW_LEAD_SOURCE_LABELS[source] ??
            source.charAt(0).toUpperCase() + source.slice(1))
          : null;
        await sendPushForEvent({
          ...base,
          title: "New lead",
          body: sourceLabel ? `${name} · ${sourceLabel}` : name,
          url: id
            ? `/sa/${input.subAccountId}/contacts/${id}`
            : `/sa/${input.subAccountId}/contacts`,
          tag: id ? `lead-${id}` : undefined,
          territoryId: str(contact.territory_id),
        });
        return;
      }
      case "booking.created": {
        const booking = rec(payload.booking);
        const title = str(booking.title) ?? "New booking";
        const startAt = str(booking.start_at);
        // Format in the booking page's timezone (threaded through the
        // webhook payload) — without it toLocaleString falls back to the
        // server's zone (UTC in prod), showing the wrong time. Falls back
        // to the old behavior only when a timezone isn't available.
        const tz = str(booking.timezone);
        const when = startAt
          ? new Date(startAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              ...(tz ? { timeZone: tz } : {}),
            })
          : null;
        await sendPushForEvent({
          ...base,
          title: "New booking",
          body: when ? `${title} · ${when}` : title,
          url: `/sa/${input.subAccountId}/calendar`,
          tag: str(booking.id) ? `booking-${str(booking.id)}` : undefined,
        });
        return;
      }
      case "message.received": {
        const message = rec(payload.message);
        const contactId = str(message.contact_id);
        const name = str(message.contact_name) ?? "Unknown contact";
        const channel = str(message.channel);
        const channelLabel = channel ? CHANNEL_LABELS[channel] : null;
        const preview = str(message.preview) ?? "";
        await sendPushForEvent({
          ...base,
          title: channelLabel ? `${name} · ${channelLabel}` : name,
          body: preview,
          url: contactId
            ? `/sa/${input.subAccountId}/conversations/${contactId}`
            : `/sa/${input.subAccountId}/conversations`,
          // Collapse per conversation — a rapid burst from one contact
          // replaces the previous notification instead of stacking.
          tag: contactId ? `msg-${contactId}` : undefined,
        });
        return;
      }
      case "call.missed": {
        const call = rec(payload.call);
        const contactId = str(call.contact_id);
        const name = str(call.contact_name);
        const from = str(call.from);
        await sendPushForEvent({
          ...base,
          title: "Missed call",
          body: name || from || "Unknown caller",
          url: contactId
            ? `/sa/${input.subAccountId}/contacts/${contactId}`
            : `/sa/${input.subAccountId}/contacts`,
          tag: contactId ? `call-${contactId}` : undefined,
        });
        return;
      }
      case "quote.paid": {
        const quote = rec(payload.quote);
        const id = str(quote.id);
        const contactId = str(quote.contact_id);
        const total = num(quote.total);
        const currency = str(quote.currency) ?? "USD";
        const kind = quote.kind === "invoice" ? "Invoice" : "Quote";
        const contactName = contactId ? await lookupContactName(contactId) : null;
        await sendPushForEvent({
          ...base,
          title: `${kind} paid`,
          body: [contactName, total !== null ? formatCurrency(total, currency) : null]
            .filter(Boolean)
            .join(" · "),
          url: contactId
            ? `/sa/${input.subAccountId}/contacts/${contactId}`
            : `/sa/${input.subAccountId}/quotes`,
          tag: id ? `quote-${id}` : undefined,
        });
        return;
      }
      case "community.purchase.paid": {
        const memberId = str(payload.memberId);
        const purchaseId = str(payload.purchaseId);
        const amountCents = num(payload.amountCents);
        const currency = str(payload.currency) ?? "USD";
        const { name, contactId } = memberId
          ? await lookupMember(input.subAccountId, memberId)
          : { name: null, contactId: null };
        await sendPushForEvent({
          ...base,
          title: "New community sale",
          body: [name, amountCents !== null ? formatCurrency(amountCents / 100, currency) : null]
            .filter(Boolean)
            .join(" · "),
          url: contactId
            ? `/sa/${input.subAccountId}/contacts/${contactId}`
            : `/sa/${input.subAccountId}/community`,
          tag: purchaseId ? `purchase-${purchaseId}` : undefined,
        });
        return;
      }
      case "course.purchase.paid": {
        const memberId = str(payload.memberId);
        const purchaseId = str(payload.purchaseId);
        const amountCents = num(payload.amountCents);
        const currency = str(payload.currency) ?? "USD";
        const { name, contactId } = memberId
          ? await lookupMember(input.subAccountId, memberId)
          : { name: null, contactId: null };
        await sendPushForEvent({
          ...base,
          title: "New course sale",
          body: [name, amountCents !== null ? formatCurrency(amountCents / 100, currency) : null]
            .filter(Boolean)
            .join(" · "),
          url: contactId
            ? `/sa/${input.subAccountId}/contacts/${contactId}`
            : `/sa/${input.subAccountId}/courses`,
          tag: purchaseId ? `purchase-${purchaseId}` : undefined,
        });
        return;
      }
      case "course.offer.purchase.paid": {
        const memberId = str(payload.memberId);
        const purchaseId = str(payload.purchaseId);
        const amountCents = num(payload.amountCents);
        const currency = str(payload.currency) ?? "USD";
        const { name, contactId } = memberId
          ? await lookupMember(input.subAccountId, memberId)
          : { name: null, contactId: null };
        await sendPushForEvent({
          ...base,
          title: "New offer sale",
          body: [name, amountCents !== null ? formatCurrency(amountCents / 100, currency) : null]
            .filter(Boolean)
            .join(" · "),
          url: contactId
            ? `/sa/${input.subAccountId}/contacts/${contactId}`
            : `/sa/${input.subAccountId}/courses`,
          tag: purchaseId ? `purchase-${purchaseId}` : undefined,
        });
        return;
      }
      default:
        return;
    }
  } catch (err) {
    console.warn("[push/events] dispatch failed", err);
  }
}
