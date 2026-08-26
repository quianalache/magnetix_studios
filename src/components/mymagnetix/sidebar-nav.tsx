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
export function MyMagnetixSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {MYMAGNETIX_NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon];
        if (item.disabled) {
          return (
            <div
              key={item.href}
              title="Coming soon"
              className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium text-[#B5B3C2]"
            >
              <Icon className="h-4 w-4" />
              {item.label}
              <span className="ml-auto text-[9.5px] font-semibold uppercase tracking-wide text-[#C7C4D6]">Soon</span>
            </div>
          );
        }
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "flex items-center gap-2.5 rounded-lg bg-[#5E2574] px-3 py-2 text-[13.5px] font-semibold text-white"
                : "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium text-[#5B5B62] transition-colors hover:bg-[#F3E4F0] hover:text-[#5E2574]"
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
