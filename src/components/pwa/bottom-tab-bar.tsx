"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FolderKanban,
  Home,
  Menu,
  MessagesSquare,
} from "lucide-react";
import { useUnreadConversationsCount } from "@/hooks/use-unread-conversations";
import { cn } from "@/lib/utils";

/**
 * Phone-only bottom tab bar (native-feel v1.2; destinations per the approved
 * Visual Direction 2 mobile nav, 2026-10-14). Thumb-reach navigation for the
 * daily loop — Home, Inbox (unread badge), Calendar, Projects — plus "More",
 * which opens the full sidebar menu (Contacts, Pipeline and everything else
 * live there). Renders only inside a sub-account (/sa/[id]/…): agency-level
 * pages keep the drawer alone. Hidden at md+ where the sidebar is
 * permanent.
 *
 * The pb-[env(safe-area-inset-bottom)] keeps the bar above the iPhone home
 * indicator when running installed (standalone).
 */

const TABS = [
  { path: "/dashboard", label: "Home", icon: Home },
  { path: "/conversations", label: "Inbox", icon: MessagesSquare, badge: true },
  { path: "/calendar", label: "Calendar", icon: CalendarDays },
  { path: "/projects", label: "Projects", icon: FolderKanban },
] as const;

export function BottomTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const unread = useUnreadConversationsCount();

  const match = pathname.match(/^\/sa\/([^/]+)/);
  if (!match) return null;
  const subRoot = `/sa/${match[1]}`;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="flex h-[var(--crm-mobile-tab-bar-h)] items-stretch">
        {TABS.map((tab) => {
          const href = `${subRoot}${tab.path}`;
          const active =
            tab.path === "/dashboard"
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname.startsWith(href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-1 select-none flex-col items-center justify-center gap-0.5 text-micro transition-colors active:opacity-60",
                active ? "font-semibold text-primary" : "font-medium text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                  active && "bg-tag-violet-bg",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {"badge" in tab && tab.badge && unread > 0 && (
                  <span className="absolute -top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold tabular-nums text-primary-foreground">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-label="More — open the full menu"
          className="flex min-w-0 flex-1 select-none flex-col items-center justify-center gap-0.5 text-micro font-medium text-muted-foreground transition-colors active:opacity-60"
        >
          <span className="flex h-7 w-11 items-center justify-center">
            <Menu className="size-5" aria-hidden="true" />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}
