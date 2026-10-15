"use client";

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill, Tag } from "@/components/system/status-pill";
import type { ConversationDoc } from "@/types/conversations";
import { ChannelBadge, ContactInitials } from "./channel-badge";

/**
 * Inbox list (Wave 3): compact rows built for scanning — initials, name,
 * preview, channel, time. Unread = bold name + plum count; the selected
 * thread gets a subtle violet tint with a plum edge. No pastel cards.
 */
export function ConversationList({ conversations, basePath, selectedId, filtered = false }: {
  conversations: ConversationDoc[]; basePath: string; selectedId?: string; filtered?: boolean;
}) {
  if (!conversations.length) {
    return (
      <div className="p-3">
        <EmptyState
          compact
          icon={MessagesSquare}
          title={filtered ? "No conversations match these filters" : "No conversations yet"}
          description={filtered ? "Try another search or channel." : "Messages from your connected channels appear here."}
        />
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle">
      {conversations.map(c => {
        const name = c.contactName || c.contactPhone || "Unnamed contact";
        const date = toDate(c.lastMessageAt);
        const selected = selectedId === c.contactId;
        const unread = c.unreadCount > 0;
        return (
          <li key={c.id}>
            <Link
              href={basePath + "/" + c.contactId}
              scroll={false}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "relative flex min-h-16 gap-3 px-4 py-3 outline-none transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                selected && "bg-tint-violet hover:bg-tint-violet before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary before:content-['']",
              )}
            >
              <ContactInitials name={name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-body-sm text-foreground", unread ? "font-bold" : "font-semibold")}>{name}</span>
                  <time dateTime={date?.toISOString()} className={cn("shrink-0 text-micro", unread ? "font-semibold text-foreground" : "text-ink-tertiary")}>
                    {date ? date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                  </time>
                </div>
                <p className={cn("my-0.5 truncate text-caption", unread ? "text-foreground" : "text-muted-foreground")}>
                  {c.lastDirection === "outbound" ? "You: " : ""}{c.lastMessagePreview}
                </p>
                <div className="flex items-center justify-between gap-1.5">
                  <ChannelBadge channel={c.lastChannel} />
                  <span className="flex items-center gap-1.5">
                    {c.status !== "open" && <StatusPill tone="neutral" className="py-0 text-micro capitalize">{c.status}</StatusPill>}
                    {c.pendingDraft && <Tag color="gold" className="px-1.5 py-0 text-micro">Draft</Tag>}
                    {unread && (
                      <span aria-label={c.unreadCount + " unread messages"} className="min-w-5 rounded-full bg-primary px-1.5 text-center text-micro leading-5 font-semibold text-primary-foreground">
                        {c.unreadCount}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
