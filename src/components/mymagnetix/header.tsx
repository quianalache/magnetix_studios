"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  MessageCircle,
  Menu,
  X,
  Search,
  LogOut,
  ArrowLeftRight,
  Home,
  BookOpen,
  MessagesSquare,
} from "lucide-react";

// Defined locally (not received as a prop) — icon COMPONENT REFERENCES are
// functions, which cannot cross the Server -> Client boundary as props.
// Keep hrefs/labels in sync with (app)/layout.tsx's own sidebar nav.
const NAV_ITEMS = [
  { href: "/my", label: "Home", icon: Home },
  { href: "/my/courses", label: "My Courses", icon: BookOpen },
  { href: "/my/communities", label: "My Communities", icon: MessagesSquare },
];

/**
 * MyMagnetix header — search treatment, notification/message icon slots
 * (both honest disabled placeholders, per Part 18: no unified
 * Notifications/Messaging exists yet, so these must never fake an unread
 * count), profile menu with logout and, only for a confirmed dual-role
 * person, a "Switch to Business Center" control. Also renders the mobile
 * nav drawer (the sidebar in the layout is lg+ only).
 */
export function MyMagnetixHeader({
  primaryEmail,
  hasStaffAccess,
}: {
  primaryEmail: string;
  hasStaffAccess: boolean;
}) {
  const pathname = usePathname();
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
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#E4E4E4] bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        className="lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div className="hidden flex-1 items-center gap-2 rounded-lg bg-[#F3F2EF] px-3 py-2 text-[13px] text-[#909090] sm:flex sm:max-w-xs">
        <Search className="h-4 w-4" />
        <span>Search MyMagnetix</span>
      </div>
      <div className="flex-1 sm:hidden" />

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled
          title="Notifications — coming soon"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#B5B3AE] opacity-60"
        >
          <Bell className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          disabled
          title="Messages — coming soon"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#B5B3AE] opacity-60"
        >
          <MessageCircle className="h-[18px] w-[18px]" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{ background: "#5E2574" }}
          >
            {primaryEmail[0]?.toUpperCase() ?? "?"}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-56 rounded-xl border border-[#E4E4E4] bg-white p-1.5 shadow-lg">
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
        <nav className="absolute left-0 right-0 top-full flex flex-col gap-0.5 border-b border-[#E4E4E4] bg-white p-3 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium ${
                pathname === item.href ? "bg-[#F3E4F0] text-[#5E2574]" : "text-[#5B5B62]"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
