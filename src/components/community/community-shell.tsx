import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthorView, CommunityGroup, NavItemKey } from "@/types/community";
import {
  communityAboutHref,
  communityEventsHref,
  communityHomeHref,
  communityLeaderboardHref,
  communityLearningHref,
  communityMembersHref,
  communityProfileHref,
  communitySettingsHref,
} from "@/lib/community/routes";
import { getVisibleNavItems, normalizeNavigation } from "@/lib/community/community-navigation";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import { MemberAvatar } from "./member-avatar";
import { DmLauncher } from "./dm/dm-launcher";
import {
  communityThemeStyle,
  resolveCommunityThemeColors,
} from "@/lib/community/community-theme-presets";

export const COMMUNITY_BG = "#F8F7F5";
export const COMMUNITY_DEFAULT_BRAND = "#202124";

export type CommunityTab =
  | "community"
  | "classroom"
  | "events"
  | "members"
  | "leaderboards"
  | "about"
  | "settings"
  // Not a nav-strip destination (no NavItemKey named "profile"), so no tab
  // is ever falsely highlighted for it — just a valid `active` value for
  // the staff-shell profile editor page.
  | "profile";

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
  // Theme parity fix (2026-08-29) — resolved from the SAME shared resolver
  // Branding's live preview is built from, instead of reading `brandColor`
  // directly here. For a group with no `theme` configured this resolves to
  // the exact same value `brandColor` always held (zero visual change);
  // for a group WITH a saved theme, `primary` here is now guaranteed to be
  // byte-identical to what the preview showed for Primary/Brand when it
  // was saved — see resolveCommunityTheme's own doc comment.
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
  const linkBase = { saId, pretty, staffGroupId };
  const about = communityAboutHref(linkBase, group.slug);
  // Route builders per key never change based on the admin's custom label
  // (Part 16 of the Navigation task: "do not turn label customization into
  // route customization") — only which keys appear, their label, and their
  // order come from the saved config.
  const HREF_BY_KEY: Record<NavItemKey, string | undefined> = {
    community: communityHomeHref(linkBase, group.slug),
    classroom: communityLearningHref(linkBase, group.slug),
    events: communityEventsHref(linkBase, group.slug),
    members: communityMembersHref(linkBase, group.slug),
    leaderboards: communityLeaderboardHref(linkBase, group.slug),
    about,
  };
  const navItems = getVisibleNavItems(normalizeNavigation(group.navigation), {
    isModerator: viewerIsModerator,
  });
  const tabs: {
    key: CommunityTab;
    label: string;
    href?: string;
    disabled?: boolean;
  }[] = navItems.map((item) => ({
    key: item.key,
    label: item.label,
    href: HREF_BY_KEY[item.key],
    disabled: HREF_BY_KEY[item.key] === undefined,
  }));

  // Mobile header layout (root cause of the pre-existing clientWidth:0 tab-
  // strip bug, found + fixed 2026-08-24): the original markup was a single
  // flex row of THREE items (name, flex-1 tab nav, trailing actions). Only
  // the name (`truncate`) and the nav (`overflow-x-auto`) get their CSS
  // automatic min-width reset to 0 — the actions group had no `overflow`
  // set, so it kept `min-width: auto` (= its full, unshrinkable content
  // width). On a ~390px viewport the actions group's own unshrinkable
  // width (Settings pill + message icon + a wide staff-only "View as
  // Member" pill) already consumed most of the row, and because the flex-1
  // nav's flex-basis starts at 0% while the name's starts at its natural
  // width, the browser's shrink-distribution math forced nearly ALL the
  // deficit onto the nav — collapsing it to a literal 0px box, not just a
  // narrow one. Confirmed identical on the untouched member-facing route,
  // so this predates the staff integration; not introduced by it.
  //
  // Fix: a 2-row CSS grid below `md`. Row 1 = name + actions (icon-only on
  // mobile, text returns at `md:`); row 2 = the tab nav at the row's FULL
  // width, so it's never negotiating space against the actions group at
  // all — it gets a real, bounded, always-nonzero track and scrolls
  // locally within it. At `md:` and up, the same three elements collapse
  // back into the original single-row layout (name, flex nav, actions) via
  // explicit column/row placement — desktop is visually unchanged.
  const headerRow = (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2",
        "md:h-14 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-4 md:px-4 md:py-0 lg:px-6",
        !staffGroupId && "md:mx-auto md:max-w-7xl"
      )}
    >
      <Link
        href={about}
        className="min-w-0 truncate text-sm font-semibold text-[#202124]"
      >
        {group.name}
      </Link>

      <div className="flex items-center gap-1 md:order-3 md:col-start-3 md:row-start-1 md:gap-2">
        {viewerIsModerator && (
          <Link
            href={communitySettingsHref(linkBase, group.slug)}
            aria-label="Settings"
            className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors md:px-3"
            style={
              active === "settings"
                ? {
                    borderColor: brand,
                    color: brand,
                    backgroundColor: `${brand}14`,
                  }
                : { borderColor: "#E4E4E4", color: "#3a3a44" }
            }
          >
            <Settings className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Settings</span>
          </Link>
        )}
        <DmLauncher
          saId={saId}
          viewerId={viewer.memberId}
          brand={brand}
          primaryAction={resolvedTheme.primaryAction}
          accent={resolvedTheme.accent}
        />
        {staffGroupId ? (
          <>
            <Link
              href={communityProfileHref(linkBase, group.slug)}
              title="Your profile"
              aria-label="Your profile"
            >
              <MemberAvatar author={viewer} size={28} brand={brand} />
            </Link>
            {/* The intentional, explicit place to leave the CRM shell — see
                the doc comment above. New tab so the owner keeps their CRM
                workspace exactly where they left it. */}
            <a
              href={`/api/sub-accounts/${saId}/community/${staffGroupId}/enter`}
              target="_blank"
              rel="noreferrer"
              aria-label="View as Member — open the standalone member-facing Community in a new tab"
              title="Open the standalone member-facing Community in a new tab"
              className="hover:bg-muted flex items-center gap-1.5 rounded-md border border-[#E4E4E4] px-2 py-1.5 text-sm font-medium text-[#3a3a44] md:px-3"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">View as Member</span>
            </a>
          </>
        ) : (
          <>
            <Link
              href={communityProfileHref(linkBase, group.slug)}
              title="Your profile"
              aria-label="Your profile"
            >
              <MemberAvatar author={viewer} size={28} brand={brand} />
            </Link>
            <form action={`/api/community/${saId}/logout`} method="post">
              <button
                type="submit"
                title="Sign out"
                aria-label="Sign out"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md p-1.5 text-xs hover:bg-[#F0F0F0] md:px-2"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            </form>
          </>
        )}
      </div>

      <nav className="col-span-2 row-start-2 flex min-w-0 items-center gap-1 overflow-x-auto md:order-2 md:col-span-1 md:col-start-2 md:row-start-1">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return t.disabled ? (
            <span
              key={t.key}
              aria-disabled="true"
              className="text-muted-foreground/55 shrink-0 cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-sm font-medium"
            >
              {t.label}
            </span>
          ) : (
            <Link
              key={t.key}
              href={t.href!}
              className="shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
              style={
                isActive
                  ? { borderColor: brand, color: "var(--community-text)" }
                  : {
                      borderColor: "transparent",
                      color: "var(--community-text-muted)",
                    }
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  const mainContent = (
    <div
      className={cn(
        "gap-6",
        staffGroupId ? "py-4" : "mx-auto max-w-7xl px-4 py-6 md:px-6",
        rightRail !== undefined && "grid md:grid-cols-[1fr_320px]"
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
      <div
        className="community-theme border-border overflow-hidden rounded-xl border"
        style={themeStyle}
      >
        <header className="border-border bg-card border-b">{headerRow}</header>
        {mainContent}
      </div>
    );
  }

  return (
    <div
      className="community-theme bg-background text-foreground min-h-screen"
      style={themeStyle}
    >
      <header className="border-border bg-card border-b">{headerRow}</header>
      {mainContent}
    </div>
  );
}
