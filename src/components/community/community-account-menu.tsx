"use client";

import Link from "next/link";
import {
  ChevronDown,
  Home,
  LogOut,
  MessagesSquare,
  UserRound,
} from "lucide-react";
import { MemberAvatar } from "./member-avatar";
import type { AuthorView } from "@/types/community";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Account-level escape hatch for the member-facing Community shell. The
 * bridge links derive the Person session from the signed member session;
 * they never accept a tenant, group, or entitlement from the browser.
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
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account navigation"
        className="flex items-center rounded-md p-1 hover:bg-[#F0F0F0]"
      >
        <MemberAvatar author={author} size={28} brand={brand} />
        <ChevronDown className="ml-0.5 hidden h-3.5 w-3.5 text-[#6B6875] md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {author.displayName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* prefetch={false} is load-bearing, not stylistic — these two
            targets are Route Handlers (/api/my/bridge-from-member), not
            pages. Next's default Link prefetch treats every href as a
            page and requests its RSC payload as soon as the link mounts
            (the moment this menu opens, before any click); a Route
            Handler's plain redirect Response isn't valid flight data, and
            the router throws trying to parse it — the exact client-side
            crash reported tapping this avatar. BackToMyMagnetixLink
            already carries this same fix for the identical link shape;
            this component (added later, restoring account navigation
            from Community) never got it. profileHref below is a real
            page route, so it keeps normal prefetching. */}
        <DropdownMenuItem render={<Link href={gatewayHref} prefetch={false} />}>
          <Home className="mr-2 h-4 w-4" /> Magnetix Home
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href={communitiesHref} prefetch={false} />}
        >
          <MessagesSquare className="mr-2 h-4 w-4" /> My Communities
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={profileHref} />}>
          <UserRound className="mr-2 h-4 w-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction} method="post">
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
