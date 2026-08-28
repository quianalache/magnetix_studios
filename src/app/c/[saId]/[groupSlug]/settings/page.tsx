import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { resolveCommunityRequestOrigin } from "@/lib/community/domain";
import { listMemberDirectory } from "@/lib/server/community-leaderboard-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { SettingsWorkspace } from "@/components/community/settings/settings-workspace";
import type { AuthorView } from "@/types/community";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export const dynamic = "force-dynamic";

/**
 * Community Settings → General. Admin-only: authorization is NOT the nav
 * item being hidden (that's just UX) — this page independently re-verifies
 * the viewer via the same `requireGroupPageAccess` every other member page
 * uses (real session + active membership), then additionally requires
 * `membership.role === "moderator"`, the existing in-community admin
 * concept (see the members-promote route). A non-moderator hitting this URL
 * directly gets `notFound()`, same as any other access-denied case in this
 * codebase — no separate/second admin system.
 */
export default async function CommunitySettingsPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership, gate } = access;
  void gate;
  if (membership.role !== "moderator") notFound();

  const host = (await headers()).get("host");
  const { pretty, origin } = await resolveCommunityRequestOrigin(saId, host);
  const domainPrefix = origin.replace(/^https?:\/\//, "");

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const directory = await listMemberDirectory({
    subAccountId: saId,
    groupId: group.id,
  });
  const now = Date.now();
  const activeMembers = directory.filter((r) => r.status === "active");
  const isOnline = (ms: number | null) => !!ms && now - ms < ONLINE_WINDOW_MS;
  const memberCount = activeMembers.length;
  const onlineCount = activeMembers.filter((r) =>
    isOnline(r.lastSeenAtMs)
  ).length;
  const adminCount = activeMembers.filter((r) => r.role === "moderator").length;

  return (
    <CommunityShell
      saId={saId}
      pretty={pretty}
      group={group}
      active="settings"
      viewer={viewer}
      viewerIsModerator
    >
      <SettingsWorkspace
        saId={saId}
        pretty={pretty}
        groupId={group.id}
        // `group`'s `createdAt`/`updatedAt` are raw Firestore Admin SDK
        // Timestamp CLASS instances, not plain objects — React's Server->
        // Client Component boundary rejects those outright ("Only plain
        // objects... Classes... are not supported"), which is exactly
        // what was crashing this page for every real visitor. `CommunityShell`
        // above never hits this: it has no "use client" directive, so
        // passing it the real `group` never crosses that boundary at all.
        // `SettingsWorkspace` does (it's "use client") and never actually
        // reads either field (see stateFromGroup) — nulling them out here
        // is honest, not a lossy workaround, and needs no type change
        // since CommunityGroup already allows `Timestamp | FieldValue | null`.
        group={{ ...group, createdAt: null, updatedAt: null }}
        brand={brand}
        memberCount={memberCount}
        onlineCount={onlineCount}
        adminCount={adminCount}
        domainPrefix={domainPrefix}
        canonicalUrl={`${origin}${pretty ? `/communities/${group.slug}/about` : `/${group.slug}`}`}
      />
    </CommunityShell>
  );
}
