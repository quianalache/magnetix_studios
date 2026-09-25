"use client";

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConversationDoc } from "@/types/conversations";
import { ChannelBadge, ContactInitials } from "./channel-badge";

export function ConversationList({ conversations, basePath, selectedId, filtered = false }: {
  conversations: ConversationDoc[]; basePath: string; selectedId?: string; filtered?: boolean;
}) {
  if (!conversations.length) return <div className="px-5 py-12 text-center text-sm text-muted-foreground"><MessagesSquare className="mx-auto mb-3 size-7" /><p>{filtered ? "No conversations match these filters." : "No conversations yet."}</p><p className="mt-2 text-xs">{filtered ? "Try another search or channel." : "Messages from your connected channels appear here."}</p></div>;
  return <div className="space-y-1 p-2">{conversations.map(c => {
    const name = c.contactName || c.contactPhone || "Unnamed contact";
    const date = toDate(c.lastMessageAt);
    return <Link key={c.id} href={basePath + "/" + c.contactId} scroll={false} aria-current={selectedId === c.contactId ? "page" : undefined} className={cn("flex min-h-20 gap-3 rounded-xl px-3 py-3 outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary", selectedId === c.contactId && "bg-primary/10")}>
      <ContactInitials name={name} />
      <div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><span className={cn("truncate text-sm", c.unreadCount ? "font-bold" : "font-semibold")}>{name}</span><time dateTime={date?.toISOString()} className="shrink-0 text-[10px] text-muted-foreground">{date ? date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</time></div>
      <p className="my-0.5 truncate text-xs text-muted-foreground">{c.lastDirection === "outbound" ? "You: " : ""}{c.lastMessagePreview}</p>
      <div className="flex items-center justify-between gap-1"><ChannelBadge channel={c.lastChannel} /><span className="flex items-center gap-1">{c.status !== "open" && <span className="text-[10px] capitalize text-muted-foreground">{c.status}</span>}{c.pendingDraft && <span className="text-[10px] text-amber-700">Draft</span>}{c.unreadCount > 0 && <span aria-label={c.unreadCount + " unread messages"} className="min-w-5 rounded-full bg-pink-600 px-1 text-center text-xs font-semibold text-white">{c.unreadCount}</span>}</span></div></div>
    </Link>;
  })}</div>;
}
