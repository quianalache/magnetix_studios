"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Mail, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubAccount } from "@/context/sub-account-context";
import { ActivityTimeline } from "@/components/contacts/activity-timeline";
import { LinkContactButton } from "@/components/contacts/link-contact-button";
import { ContactInitials, ChannelBadge } from "./channel-badge";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contacts";
import type { ChannelAvailability } from "./conversation-workspace";

export function ConversationContactPanel({ contact, availability, onClose }: {
  contact: Contact; availability: ChannelAvailability[]; onClose: () => void;
}) {
  const { saPath } = useSubAccount();
  const [tab, setTab] = useState<"contact" | "channels" | "activity">("contact");
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 items-center border-b px-3 pt-2">
      {(["contact", "channels", "activity"] as const).map(item => <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)} className={cn("min-h-11 flex-1 border-b-2 px-1 text-xs font-medium capitalize", tab === item ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>{item}</button>)}
      <Button aria-label="Hide contact details" variant="ghost" size="icon" className="size-10" onClick={onClose}><X className="size-4" /></Button>
    </div>
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      {tab === "contact" && <section aria-label="Contact summary" className="space-y-4"><div className="flex items-center gap-3"><ContactInitials name={contact.name || "?"} large /><div className="min-w-0"><h3 className="break-words font-semibold">{contact.name || "Unnamed contact"}</h3>{contact.phone && <p className="mt-2 flex items-start gap-1.5 break-all text-xs text-muted-foreground"><Phone className="size-3 shrink-0" />{contact.phone}</p>}{contact.email && <p className="mt-1 flex items-start gap-1.5 break-all text-xs text-muted-foreground"><Mail className="size-3 shrink-0" />{contact.email}</p>}</div></div>
      <div className="flex flex-wrap gap-1.5">{contact.tags?.map(tag => <Badge key={tag} variant="secondary" className="rounded-full bg-primary/10 text-primary">{tag}</Badge>)}</div>
      <Button className="min-h-11 w-full" render={<Link href={saPath("/contacts/" + contact.id)} target="_blank" rel="noopener noreferrer" />}><ExternalLink className="mr-2 size-4" />View Contact<span className="sr-only"> (opens in a new tab)</span></Button>
      {contact.metaUserId && <LinkContactButton contact={contact} conversationContext />}
      </section>}
      {(tab === "contact" || tab === "channels") && <section aria-label="Contact channels" className="space-y-3 border-t pt-4"><h3 className="text-sm font-semibold">Channels</h3>{availability.length ? availability.map(item => <div key={item.channel} className="space-y-1.5 rounded-xl border border-border/60 p-3"><ChannelBadge channel={item.channel} /><p className="break-all text-xs">{item.channel === "email" ? contact.email || "No email address" : item.channel === "sms" || item.channel === "whatsapp" ? contact.phone || "No phone number" : contact.metaUserId ? "Linked messaging identity" : "No linked identity"}</p><p className={cn("text-xs", item.available ? "text-muted-foreground" : "text-muted-foreground")}>{item.available ? item.notice || "Available to reply" : item.reason || "Unavailable"}</p></div>) : <p className="text-xs text-muted-foreground">Checking connected channels…</p>}</section>}
      {(tab === "contact" || tab === "activity") && <section aria-label="Recent activity" className="space-y-4 border-t pt-4"><h3 className="text-sm font-semibold">Recent Activity</h3><ActivityTimeline contactId={contact.id} limit={tab === "contact" ? 5 : 20} /></section>}
    </div>
  </div>;
}
