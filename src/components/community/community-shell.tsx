import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AuthorView, CommunityGroup } from "@/types/community";
import {
  communityAboutHref,
  communityHomeHref,
  communityLeaderboardHref,
  communityLearningHref,
  communityMembersHref,
  communityProfileHref,
} from "@/lib/community/routes";
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
  | "about";

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
  children,
  rightRail,
}: {
  saId: string;
  /** True when serving `saId`'s own verified custom domain — see domain.ts. Defaults to false so every pre-existing opaque call site keeps working unchanged. */
  pretty?: boolean;
  group: CommunityGroup;
  active: CommunityTab;
  viewer: AuthorView;
  children: ReactNode;
  rightRail?: ReactNode;
}) {
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const linkBase = { saId, pretty };
  const about = communityAboutHref(linkBase, group.slug);
  const tabs: { key: CommunityTab; label: string; href?: string; disabled?: boolean }[] = [
    { key: "community", label: "Community", href: communityHomeHref(linkBase, group.slug) },
    { key: "classroom", label: "Classroom", href: communityLearningHref(linkBase, group.slug) },
    { key: "events", label: "Events", disabled: true },
    { key: "members", label: "Members", href: communityMembersHref(linkBase, group.slug) },
    { key: "leaderboards", label: "Leaderboard", href: communityLeaderboardHref(linkBase, group.slug) },
    { key: "about", label: "About", href: about },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ backgroundColor: COMMUNITY_BG }}>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 md:px-6">
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
            <DmLauncher saId={saId} viewerId={viewer.memberId} brand={brand} />
            <Link href={communityProfileHref(linkBase, group.slug)} title="Your profile">
              <MemberAvatar author={viewer} size={28} brand={brand} />
            </Link>
            <form action={`/api/community/${saId}/logout`} method="post">
              <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto max-w-7xl gap-6 px-4 py-6 md:px-6",
          rightRail !== undefined && "grid md:grid-cols-[1fr_320px]",
        )}
      >
        <div className="min-w-0">{children}</div>
        {rightRail !== undefined && (
          <aside className="hidden md:block">
            <div className="space-y-4 md:sticky md:top-6">{rightRail}</div>
          </aside>
        )}
      </main>
    </div>
  );
}
