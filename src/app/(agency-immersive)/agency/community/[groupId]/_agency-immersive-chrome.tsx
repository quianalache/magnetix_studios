"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Agency Community's immersive chrome (2026-09-16) — the Agency-scope
 * sibling of `(immersive)/sa/[subAccountId]/community/[groupId]/
 * _immersive-chrome.tsx`. Same reasoning: this route group has no
 * Sidebar/Header from `(dashboard)`, so it needs its own explicit way back
 * plus the same bfcache-reload safety effect. Deliberately simpler than
 * the tenant version — no live-room full-bleed exception (agency
 * communities don't have live rooms yet).
 */
export function AgencyImmersiveChrome({ children }: { children: ReactNode }) {
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <div className="bg-background min-h-dvh">
      <div className="px-4 pt-3 sm:px-6 lg:px-8">
        <Link
          href="/agency/community"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#6B7280] transition-colors hover:text-[#111827]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Agency Community
        </Link>
      </div>
      {children}
    </div>
  );
}
