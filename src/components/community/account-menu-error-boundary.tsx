"use client";

import { Component, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import { reportCommunityClientError } from "@/lib/community/client-error-reporting";

/**
 * Narrow, temporary safety net around CommunityAccountMenu (2026-09-11
 * investigation) — NOT the fix for the reported crash, a containment
 * measure so real user QA reproducing it doesn't also lose the rest of the
 * Community page (this route has no error.tsx anywhere in its tree — see
 * the investigation report — so today a throw here takes down the whole
 * page with Next's generic "Application error").
 *
 * Only catches RENDER-phase errors (React error boundary contract). If the
 * real bug throws from an event handler or a router transition instead
 * (the historical Route-Handler-Link prefetch failure was exactly that
 * shape), this boundary never sees it — CommunityClientErrorReporter's
 * window-level listeners are what catch that class. Both funnel into the
 * same reportCommunityClientError so either way we get a report.
 *
 * Fallback deliberately does NOT reimplement Magnetix Home / My
 * Communities / Profile / Sign Out — those all depend on the same
 * member/session data that may be exactly what's malformed if this
 * boundary is tripping, so re-deriving them here risks duplicating (and
 * getting wrong) the auth logic those already-correct call sites own. It's
 * static: an unclickable avatar glyph + a tooltip, so the header layout
 * doesn't jump.
 */
export class AccountMenuErrorBoundary extends Component<
  { saId: string; groupId?: string; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    reportCommunityClientError(this.props.saId, this.props.groupId, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      action: "menu-open",
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center rounded-md p-1"
          title="Account menu unavailable — refresh to try again"
          aria-label="Account menu unavailable"
        >
          <UserRound className="h-[28px] w-[28px] text-[#6B6875]" />
        </div>
      );
    }
    return this.props.children;
  }
}
