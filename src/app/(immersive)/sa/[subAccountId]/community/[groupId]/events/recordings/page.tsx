import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { CommunityShell } from "@/components/community/community-shell";
import { CommunityRecordingsView } from "@/components/community/community-recordings-view";
import type { AuthorView } from "@/types/community";
export default async function StaffCommunityRecordingsPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/events/recordings`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const viewer: AuthorView = {
    memberId: access.member.id,
    displayName:
      access.member.displayName?.trim() ||
      access.member.email.split("@")[0] ||
      "Member",
    avatarUrl: access.member.avatarUrl,
    level: access.membership.level,
  };
  const base = `/sa/${saId}/community/${groupId}/events`;
  return (
    <CommunityShell
      saId={saId}
      group={access.group}
      active="events"
      viewer={viewer}
      viewerIsModerator={access.membership.role === "moderator"}
      staffGroupId={groupId}
      embedded={false}
    >
      <CommunityRecordingsView eventsHref={base} />
    </CommunityShell>
  );
}
