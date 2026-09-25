"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, MessagesSquare } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ContactMessagesThread } from "@/components/contacts/contact-messages-thread";
import { ContactWhatsappThread } from "@/components/contacts/contact-whatsapp-thread";
import type { Contact } from "@/types/contacts";

/**
 * Contact profile → Conversations tab (Contacts redesign, 2026-09-25).
 *
 * INTERIM — DEPENDENCY ON THE CONVERSATIONS REDESIGN (codex/conversations-
 * redesign, not yet integrated). The approved design embeds the finished
 * Conversations experience here (merged multi-channel thread, channel
 * availability, composer, AI controls, internal notes). Building that
 * against the in-progress branch was explicitly ruled out, so until it
 * lands this tab reuses the SMS + WhatsApp thread components the contact
 * profile ALREADY had (same records, same send routes — nothing new), plus
 * a link into the full Conversations inbox for email / Messenger /
 * Instagram. After integration: replace the body with the Conversations
 * workspace thread + composer and drop the header Email/SMS dialogs.
 */
export function ContactConversationsPanel({ contact }: { contact: Contact }) {
  const { subAccount, saPath } = useSubAccount();
  // Same gating the profile used for these two cards.
  const showSms = !!subAccount?.twilioConfig?.enabled;
  const showWhatsapp =
    !!subAccount?.twilioConfig?.whatsappFromNumber &&
    subAccount?.whatsappEnabledByAgency === true;
  const channels = [
    ...(showSms ? (["sms"] as const) : []),
    ...(showWhatsapp ? (["whatsapp"] as const) : []),
  ];
  const [channel, setChannel] = useState<"sms" | "whatsapp">(channels[0] ?? "sms");
  const active = channels.includes(channel) ? channel : channels[0];
  const inboxHref = saPath(`/conversations/${contact.id}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {channels.length > 1 ? (
          <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 text-xs" role="tablist" aria-label="Channel">
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active === c}
                onClick={() => setChannel(c)}
                className={cn(
                  "rounded-md px-3 py-1 font-medium transition-colors",
                  active === c
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c === "sms" ? "SMS" : "WhatsApp"}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Button
          render={<Link href={inboxHref} />}
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
        >
          Open in Conversations
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      {active === "sms" && <ContactMessagesThread contact={contact} />}
      {active === "whatsapp" && <ContactWhatsappThread contact={contact} />}

      {channels.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
          <MessagesSquare className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No two-way messaging channel here yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Use Email or SMS above to reach this contact, or open the full
            conversation to see email, Messenger and Instagram history.
          </p>
          <Button render={<Link href={inboxHref} />} variant="outline" size="sm" className="mt-3">
            Open in Conversations
          </Button>
        </div>
      )}
    </div>
  );
}
