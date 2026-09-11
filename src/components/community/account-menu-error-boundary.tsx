"use client";

import { Component, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import { reportCommunityClientError } from "@/lib/community/client-error-reporting";

/**
 * Narrow safety net around CommunityAccountMenu (2026-09-11). The actual
 * bug it was added to contain — DropdownMenuLabel/Menu.GroupLabel thrown
 * outside a <Menu.Group> — is now fixed in CommunityAccountMenu itself
 * (see that file's doc comment); this boundary should no longer trip for
 * that case. Kept anyway, deliberately, as ongoing defense-in-depth: this
 * route has no error.tsx anywhere in its tree (see the investigation
 * report), so without this, ANY future throw in the account menu — a
 * regression, a new menu item, a future Base UI upgrade — takes down the
 * entire Community page with Next's bare generic "Application error"
 * instead of just losing the one non-critical dropdown.
 *
 * Only catches RENDER-phase errors (React error boundary contract). If a
 * future bug throws from an event handler or a router transition instead
 * (the historical Route-Handler-Link prefetch failure was exactly that
 * shape), this boundary won't see it — CommunityClientErrorReporter's
 * window-level listeners are what catch that class. Both funnel into the
 * same reportCommunityClientError so either way it gets reported.
 *
 * Fallback deliberately does NOT reimplement Magnetix Home / My
 * Communities / Profile / Sign Out — those all depend on the same
 * member/session data that may be exactly what's malformed if this trips,
 * so re-deriving them here risks duplicating (and getting wrong) the auth
 * logic those already-correct call sites own. It IS a real, if minimal,
 * recovery action rather than a dead end: clicking it reloads the page,
 * which is enough to get back a working, non-erroring menu after a
 * transient failure without asking this boundary to know anything about
 * auth.
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
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center rounded-md p-1 hover:bg-[#F0F0F0]"
          title="Account menu hit an error — click to reload"
          aria-label="Account menu unavailable — click to reload"
        >
          <UserRound className="h-[28px] w-[28px] text-[#6B6875]" />
        </button>
      );
    }
    return this.props.children;
  }
}
