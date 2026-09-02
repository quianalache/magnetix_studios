"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The only chrome this route group adds beyond CommunityShell itself: an
 * explicit "Back to Communities" control (real user QA, 2026-09-02 — this
 * route no longer inherits the CRM dashboard's Sidebar/Header, so it can't
 * rely on those, or on browser Back, to get a staff visitor out) plus the
 * same bfcache-reload safety effect `(dashboard)/layout.tsx` already has.
 *
 * The bfcache effect matters here for the same reason it matters there:
 * after a hard redirect to /login, pressing Back can restore this page
 * from the browser's bfcache — an in-memory snapshot of the authenticated
 * view exactly as it looked a moment ago — with no new network request,
 * so middleware never gets a chance to re-check the (now-cleared) session
 * cookie. Duplicated rather than shared because this route group has no
 * import path back to a `"use client"` component living inside
 * `(dashboard)` — same reasoning as this group's `layout.tsx` duplicating
 * SubAccountProvider/BillingGuard instead of sharing them.
 */
export function CommunityImmersiveChrome({
  subAccountId,
  children,
}: {
  subAccountId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    // bg-background (a theme token, not a hardcoded color) so this strip
    // never seams against CommunityShell's own bg-background wrapper below
    // it in either light or dark mode.
    <div className="bg-background min-h-dvh">
      <div className="px-4 pt-3 sm:px-6 lg:px-8">
        <Link
          href={`/sa/${subAccountId}/community`}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#6B7280] transition-colors hover:text-[#111827]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Communities
        </Link>
      </div>
      {children}
    </div>
  );
}
