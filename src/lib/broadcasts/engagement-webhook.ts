import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { BroadcastSendDoc, SendEngagement } from "@/types";

/**
 * Handles the Resend "engagement" event family — delivered/opened/clicked/
 * bounced/complained. Shares the same webhook endpoint + signing secret as
 * inbound email (see the dispatch in src/app/api/webhooks/resend/inbound/route.ts)
 * rather than standing up a second endpoint: Resend lets one endpoint
 * subscribe to multiple event types, so there's no operator setup beyond
 * checking the extra boxes on the existing webhook in the Resend dashboard.
 *
 * Every event carries `data.email_id`, matched back to a `sends` row via
 * `resendMessageId` (a Firestore collectionGroup query — the row could
 * belong to any broadcast). Most Resend traffic on this account is
 * transactional/automation email that was never written to a `sends` row at
 * all, so a lookup miss is the expected common case, not an error — ack and
 * no-op.
 *
 * Hard bounces and spam complaints also flip the sender's `emailOptedOut`,
 * matching the manual-unsubscribe-link behavior, since continuing to mail a
 * hard-bounced or complaining address damages sending reputation for every
 * other sub-account sharing this Resend account.
 */

interface EmailBounce {
  message: string;
  subType: string;
  type: string;
}
interface EmailClick {
  ipAddress: string;
  link: string;
  timestamp: string;
  userAgent: string;
}
interface BaseEmailEventData {
  email_id: string;
}

export type BroadcastEngagementEventType =
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained";

export const BROADCAST_ENGAGEMENT_EVENT_TYPES: readonly string[] = [
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
];

export async function handleBroadcastEngagementEvent(event: {
  type: string;
  data: BaseEmailEventData & { bounce?: EmailBounce; click?: EmailClick };
}): Promise<void> {
  const emailId = event.data?.email_id;
  if (!emailId) return;

  const db = getAdminDb();
  const lookup = await db
    .collectionGroup("sends")
    .where("resendMessageId", "==", emailId)
    .limit(1)
    .get();
  if (lookup.empty) return;

  const sendRef = lookup.docs[0].ref;
  const broadcastRef = sendRef.parent.parent;
  if (!broadcastRef) return;

  let contactIdToSuppress: string | null = null;
  let suppressReason: "hard bounce" | "spam complaint" | null = null;

  await db.runTransaction(async (tx) => {
    const sendSnap = await tx.get(sendRef);
    if (!sendSnap.exists) return;
    const send = sendSnap.data() as BroadcastSendDoc;
    const engagement = send.engagement;

    switch (event.type) {
      case "email.delivered": {
        if (engagement?.delivered) return;
        tx.update(sendRef, {
          "engagement.delivered": true,
          "engagement.deliveredAt": FieldValue.serverTimestamp(),
        });
        tx.update(broadcastRef, { "totals.delivered": FieldValue.increment(1) });
        return;
      }
      case "email.opened": {
        const updates: Record<string, unknown> = {
          "engagement.openCount": FieldValue.increment(1),
        };
        if (!engagement?.opened) {
          updates["engagement.opened"] = true;
          updates["engagement.openedAt"] = FieldValue.serverTimestamp();
          tx.update(broadcastRef, { "totals.opened": FieldValue.increment(1) });
        }
        tx.update(sendRef, updates);
        return;
      }
      case "email.clicked": {
        const updates: Record<string, unknown> = {
          "engagement.clickCount": FieldValue.increment(1),
          "engagement.lastClickedUrl": event.data.click?.link ?? null,
        };
        if (!engagement?.clicked) {
          updates["engagement.clicked"] = true;
          updates["engagement.clickedAt"] = FieldValue.serverTimestamp();
          tx.update(broadcastRef, { "totals.clicked": FieldValue.increment(1) });
        }
        tx.update(sendRef, updates);
        return;
      }
      case "email.bounced": {
        if (engagement?.bounced) return;
        const rawType = event.data.bounce?.type ?? "";
        const bounceType: SendEngagement["bounceType"] =
          rawType === "Permanent"
            ? "hard"
            : rawType === "Transient"
              ? "soft"
              : "undetermined";
        tx.update(sendRef, {
          "engagement.bounced": true,
          "engagement.bounceType": bounceType,
          "engagement.bouncedAt": FieldValue.serverTimestamp(),
        });
        tx.update(broadcastRef, { "totals.bounced": FieldValue.increment(1) });
        // Hard bounces only — a soft/undetermined bounce is often transient
        // (mailbox full, greylisting) and shouldn't cut someone off.
        if (bounceType === "hard") {
          contactIdToSuppress = send.contactId;
          suppressReason = "hard bounce";
        }
        return;
      }
      case "email.complained": {
        if (engagement?.complained) return;
        tx.update(sendRef, {
          "engagement.complained": true,
          "engagement.complainedAt": FieldValue.serverTimestamp(),
        });
        tx.update(broadcastRef, { "totals.complained": FieldValue.increment(1) });
        contactIdToSuppress = send.contactId;
        suppressReason = "spam complaint";
        return;
      }
      default:
        return;
    }
  });

  if (contactIdToSuppress && suppressReason) {
    const contactRef = db.collection("contacts").doc(contactIdToSuppress);
    await contactRef
      .update({ emailOptedOut: true })
      .catch((err) =>
        console.warn("[broadcasts/engagement] opt-out write failed", err),
      );
    await contactRef
      .collection("activities")
      .add({
        type: "automation_step_skipped",
        content: `Auto-unsubscribed: ${suppressReason}`,
        createdBy: "resend-webhook",
        meta: { kind: "email_opt_out", reason: suppressReason },
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch((err) =>
        console.warn("[broadcasts/engagement] activity write failed", err),
      );
  }
}
