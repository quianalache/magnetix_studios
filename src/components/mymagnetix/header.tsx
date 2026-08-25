"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Menu, X, Search, LogOut, ArrowLeftRight } from "lucide-react";
import { MyMagnetixSidebarNav } from "./sidebar-nav";
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
  const [menuOpen, setMenuOpen] = useState(false);
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
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#ECE9F5] bg-white/95 px-4 py-3.5 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        className="lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Search — coming soon"
          disabled
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#8A87A0] opacity-70"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        <NotificationBell attentionItems={attentionItems} initialUnreadCount={attentionItems.length + unreadNotificationCount} />
        <button
          type="button"
          disabled
          title="Messages — coming soon"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#B5B3AE] opacity-60"
        >
          <MessageCircle className="h-[18px] w-[18px]" />
        </button>

        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-[#F3F2EF]"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #A855F7, #5E2574)" }}
            >
              {primaryEmail[0]?.toUpperCase() ?? "?"}
            </span>
            <span className="hidden text-[13px] font-medium text-[#202124] sm:inline">
              {primaryEmail.split("@")[0]}
            </span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-56 rounded-xl border border-[#ECE9F5] bg-white p-1.5 shadow-lg">
              <p className="truncate px-2.5 py-2 text-[12px] text-[#909090]">{primaryEmail}</p>
              {hasStaffAccess && (
                <button
                  type="button"
                  onClick={handleSwitchToBusinessCenter}
                  disabled={switching}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[#202124] hover:bg-[#F3F2EF]"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  {switching ? "Switching..." : "Switch to Business Center"}
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[#202124] hover:bg-[#F3F2EF]"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="absolute left-0 right-0 top-full border-b border-[#ECE9F5] bg-white p-3 lg:hidden">
          <MyMagnetixSidebarNav />
        </div>
      )}
    </header>
  );
}
