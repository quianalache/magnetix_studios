"use client";

import { ActiveConversation } from "@/components/conversations/conversation-workspace";
import type { Contact } from "@/types/contacts";

/**
 * Contact profile → Conversations tab (Contacts redesign, 2026-09-25).
 *
 * Embeds the Conversations workspace's own `ActiveConversation` — the
 * merged multi-channel thread, channel availability, composer (reply +
 * internal note), AI controls, pending AI draft, status and assignment.
 * Nothing is re-implemented here: the same component, API
 * (/api/conversations/[contactId]) and send routes the inbox uses, so the
 * two surfaces can't drift. This replaced the former SMS / WhatsApp thread
 * cards and the profile header's Email / SMS dialogs.
 */
export function ContactConversationsPanel({ contact }: { contact: Contact }) {
  return (
    <div className="flex h-[min(78dvh,760px)] min-h-[480px] min-w-0">
      <ActiveConversation contactId={contact.id} embedded />
    </div>
  );
}
