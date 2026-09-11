"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2, MessagesSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  communityHomeHref,
  communityCrossTenantSwitchHref,
  type CommunityLinkBase,
} from "@/lib/community/routes";

interface SwitcherCommunity {
  subAccountId: string;
  groupId: string;
  slug: string;
  name: string;
  /** Same field the About page/Settings live preview already render as
   *  this community's brand mark (`CommunityGroup.logoUrl`). Null when
   *  unset — the row falls back to the generic icon. */
  logoUrl: string | null;
  /** Opaque `/c/{saId}/{slug}/community` — see communityCrossTenantSwitchHref's
   *  doc comment for why this must stay opaque. */
  href: string;
}

/** A switcher row's left-side icon: the community's real logo when one is
 *  configured and loads successfully, the existing generic icon otherwise
 *  (missing URL, or a broken one — `onError` swaps to the fallback instead
 *  of leaving the browser's broken-image glyph showing). Same 24px rounded
 *  container either way, so rows never shift height/width based on which
 *  branch renders. */
function SwitcherRowIcon({ logoUrl }: { logoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="h-6 w-6 shrink-0 rounded-md object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#F0F0F0] text-[#6B6875]">
      <MessagesSquare className="h-3.5 w-3.5" />
    </span>
  );
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; communities: SwitcherCommunity[] }
  | { status: "error" };

/**
 * Turns the active Community's name (top-left of the persistent Community
 * header) into a fast switcher — the member's other accessible Communities,
 * one click into any of them, no required detour through My Communities.
 * Member-facing only: rendered from community-shell.tsx only in the
 * non-staff branch (a plain `<Link>` to About stays the staff header's
 * community-name control) — staff's bridged Member identity technically
 * has SOME community memberships too, but exposing "communities this staff
 * person personally belongs to" in the CRM staff view isn't the right
 * identity context for that surface, so it's deliberately left out there.
 *
 * List source: GET /api/community/{saId}/switcher-communities, which reuses
 * the exact same canonical functions "My Communities"
 * (`app/my/(app)/communities/page.tsx`) already calls
 * (`listPersonMemberships` + `listCommunitiesForPerson`,
 * mymagnetix-service.ts) — not a second membership index. Fetched lazily
 * on first open, not on every header render.
 *
 * No search: at most a handful of communities per person today (confirmed
 * via the same source this reads), and Base UI's Menu already scrolls a
 * long list via `max-h-(--available-height)` if that ever changes —
 * revisit only if a real member's list gets long enough to need it.
 */
export function CommunitySwitcher({
  saId,
  pretty,
  currentGroupId,
  currentGroupName,
}: {
  saId: string;
  pretty: boolean;
  currentGroupId: string;
  currentGroupName: string;
}) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const linkBase: CommunityLinkBase = { saId, pretty };
  // Not a string literal in the JSX below on purpose: eslint's
  // no-html-link-for-pages rule can't tell a Route Handler from a page, so
  // it flags any literal /api/* href on a plain <a> — a real false
  // positive here (this is the exact same bridge link the account menu
  // already uses for "My Communities"). Routing it through a variable is
  // enough for the rule's static check to skip it, matching that
  // precedent.
  const myCommunitiesHref =
    "/api/my/bridge-from-member?next=%2Fmy%2Fcommunities";

  function onOpenChange(open: boolean) {
    if (!open || state.status !== "idle") return;
    setState({ status: "loading" });
    fetch(`/api/community/${encodeURIComponent(saId)}/switcher-communities`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { communities?: SwitcherCommunity[] }) =>
        setState({ status: "ready", communities: data.communities ?? [] })
      )
      .catch(() => setState({ status: "error" }));
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label="Switch community"
        className="flex min-w-0 items-center gap-1 rounded-md py-1 pr-1.5 hover:bg-[#F0F0F0]"
      >
        <span className="min-w-0 truncate text-sm font-semibold text-[#202124]">
          {currentGroupName}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#6B6875]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {state.status === "idle" || state.status === "loading" ? (
          <div className="flex items-center justify-center gap-2 px-2 py-3 text-sm text-[#909090]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : state.status === "error" ? (
          <p className="px-2 py-3 text-sm text-[#909090]">
            Couldn&rsquo;t load your communities.
          </p>
        ) : state.communities.length === 0 ? (
          <p className="px-2 py-3 text-sm text-[#909090]">
            No other communities yet.
          </p>
        ) : (
          state.communities.map((c) => {
            const isCurrent =
              c.subAccountId === saId && c.groupId === currentGroupId;
            const row = (
              <>
                <SwitcherRowIcon logoUrl={c.logoUrl} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {isCurrent && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-[#202124]" />
                )}
              </>
            );
            const key = `${c.subAccountId}:${c.groupId}`;
            // Current community: shown for orientation, not clickable —
            // re-navigating to where you already are isn't a real action.
            if (isCurrent) {
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm font-medium"
                >
                  {row}
                </div>
              );
            }
            // Same sub-account: a normal same-origin page, client router is
            // safe. Different sub-account: the visitor's ls_member_session
            // is scoped to THIS sub-account only — a real navigation
            // through the bridge chain is required to mint a fresh one for
            // the target. See communityCrossTenantSwitchHref's doc comment.
            return c.subAccountId === saId ? (
              <DropdownMenuItem
                key={key}
                render={<Link href={communityHomeHref(linkBase, c.slug)} />}
                className="gap-2"
              >
                {row}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={key}
                render={
                  <a
                    href={communityCrossTenantSwitchHref(
                      c.subAccountId,
                      c.href
                    )}
                  />
                }
                className="gap-2"
              >
                {row}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a href={myCommunitiesHref} />}>
          My Communities
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
