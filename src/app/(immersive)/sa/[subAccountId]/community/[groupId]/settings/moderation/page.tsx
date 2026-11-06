import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { ModerationWorkspace } from "@/components/community/settings/moderation-workspace";
import { listModerationReports } from "@/lib/server/community-moderation-service";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

function serialize<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export default async function StaffCommunityModerationSettingsPage({ params }: { params: Promise<{ subAccountId: string; groupId: string }> }) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(saId, groupId, `/sa/${saId}/community/${groupId}/settings/moderation`);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const { group, member, membership, gate } = access;
  void gate;
  if (membership.role !== "moderator") notFound();
  const viewer: AuthorView = { memberId: member.id, displayName: member.displayName?.trim() || member.email.split("@")[0] || "Member", avatarUrl: member.avatarUrl, level: membership.level };
  return <CommunityShell saId={saId} group={group} active="settings" viewer={viewer} viewerIsModerator staffGroupId={groupId} embedded={false}>
    <ModerationWorkspace saId={saId} groupId={group.id} groupSlug={group.slug} brand={group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND} initialEnabled={group.memberReportingEnabled !== false} initialReports={serialize(await listModerationReports(saId, group.id))} />
  </CommunityShell>;
}
