"use client";

import {
  ChevronDown,
  Home,
  LogOut,
  MessagesSquare,
  UserRound,
} from "lucide-react";
import { MemberAvatar } from "./member-avatar";
import type { AuthorView } from "@/types/community";
import { setLastCommunityMenuAction } from "@/lib/community/client-error-reporting";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

/**
 * Account-level escape hatch for the member-facing Community shell. The
 * bridge links derive the Person session from the signed member session;
 * they never accept a tenant, group, or entitlement from the browser.
 *
 * 2026-09-11 investigation instrumentation: every interaction here calls
 * setLastCommunityMenuAction first, synchronously, before anything that
 * could throw — so if this crashes in a way that escapes React (an event
 * handler or router transition, not a render), CommunityClientErrorReporter
 * still knows which of avatar-click / menu-open / menu-item-click it was.
 * AccountMenuErrorBoundary (wrapping this in community-shell.tsx) covers
 * the other half: a genuine render-phase throw.
 */
export function CommunityAccountMenu({
  author,
  brand,
  profileHref,
  logoutAction,
}: {
  author: AuthorView;
  brand: string;
  profileHref: string;
  logoutAction: string;
}) {
  const gatewayHref = "/api/my/bridge-from-member?next=%2Fgateway";
  const communitiesHref = "/api/my/bridge-from-member?next=%2Fmy%2Fcommunities";

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setLastCommunityMenuAction("menu-open");
      }}
    >
      <DropdownMenuTrigger
        aria-label="Open account navigation"
        className="flex items-center rounded-md p-1 hover:bg-[#F0F0F0]"
        onClick={() => setLastCommunityMenuAction("avatar-click")}
      >
        <MemberAvatar author={author} size={28} brand={brand} />
        <ChevronDown className="ml-0.5 hidden h-3.5 w-3.5 text-[#6B6875] md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {author.displayName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Plain <a>, not next/link (2026-09-11 — see the investigation
            report): both targets are Route Handlers
            (/api/my/bridge-from-member), not pages, and a real browser
            navigation is the correct way to hit one — it never asks the
            App Router to parse the redirect response as an RSC/flight
            payload, unlike a Link (prefetch={false} alone was the
            2026-09-02 fix's theory, confirmed present but NOT sufficient —
            real user QA on a fresh reload still crashed). profileHref
            below is a real page route and keeps next/link. */}
        <DropdownMenuItem
          render={
            <a
              href={gatewayHref}
              onClick={() =>
                setLastCommunityMenuAction("menu-item-click", gatewayHref)
              }
            />
          }
        >
          <Home className="mr-2 h-4 w-4" /> Magnetix Home
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <a
              href={communitiesHref}
              onClick={() =>
                setLastCommunityMenuAction("menu-item-click", communitiesHref)
              }
            />
          }
        >
          <MessagesSquare className="mr-2 h-4 w-4" /> My Communities
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link
              href={profileHref}
              onClick={() =>
                setLastCommunityMenuAction("menu-item-click", profileHref)
              }
            />
          }
        >
          <UserRound className="mr-2 h-4 w-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form
          action={logoutAction}
          method="post"
          onSubmit={() =>
            setLastCommunityMenuAction("menu-item-click", logoutAction)
          }
        >
          <button
            type="submit"
            className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden"
          >
            <LogOut className="mr-2 h-4 w-4" /> Log out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
