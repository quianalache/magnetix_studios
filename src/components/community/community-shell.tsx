import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthorView, CommunityGroup, NavItemKey } from "@/types/community";
import {
  communityAboutHref,
  communityHomeHref,
  communityLeaderboardHref,
  communityLearningHref,
  communityMembersHref,
  communityProfileHref,
  communitySettingsHref,
} from "@/lib/community/routes";
import { getVisibleNavItems, normalizeNavigation } from "@/lib/community/community-navigation";
import { MemberAvatar } from "./member-avatar";
import { DmLauncher } from "./dm/dm-launcher";

export const COMMUNITY_BG = "#F8F7F5";
export const COMMUNITY_DEFAULT_BRAND = "#202124";

export type CommunityTab =
  | "community"
  | "classroom"
  | "events"
  | "members"
  | "leaderboards"
  | "about"
  | "settings";

/**
 * Skool-style group shell: a thin top bar with the group name + horizontal tab
 * row, a center content column, and an optional right rail. Brand-themed —
 * the active tab + accents use the group's `brandColor`, not Skool amber.
 * Server component (no client state needed); sign-out is a form POST.
 */
export function CommunityShell({
  saId,
  pretty = false,
  group,
  active,
  viewer,
  /**
   * Gates the "Settings" nav entry — real authorization happens server-side
   * (the `/settings` route re-checks `membership.role === "moderator"`
   * itself, per the "don't treat hiding the nav as security" instruction).
   * This prop only controls whether the link is rendered at all. Optional +
   * defaults to false so every pre-existing call site that doesn't pass it
   * keeps behaving exactly as before (no Settings link shown).
   */
  viewerIsModerator = false,
  children,
  rightRail,
  staffGroupId,
}: {
  saId: string;
  /** True when serving `saId`'s own verified custom domain — see domain.ts. Defaults to false so every pre-existing opaque call site keeps working unchanged. */
  pretty?: boolean;
  group: CommunityGroup;
  active: CommunityTab;
  viewer: AuthorView;
  viewerIsModerator?: boolean;
  children: ReactNode;
  rightRail?: ReactNode;
  /**
   * Staff Community-in-CRM integration (2026-08-24). When set (the
   * group's real id), this renders EMBEDDED inside the CRM's own shell
   * instead of as a full standalone page: no `min-h-screen` background
   * wrapper (the CRM dashboard layout already provides the page frame),
   * and no member "Sign out" form (the CRM has its own, signing out of
   * Community specifically would be a confusing, meaningless action for
   * a staff visitor mid-CRM-session). Every internal tab/Settings link
   * automatically resolves to the staff route shape too — see
   * `CommunityLinkBase.staffGroupId` in routes.ts, the single place that
   * mapping lives, so no link here needed to change individually. Adds
   * one staff-only action, "View as Member", opening the real standalone
   * branded experience in a new tab via the existing Staff -> Member
   * bridge — the intentional, explicit place to leave the CRM shell.
   */
  staffGroupId?: string;
}) {
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const linkBase = { saId, pretty, staffGroupId };
  const about = communityAboutHref(linkBase, group.slug);
  // Route builders per key never change based on the admin's custom label
  // (Part 16 of the Navigation task: "do not turn label customization into
  // route customization") — only which keys appear, their label, and their
  // order come from the saved config.
  const HREF_BY_KEY: Record<NavItemKey, string | undefined> = {
    community: communityHomeHref(linkBase, group.slug),
    classroom: communityLearningHref(linkBase, group.slug),
    // Events has no built page in either route tree yet — stays a
    // permanently inert tab regardless of its saved visibility/order, same
    // as before the Navigation settings page existed.
    events: undefined,
    members: communityMembersHref(linkBase, group.slug),
    leaderboards: communityLeaderboardHref(linkBase, group.slug),
    about,
  };
  const navItems = getVisibleNavItems(normalizeNavigation(group.navigation), {
    isModerator: viewerIsModerator,
  });
  const tabs: { key: CommunityTab; label: string; href?: string; disabled?: boolean }[] = navItems.map(
    (item) => ({
      key: item.key,
      label: item.label,
      href: HREF_BY_KEY[item.key],
      disabled: HREF_BY_KEY[item.key] === undefined,
    }),
  );

  const headerRow = (
    <div className={cn("flex h-14 items-center gap-4 px-4 md:px-6", !staffGroupId && "mx-auto max-w-7xl")}>
      <Link
        href={about}
        className="truncate text-sm font-semibold text-[#202124]"
      >
        {group.name}
      </Link>
      <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            t.disabled ? (
              <span
                key={t.key}
                aria-disabled="true"
                className="cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground/55"
              >
                {t.label}
              </span>
            ) : (
              <Link
                key={t.key}
                href={t.href!}
                className="border-b-2 px-3 py-2 text-sm font-medium transition-colors"
                style={
                  isActive
                    ? { borderColor: brand, color: "var(--foreground)" }
                    : { borderColor: "transparent", color: "var(--muted-foreground)" }
                }
              >
                {t.label}
              </Link>
            )
          );
        })}
      </nav>
      <div className="flex items-center gap-2">
        {viewerIsModerator && (
          <Link
            href={communitySettingsHref(linkBase, group.slug)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
            style={
              active === "settings"
                ? { borderColor: brand, color: brand, backgroundColor: `${brand}14` }
                : { borderColor: "#E4E4E4", color: "#3a3a44" }
            }
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Link>
        )}
        <DmLauncher saId={saId} viewerId={viewer.memberId} brand={brand} />
        {staffGroupId ? (
          // The intentional, explicit place to leave the CRM shell — see
          // the doc comment above. New tab so the owner keeps their CRM
          // workspace exactly where they left it.
          <a
            href={`/api/sub-accounts/${saId}/community/${staffGroupId}/enter`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-[#E4E4E4] px-3 py-1.5 text-sm font-medium text-[#3a3a44] hover:bg-muted"
            title="Open the standalone member-facing Community in a new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View as Member
          </a>
        ) : (
          <>
            <Link href={communityProfileHref(linkBase, group.slug)} title="Your profile">
              <MemberAvatar author={viewer} size={28} brand={brand} />
            </Link>
            <form action={`/api/community/${saId}/logout`} method="post">
              <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
                Sign out
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );

  const mainContent = (
    <div
      className={cn(
        "gap-6",
        staffGroupId ? "py-4" : "mx-auto max-w-7xl px-4 py-6 md:px-6",
        rightRail !== undefined && "grid md:grid-cols-[1fr_320px]",
      )}
    >
      <div className="min-w-0">{children}</div>
      {rightRail !== undefined && (
        <aside className="hidden md:block">
          <div className="space-y-4 md:sticky md:top-6">{rightRail}</div>
        </aside>
      )}
    </div>
  );

  if (staffGroupId) {
    // Embedded: no min-h-screen page wrapper (the CRM dashboard layout's
    // own <main> already provides that), no member Sign-out form — just
    // the Community sub-nav + content, styled to sit inside the CRM's
    // existing content card. No CSS scoping class needed here (unlike
    // MomentumOS's Content Library, which overrides shared theme custom
    // properties) — Community's own components are styled with hardcoded
    // hex values throughout, not this app's `--background`/`--foreground`
    // tokens, so they're already visually self-contained regardless of
    // which CRM theme (light/dark) is active around them.
    return (
      <div className="overflow-hidden rounded-xl border border-border" style={{ backgroundColor: COMMUNITY_BG }}>
        <header className="border-b border-border bg-card">{headerRow}</header>
        {mainContent}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ backgroundColor: COMMUNITY_BG }}>
      <header className="border-b border-border bg-card">{headerRow}</header>
      {mainContent}
    </div>
  );
}
