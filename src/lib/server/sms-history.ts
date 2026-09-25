import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { upsertConversationForMessage } from "@/lib/server/conversations-service";
import type { Contact } from "@/types/contacts";

/** Record an accepted send in either sender mode. Logging failure must never
 * cause a provider retry (and a duplicate SMS). */
export async function recordOutboundSms(input: {
  contact: Contact;
  body: string;
  sent: { sid: string; mode: "shared" | "dedicated"; from: string };
  sentByUid: string | null;
  pauseBot?: boolean;
}): Promise<void> {
  const { contact, body, sent, sentByUid } = input;
  try {
    await getAdminDb().doc(`contacts/${contact.id}/messages/${sent.sid}`).set({
      agencyId: contact.agencyId,
      subAccountId: contact.subAccountId,
      contactId: contact.id,
      direction: "outbound",
      status: "sent",
      body,
      from: sent.from,
      to: contact.phone,
      mode: sent.mode,
      twilioMessageSid: sent.sid,
      sentByUid,
      error: null,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await upsertConversationForMessage({
      contactId: contact.id,
      subAccountId: contact.subAccountId,
      agencyId: contact.agencyId,
      contactName: contact.name ?? "",
      contactPhone: contact.phone,
      channel: "sms",
      direction: "outbound",
      body,
      pauseBot: input.pauseBot,
      messageId: sent.sid,
    });
  } catch {
    console.warn("[sms/history] failed to record accepted send");
  }
}
