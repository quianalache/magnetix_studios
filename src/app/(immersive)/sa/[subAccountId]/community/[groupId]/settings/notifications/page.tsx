import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { NotificationsWorkspace } from "@/components/community/settings/notifications-workspace";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

export default async function StaffCommunityNotificationsSettingsPage({ params }: { params: Promise<{ subAccountId: string; groupId: string }> }) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(saId, groupId, `/sa/${saId}/community/${groupId}/settings/notifications`);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const { group, member, membership, gate } = access;
  void gate;
  if (membership.role !== "moderator") notFound();
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = { memberId: member.id, displayName: member.displayName?.trim() || member.email.split("@")[0] || "Member", avatarUrl: member.avatarUrl, level: membership.level };
  return <CommunityShell saId={saId} group={group} active="settings" viewer={viewer} viewerIsModerator staffGroupId={groupId} embedded={false}>
    <NotificationsWorkspace saId={saId} staffGroupId={groupId} groupId={group.id} groupSlug={group.slug} brand={brand} />
  </CommunityShell>;
}
