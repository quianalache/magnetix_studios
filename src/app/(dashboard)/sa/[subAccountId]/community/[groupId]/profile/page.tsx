import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import {
  CommunityShell,
  COMMUNITY_BG,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { ProfileEditor } from "@/components/community/profile-editor";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Staff Community-in-CRM — profile editor. Close mirror of
 * /c/[saId]/[groupSlug]/profile/page.tsx: same `ProfileEditor` component,
 * same `Member` doc, same `/api/community/[saId]/profile` + `/avatar` +
 * `MemberPasswordManager` endpoints — nothing staff-specific in the form
 * itself. Only the shell + the "Back to community" href are staff-aware.
 * See the Staff Community Integration navigation cleanup report.
 */
export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(saId, groupId, `/sa/${saId}/community/${groupId}/profile`);
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

  return (
    <CommunityShell
      saId={saId}
      group={group}
      active="profile"
      viewer={viewer}
      viewerIsModerator={membership.role === "moderator"}
      staffGroupId={groupId}
    >
      <div style={{ backgroundColor: COMMUNITY_BG }} className="-m-4 p-4 md:-m-6 md:p-6">
        <ProfileEditor
          saId={saId}
          staffGroupId={groupId}
          groupSlug={group.slug}
          brand={brand}
          initial={{
            displayName:
              member.displayName?.trim() || member.email.split("@")[0] || "",
            avatarUrl: member.avatarUrl,
            bio: member.bio ?? "",
            email: member.email,
            hasPassword: Boolean(member.passwordHash),
          }}
        />
      </div>
    </CommunityShell>
  );
}
