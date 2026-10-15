"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Mail, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill, Tag } from "@/components/system/status-pill";
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
    <div className="flex shrink-0 items-center gap-1 border-b border-border pr-1 pl-3">
      {(["contact", "channels", "activity"] as const).map(item => <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)} className={cn("-mb-px min-h-11 flex-1 border-b-2 px-1 text-caption font-medium capitalize transition-colors", tab === item ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{item}</button>)}
      <Button aria-label="Hide contact details" variant="ghost" size="icon" className="size-10" onClick={onClose}><X className="size-4" /></Button>
    </div>
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      {tab === "contact" && <section aria-label="Contact summary" className="space-y-4"><div className="flex items-center gap-3"><ContactInitials name={contact.name || "?"} large /><div className="min-w-0"><h3 className="text-section font-semibold break-words text-foreground">{contact.name || "Unnamed contact"}</h3>{contact.phone && <p className="mt-1.5 flex items-start gap-1.5 text-caption break-all text-muted-foreground"><Phone className="mt-0.5 size-3 shrink-0" aria-hidden="true" />{contact.phone}</p>}{contact.email && <p className="mt-1 flex items-start gap-1.5 text-caption break-all text-muted-foreground"><Mail className="mt-0.5 size-3 shrink-0" aria-hidden="true" />{contact.email}</p>}</div></div>
      {contact.tags?.length ? <div className="flex flex-wrap gap-1.5">{contact.tags.map(tag => <Tag key={tag} color="gray" className="max-w-full truncate">{tag}</Tag>)}</div> : null}
      <Button variant="outline" className="w-full" render={<Link href={saPath("/contacts/" + contact.id)} target="_blank" rel="noopener noreferrer" />}><ExternalLink className="size-4" />View Contact<span className="sr-only"> (opens in a new tab)</span></Button>
      {contact.metaUserId && <LinkContactButton contact={contact} conversationContext />}
      </section>}
      {tab === "channels" && <section aria-label="Contact channels" className="space-y-3"><h3 className="text-section font-semibold">Channels</h3>{availability.length ? <ul className="divide-y divide-border-subtle overflow-hidden rounded-control border border-border">{availability.map(item => <li key={item.channel} className="space-y-1.5 p-3"><div className="flex items-center justify-between gap-2"><ChannelBadge channel={item.channel} /><StatusPill tone={item.available ? "success" : "neutral"}>{item.available ? "Available" : "Unavailable"}</StatusPill></div><p className="text-caption break-all text-foreground">{item.channel === "email" ? contact.email || "No email address" : item.channel === "sms" || item.channel === "whatsapp" ? contact.phone || "No phone number" : contact.metaUserId ? "Linked messaging identity" : "No linked identity"}</p><p className="text-caption text-muted-foreground">{item.available ? item.notice || "Available to reply" : item.reason || "Unavailable"}</p></li>)}</ul> : <p className="text-caption text-muted-foreground">Checking connected channels…</p>}</section>}
      {tab === "activity" && <section aria-label="Recent activity" className="space-y-4"><h3 className="text-section font-semibold">Recent Activity</h3><ActivityTimeline contactId={contact.id} limit={20} /></section>}
    </div>
  </div>;
}
