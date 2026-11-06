import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { CommunityShell, COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { CommunityHomeWorkspace } from "@/components/community/settings/community-home-workspace";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

export default async function StaffCommunityHomeSettingsPage({ params }: { params: Promise<{ subAccountId: string; groupId: string }> }) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(saId, groupId, `/sa/${saId}/community/${groupId}/settings/home`);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const { group, member, membership, gate } = access;
  void gate;
  if (membership.role !== "moderator") notFound();
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = { memberId: member.id, displayName: member.displayName?.trim() || member.email.split("@")[0] || "Member", avatarUrl: member.avatarUrl, level: membership.level };
  const homeGroup = { slug: group.slug, guidelinesHtml: group.guidelinesHtml ?? "", links: group.links ?? [], sidebarCards: group.sidebarCards ?? [] };
  return <CommunityShell saId={saId} group={group} active="settings" viewer={viewer} viewerIsModerator staffGroupId={groupId} embedded={false}><CommunityHomeWorkspace saId={saId} staffGroupId={groupId} groupId={group.id} group={homeGroup} brand={brand} /></CommunityShell>;
}
