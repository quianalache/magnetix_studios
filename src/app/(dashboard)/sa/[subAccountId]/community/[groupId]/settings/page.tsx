import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
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
 * Staff Community-in-CRM — Settings → General. Close mirror of
 * /c/[saId]/[groupSlug]/settings/page.tsx, incl. the same moderator-role
 * re-check (`requireStaffGroupPageAccess` only re-verifies group
 * membership/access — it does NOT weaken the moderator check, which stays
 * independent here exactly as on the member-facing route) and the same
 * Timestamp-class-instance fix (`group`'s createdAt/updatedAt nulled out —
 * SettingsWorkspace never reads either field). See the Staff Community
 * Integration report.
 */
export default async function StaffCommunitySettingsPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/settings`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership, gate } = access;
  void gate;
  if (membership.role !== "moderator") notFound();

  // Displays the group's PUBLIC slug URL prefix (custom domain if verified,
  // else the platform's opaque origin) — always resolved the same way as
  // the member-facing Settings page, regardless of the CRM's own host, so
  // it never shows the staff route's own /sa/... path here by mistake.
  const host = (await headers()).get("host");
  const { origin } = await resolveCommunityRequestOrigin(saId, host);
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
      group={group}
      active="settings"
      viewer={viewer}
      viewerIsModerator
      staffGroupId={groupId}
    >
      <SettingsWorkspace
        saId={saId}
        pretty={false}
        staffGroupId={groupId}
        groupId={group.id}
        group={{ ...group, createdAt: null, updatedAt: null }}
        brand={brand}
        memberCount={memberCount}
        onlineCount={onlineCount}
        adminCount={adminCount}
        domainPrefix={domainPrefix}
        canonicalUrl={`${origin}/c/${saId}/${group.slug}`}
      />
    </CommunityShell>
  );
}
