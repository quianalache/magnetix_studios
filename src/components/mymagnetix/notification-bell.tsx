"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mirrors NotificationDoc (types/notifications.ts) — only the fields the
 *  panel actually renders, kept as a local shape so this file has zero
 *  server-only imports (it's a Client Component). */
export interface BellNotification {
  id: string;
  title: string;
  message: string | null;
  destination: string;
  readAt: string | null;
  createdAt: string;
  meta: { businessName?: string; communityName?: string; courseName?: string; actorName?: string };
}

/** Mirrors mymagnetix-service.ts's AttentionItem — the pre-existing "Needs
 *  Your Attention" surface (project due dates, open invoices), kept as its
 *  own section rather than force-merged into one chronological list with
 *  real notifications (attention items have no createdAt to sort by at
 *  all). "Use THAT bell" + "keep the existing empty concept" — this is the
 *  same bell, same empty copy, extended with a new Notifications section
 *  on top, not a replacement. */
export interface BellAttentionItem {
  id: string;
  title: string;
  detail: string;
  businessName: string;
  enterHref: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell({
  attentionItems,
  initialUnreadCount,
}: {
  attentionItems: BellAttentionItem[];
  initialUnreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<BellNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const notificationUnread = notifications.filter((n) => !n.readAt).length;
  const totalUnread = notificationUnread + attentionItems.length;

  useEffect(() => setUnreadCount(totalUnread), [totalUnread]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/my/notifications");
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: BellNotification[] };
      setNotifications(data.notifications ?? []);
      setLoaded(true);
    } catch {
      // transient — the panel just stays showing whatever it had (or empty)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded) void loadNotifications();
  }, [open, loaded, loadNotifications]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  async function handleNotificationClick(n: BellNotification) {
    // Navigate immediately — never delay on the cosmetic read-state update.
    setOpen(false);
    if (!n.readAt) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      void fetch(`/api/my/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    }
    router.push(n.destination);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    try {
      await fetch("/api/my/notifications/mark-all-read", { method: "POST" });
    } catch {
      // best-effort — a failed mark-all just leaves those rows still
      // "unread" on the server; the next open reconciles from a fresh fetch
    } finally {
      setMarkingAll(false);
    }
  }

  const isEmpty = notifications.length === 0 && attentionItems.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={unreadCount > 0 ? `${unreadCount} item${unreadCount === 1 ? "" : "s"} need attention` : "Nothing needs attention right now"}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-overline font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "z-30 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card shadow-lg",
            // Desktop: anchored dropdown under the bell. Mobile (<640px):
            // fixed, viewport-clamped panel so it can never overflow
            // horizontally regardless of the bell's own position.
            "fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[380px]",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
            <span className="text-body font-semibold text-foreground">Notifications</span>
            <div className="flex items-center gap-1">
              {notificationUnread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markingAll}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-caption font-medium text-tag-violet-fg hover:bg-muted disabled:opacity-60"
                >
                  {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted sm:hidden"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading && !loaded ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isEmpty ? (
            <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">Nothing needs attention right now.</p>
          ) : (
            <>
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-border px-3.5 py-3 text-left hover:bg-muted",
                    !n.readAt && "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-primary",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-body-sm leading-snug", n.readAt ? "text-foreground" : "font-semibold text-foreground")}>
                      {n.title}
                    </span>
                    <span className="mt-0.5 block text-caption text-muted-foreground">
                      {(n.meta.communityName || n.meta.courseName || n.meta.businessName) ?? ""}
                      {(n.meta.communityName || n.meta.courseName || n.meta.businessName) ? " • " : ""}
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))}

              {attentionItems.length > 0 && (
                <>
                  <p className="border-b border-border bg-muted px-3.5 py-2 text-micro font-semibold uppercase tracking-wide text-muted-foreground">
                    Needs attention
                  </p>
                  {attentionItems.map((item) => (
                    <a
                      key={item.id}
                      href={item.enterHref}
                      className="flex w-full items-start gap-2.5 border-b border-border px-3.5 py-3 text-left last:border-b-0 hover:bg-muted"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-sm font-medium leading-snug text-foreground">{item.title}</span>
                        <span className="mt-0.5 block text-caption text-muted-foreground">
                          {item.businessName} • {item.detail}
                        </span>
                      </span>
                    </a>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
