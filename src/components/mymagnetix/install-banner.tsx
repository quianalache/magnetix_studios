"use client";

import { ArrowUpFromDot, Download, X } from "lucide-react";
import { usePwaInstallState } from "@/hooks/use-pwa-install-state";

/**
 * MyMagnetix's own mobile install prompt (2026-09-01) — same reused
 * device-detection/dismiss/install-state logic as the CRM's `InstallBanner`
 * (src/components/pwa/install-banner.tsx), via the shared
 * `usePwaInstallState` hook, adapted with member-facing copy and a
 * separate dismiss key (installing/dismissing one app is independent of
 * the other — different manifest, different start_url; see
 * src/app/my/manifest.webmanifest/route.ts, start_url "/my"). Mounted
 * once in the MyMagnetix (app) shell layout so it appears consistently
 * across every /my/* page without being duplicated per-page.
 *
 * The md:hidden wrapper keeps it phone-only, matching the CRM banner.
 */

const DISMISS_KEY = "mymagnetix-install-banner-dismissed";

export function MyMagnetixInstallBanner() {
  const { mode, dismiss, install } = usePwaInstallState(DISMISS_KEY);

  if (mode === "hidden") return null;

  return (
    <div className="border-b border-[#ECE9F5] bg-white px-4 py-2.5 md:hidden">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: "linear-gradient(135deg, #A855F7, #5E2574)" }}
        >
          {mode === "android" ? (
            <Download className="h-3.5 w-3.5" />
          ) : (
            <ArrowUpFromDot className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1 text-xs">
          {mode === "android" ? (
            <>
              <p className="font-medium text-[#202124]">
                Add MyMagnetix to your home screen
              </p>
              <p className="mt-0.5 text-[#909090]">
                Quick access to your communities, courses, bookings, and
                purchases.{" "}
                <button
                  onClick={() => void install()}
                  className="font-medium text-[#5E2574] underline-offset-2 hover:underline"
                >
                  Install now
                </button>
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-[#202124]">
                Add MyMagnetix to your home screen
              </p>
              <p className="mt-0.5 text-[#909090]">
                Quick access to your communities, courses, bookings, and
                purchases: tap Safari&apos;s{" "}
                <span className="font-medium">Share</span> button, then{" "}
                <span className="font-medium">Add to Home Screen</span>.
              </p>
            </>
          )}
        </div>
        <button
          onClick={dismiss}
          className="rounded p-1 text-[#909090] hover:bg-[#F5F4FB] hover:text-[#202124]"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
