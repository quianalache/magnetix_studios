"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BookOpen,
  MessagesSquare,
  MessageCircle,
  FolderKanban,
  LayoutGrid,
  Receipt,
  Bookmark,
  Sparkles,
} from "lucide-react";
import { MYMAGNETIX_NAV_ITEMS, type MyMagnetixNavItem } from "@/lib/mymagnetix/nav";

const ICONS: Record<MyMagnetixNavItem["icon"], typeof Home> = {
  home: Home,
  courses: BookOpen,
  communities: MessagesSquare,
  messages: MessageCircle,
  projects: FolderKanban,
  spaces: LayoutGrid,
  purchases: Receipt,
  saved: Bookmark,
  readings: Sparkles,
};

/** Client component so it can highlight the active item via usePathname — a Server Component layout has no reliable equivalent. */
export function MyMagnetixSidebarNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();

  return (
    <nav id="mymagnetix-sidebar-nav" className="flex flex-1 flex-col gap-0.5">
      {MYMAGNETIX_NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        if (item.disabled) {
          return (
            <div
              key={item.href}
              title="Coming soon"
              className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm font-medium text-ink-tertiary"
            >
              <Icon className="h-4 w-4" />
              {item.label}
              <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-overline font-semibold uppercase tracking-wide text-ink-tertiary">Soon</span>
            </div>
          );
        }
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex items-center gap-2.5 rounded-lg bg-selected px-3 py-2 text-body-sm font-semibold text-selected-foreground"
                : "flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
