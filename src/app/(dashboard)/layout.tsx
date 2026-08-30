"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { CommandPalette } from "@/components/search/command-palette";
import { InstallBanner } from "@/components/pwa/install-banner";
import { BottomTabBar } from "@/components/pwa/bottom-tab-bar";
import { AppBadge } from "@/components/pwa/app-badge";
import { AppAccent } from "@/components/theme/app-accent";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();
  // The bottom tab bar only renders inside a sub-account — reserve space
  // for it (it's position:fixed, so it doesn't push content itself).
  const hasTabBar = /^\/sa\//.test(pathname);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 2026-08-30 sign-out UX fix: after a hard redirect to /login, pressing
  // Back can restore THIS page from the browser's bfcache — an in-memory
  // snapshot of the authenticated shell exactly as it looked a moment
  // ago, shown instantly with no new network request, so middleware
  // never gets a chance to re-check the (now-cleared) session cookie.
  // `pageshow`'s `persisted` flag is true only for a bfcache restore
  // (never a normal load), so this can't affect ordinary navigation —
  // forcing a real reload here always re-runs middleware fresh, which
  // correctly bounces to /login if the session is genuinely gone, or
  // just shows the same dashboard again if it isn't (e.g. Back after
  // ordinary browsing, not a sign-out).
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    // h-dvh (not h-screen): 100vh overshoots when mobile browser toolbars
    // or the on-screen keyboard are up, hiding bottom-anchored UI like the
    // conversations composer. Dynamic viewport units track the real height.
    <div className="flex h-dvh">
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <InstallBanner />
        <main
          className={cn(
            "flex-1 overflow-y-auto p-4 md:p-6",
            hasTabBar && "pb-24 md:pb-6",
          )}
        >
          {children}
        </main>
      </div>
      <BottomTabBar onMore={() => setSidebarOpen(true)} />
      <AppBadge />
      <AppAccent />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
