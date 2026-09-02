import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { listMemberDirectory } from "@/lib/server/community-leaderboard-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  MembersDirectory,
  type DirectoryRow,
} from "@/components/community/members-directory";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM — Members directory (real member-facing directory,
 * incl. DM launcher). Close mirror of /c/[saId]/[groupSlug]/members/page.tsx.
 *
 * Deliberately at a DIFFERENT path than the pre-existing legacy roster page
 * at /sa/[subAccountId]/community/[groupId]/members (approve/ban actions,
 * kept untouched at its original path) — see the Staff Community Integration
 * report for why the two were not merged.
 */
export default async function StaffMembersDirectoryPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/members-directory`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const rows = (await listMemberDirectory({
    subAccountId: saId,
    groupId: group.id,
  })) as DirectoryRow[];

  const accessLabel = group.access === "paid" ? "Lifetime access" : "Free";

  return (
    <CommunityShell
      saId={saId}
      group={group}
      active="members"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      staffGroupId={groupId}
      embedded={false}
    >
      <MembersDirectory
        saId={saId}
        groupId={group.id}
        brand={brand}
        accessLabel={accessLabel}
        viewerMemberId={member.id}
        viewerIsModerator={membership.role === "moderator"}
        initialRows={rows}
      />
    </CommunityShell>
  );
}
