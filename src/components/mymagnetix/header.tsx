"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MessageCircle,
  Menu,
  X,
  Search,
  LogOut,
  ArrowLeftRight,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MyMagnetixSidebarNav } from "./sidebar-nav";
import { MyMagnetixIdentity } from "./identity";
import { NotificationBell, type BellAttentionItem } from "./notification-bell";

/**
 * MyMagnetix header — search treatment, notification bell (real: Notifications
 * V1 events + the pre-existing "Needs Your Attention" surface, both
 * server-computed, never a fabricated count — see NotificationBell), message
 * icon slot (stays an honest disabled placeholder — no unified messaging
 * exists yet), profile menu with logout and, only for a confirmed dual-role
 * person, a "Switch to Business Center" control. Also renders the mobile
 * nav drawer, reusing the exact same MyMagnetixSidebarNav the desktop
 * sidebar uses — one nav list, two places it's shown.
 */
export function MyMagnetixHeader({
  primaryEmail,
  hasStaffAccess,
  attentionItems = [],
  unreadNotificationCount = 0,
}: {
  primaryEmail: string;
  hasStaffAccess: boolean;
  attentionItems?: BellAttentionItem[];
  unreadNotificationCount?: number;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function handleLogout() {
    await fetch("/api/my/logout", { method: "POST" });
    window.location.href = "/my/login";
  }

  async function handleSwitchToBusinessCenter() {
    setSwitching(true);
    try {
      const res = await fetch("/api/my/bridge-from-staff", { method: "POST" });
      // This only works if a Firebase staff session is ALSO active in this
      // browser (the bridge route requires it) — if not, send them to the
      // normal staff login instead of showing a dead end.
      if (res.status === 401) {
        router.push("/login?redirect=/dashboard");
        return;
      }
      router.push("/dashboard");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        id="mymagnetix-mobile-menu-button"
        className="-ml-2 lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X /> : <Menu />}
      </Button>
      <MyMagnetixIdentity size={26} className="lg:hidden" />

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {/* Search and Messages don't exist yet — honest disabled slots. */}
        <Button type="button" variant="ghost" size="icon" disabled title="Search — coming soon" aria-label="Search (coming soon)" className="max-sm:hidden">
          <Search />
        </Button>
        <NotificationBell
          attentionItems={attentionItems}
          initialUnreadCount={attentionItems.length + unreadNotificationCount}
        />
        <Button type="button" variant="ghost" size="icon" disabled title="Messages — coming soon" aria-label="Messages (coming soon)" className="max-sm:hidden">
          <MessageCircle />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" className="ml-1 h-10 gap-2 rounded-full px-1 sm:pr-2.5" aria-label="Account menu" />}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-body-sm font-semibold text-primary-foreground">
              {primaryEmail[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="hidden max-w-40 truncate text-body-sm font-medium text-foreground sm:inline">{primaryEmail.split("@")[0]}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <p className="truncate px-2 py-1.5 text-caption text-muted-foreground">{primaryEmail}</p>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/my/settings" />}>
              <Settings />
              Settings
            </DropdownMenuItem>
            {hasStaffAccess && (
              <DropdownMenuItem onClick={handleSwitchToBusinessCenter} disabled={switching}>
                <ArrowLeftRight />
                {switching ? "Switching…" : "Switch to Business Center"}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {mobileOpen && (
        <div className="absolute top-full right-0 left-0 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-card p-3 shadow-pop lg:hidden">
          <MyMagnetixSidebarNav onNavigate={() => setMobileOpen(false)} />
        </div>
      )}
    </header>
  );
}
